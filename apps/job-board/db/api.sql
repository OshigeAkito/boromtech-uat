-- api.sql — the whole server. Re-applied in full on every deploy, in ONE transaction (psql -1), after
-- migrations. It owns:
--   lib   the state machine, guards, argument parsing, read projections, error table
--   cmd   one function per command: cmd.<name>(me app.members, args jsonb) returns jsonb
--         The set of functions in this schema IS the command list (gate.call resolves by name).
--   gate  the transport surface: exactly three SECURITY DEFINER functions, the only things bt_gateway
--         can execute. Everything else runs inside them with the owner's privileges.
--
-- Dropping and re-creating these schemas each deploy means the database always equals this file:
-- a function deleted here is deleted in prod. No `create or replace` drift.
--
-- Adding a command = add `cmd.<name>` below + a key in packages/domain/src/commands.ts. Nothing else.
-- (contract.test.ts fails CI if those two lists disagree.)

drop schema if exists gate cascade;
drop schema if exists cmd  cascade;
drop schema if exists lib  cascade;
create schema lib;
create schema cmd;
create schema gate;
revoke all on schema lib, cmd, gate from public;

-- =============================================================================================
-- lib: errors
-- =============================================================================================

-- The one list of error codes and their HTTP status. Mirrored by ERROR_CODES in @boromtech/domain.
create function lib.errors() returns table (code text, http int) immutable language sql as $$
  values ('not_signed_in', 401), ('not_invited', 403), ('email_unverified', 403), ('removed', 403),
         ('not_allowed', 403), ('not_found', 404), ('claim_lost', 409), ('wrong_state', 409),
         ('invalid', 422), ('unknown_command', 400), ('bad_request', 400)
$$;

-- Raise a domain error. SQLSTATE 'BT000' marks "expected, user-facing"; anything else is a bug → 500.
create function lib.fail(p_code text, p_message text default null) returns void language plpgsql as $$
begin
  if not exists (select 1 from lib.errors() e where e.code = p_code) then
    raise exception 'lib.fail: unknown error code %', p_code;          -- typo guard
  end if;
  raise exception using errcode = 'BT000', message = p_code, detail = coalesce(p_message, p_code);
end $$;

create function lib.error_json(p_code text, p_message text) returns jsonb immutable language sql as $$
  select jsonb_build_object('code', p_code, 'message', p_message)
$$;

-- =============================================================================================
-- lib: argument parsing — validate at the boundary, typed locals after
-- =============================================================================================

create function lib.arg_text(args jsonb, key text, max_len int, allow_empty boolean default false)
returns text language plpgsql as $$
declare v text := args ->> key;
begin
  if v is null or coalesce(jsonb_typeof(args -> key), '') <> 'string' then perform lib.fail('invalid', key || ' is required'); end if;
  v := btrim(v);
  if not allow_empty and v = '' then perform lib.fail('invalid', key || ' is empty'); end if;
  if length(v) > max_len then perform lib.fail('invalid', format('%s is longer than %s characters', key, max_len)); end if;
  return v;
end $$;

create function lib.arg_uuid(args jsonb, key text) returns uuid language plpgsql as $$
begin
  if args ->> key is null then perform lib.fail('invalid', key || ' is required'); end if;
  return (args ->> key)::uuid;
exception when invalid_text_representation or null_value_not_allowed then
  perform lib.fail('invalid', key || ' is not an id');
end $$;

create function lib.arg_date(args jsonb, key text) returns date language plpgsql as $$
begin
  if coalesce(args ->> key, '') !~ '^\d{4}-\d{2}-\d{2}$' then perform lib.fail('invalid', key || ' must be YYYY-MM-DD'); end if;
  return (args ->> key)::date;
exception when datetime_field_overflow or invalid_datetime_format then
  perform lib.fail('invalid', key || ' is not a date');
end $$;

create function lib.arg_int(args jsonb, key text, lo int, hi int) returns int language plpgsql as $$
declare v int;
begin
  if coalesce(jsonb_typeof(args -> key), '') <> 'number' then perform lib.fail('invalid', key || ' must be a number'); end if;
  v := (args ->> key)::int;
  if v < lo or v > hi then perform lib.fail('invalid', format('%s must be between %s and %s', key, lo, hi)); end if;
  return v;
exception when invalid_text_representation or numeric_value_out_of_range then
  perform lib.fail('invalid', key || ' must be a whole number');
end $$;

create function lib.normalize_email(raw text) returns text immutable language sql as $$
  select lower(btrim(raw))
$$;

-- =============================================================================================
-- lib: the task state machine — the ONLY copy. Commands enforce it via lib.guard; the read projection
-- exposes it to the client via lib.allowed_actions. (Replaces TS TRANSITIONS + allowedActions.)
-- =============================================================================================

create function lib.transitions()
returns table (action app.task_action, from_status app.task_status[], to_status app.task_status, actor app.actor_kind)
immutable language sql as $$
  values ('claim'::app.task_action, '{open}'::app.task_status[],             'assigned'::app.task_status,  'freelancer'::app.actor_kind),
         ('submit',                 '{assigned,changes}'::app.task_status[], 'submitted'::app.task_status, 'assignee'::app.actor_kind),
         ('approve',                '{submitted}'::app.task_status[],        'approved'::app.task_status,  'admin'::app.actor_kind),
         ('reject',                 '{submitted}'::app.task_status[],        'changes'::app.task_status,   'admin'::app.actor_kind),
         ('pay',                    '{approved}'::app.task_status[],         'paid'::app.task_status,      'admin'::app.actor_kind)
$$;
-- 'freelancer' (not 'member') for claim: admins can no longer claim. Closes the rules/UI gap.

create function lib.actor_ok(me app.members, t app.tasks, k app.actor_kind) returns boolean stable language sql as $$
  select case k
    when 'admin'      then me.role = 'admin'
    when 'freelancer' then me.role = 'freelancer'
    when 'assignee'   then t.assignee_uid is not distinct from me.uid
  end
$$;

create function lib.allowed_actions(me app.members, t app.tasks) returns app.task_action[] stable language sql as $$
  select coalesce(array_agg(tr.action order by tr.action), '{}')
  from lib.transitions() tr
  where t.status = any (tr.from_status) and lib.actor_ok(me, t, tr.actor)
$$;

-- Lock the task and decide whether `me` may perform `p_action` now.
--   next_status  the status the command must write (from the table above — commands never hard-code it)
--   already  true when the task is already where this action would take it *because of this actor*
--            (double-click, retried request with a new id): the command returns the row unchanged.
-- FOR UPDATE is the compare-and-set: of two racing claims, the second blocks here, re-reads the row
-- after the first commits, sees 'assigned' with someone else's uid, and fails with claim_lost.
create function lib.guard(me app.members, p_task uuid, p_action app.task_action,
                          out task app.tasks, out next_status app.task_status, out already boolean)
language plpgsql as $$
declare tr record;
begin
  select * into task from app.tasks where id = p_task for update;
  if not found then perform lib.fail('not_found', 'Task not found'); end if;
  select * into tr from lib.transitions() t where t.action = p_action;
  next_status := tr.to_status;

  already := task.status = tr.to_status and case tr.actor
               when 'freelancer' then task.assignee_uid = me.uid        -- claim: "already mine"
               else lib.actor_ok(me, task, tr.actor) end;
  if already then return; end if;

  if not (task.status = any (tr.from_status)) then
    perform lib.fail(case when p_action = 'claim' then 'claim_lost' else 'wrong_state' end,
                     format('Task is %s', task.status));
  end if;
  if not lib.actor_ok(me, task, tr.actor) then perform lib.fail('not_allowed'); end if;
end $$;

create function lib.require_admin(me app.members) returns void language plpgsql as $$
begin
  if me.role <> 'admin' then perform lib.fail('not_allowed', 'Admins only'); end if;
end $$;

-- =============================================================================================
-- lib: read projections. Visibility policy lives here and only here.
--   members: everyone sees uid/name/photo/role; email only for admins and yourself  (tightened, see rationale)
--   tasks:   everyone sees state, payout, grade, rejections (leaderboard needs them);
--            submission url/note and review feedback only for admins and the assignee (tightened)
--   invites: admins only
-- jobTitle / assigneeName are NOT projected: the client joins them from jobs/members, so a rename can
-- never leave a stale copy on a task row.
-- =============================================================================================

create function lib.ms(ts timestamptz) returns bigint immutable language sql as $$
  select (extract(epoch from ts) * 1000)::bigint
$$;

create function lib.member_json(viewer app.members, m app.members) returns jsonb stable language sql as $$
  select jsonb_build_object(
    'uid', m.uid, 'name', m.name, 'photo', m.photo, 'role', m.role,
    'email', case when viewer.role = 'admin' or viewer.uid = m.uid then m.email end,
    'removed', m.removed_at is not null,
    'version', m.version)
$$;

create function lib.job_json(j app.jobs) returns jsonb stable language sql as $$
  select jsonb_build_object(
    'id', j.id, 'title', j.title, 'customer', j.customer, 'description', j.description,
    'customerDeadline', j.customer_deadline, 'createdAt', lib.ms(j.created_at), 'version', j.version)
$$;

create function lib.task_json(viewer app.members, t app.tasks) returns jsonb stable language sql as $$
  with private as (select viewer.role = 'admin' or t.assignee_uid is not distinct from viewer.uid as ok),
       -- Only the current assignee's reviews: a reopened and reclaimed task must not show the new
       -- assignee someone else's grade or feedback. Same scope as `rejections` below.
       latest  as (select r.* from app.task_reviews r
                    where r.task_id = t.id and r.assignee_uid = t.assignee_uid order by r.id desc limit 1)
  select jsonb_build_object(
    'id', t.id, 'jobId', t.job_id, 'title', t.title, 'description', t.description,
    'payout', t.payout, 'freelancerDeadline', t.freelancer_deadline, 'status', t.status,
    'assigneeUid', t.assignee_uid,
    'submissionUrl',  case when (select ok from private) then t.submission_url end,
    'submissionNote', case when (select ok from private) then t.submission_note end,
    'submittedAt', lib.ms(t.submitted_at),
    'review', (select jsonb_build_object(
                 'verdict', l.verdict, 'grade', coalesce(l.grade, 0),
                 'feedback', case when (select ok from private) then l.feedback end,
                 'at', lib.ms(l.at))
               from latest l),
    'rejections', (select count(*) from app.task_reviews r
                   where r.task_id = t.id and r.verdict = 'changes' and r.assignee_uid = t.assignee_uid),
    'actions', to_jsonb(lib.allowed_actions(viewer, t)),
    'version', t.version)
$$;

create function lib.invite_json(i app.invites) returns jsonb stable language sql as $$
  select jsonb_build_object('email', i.email, 'createdAt', lib.ms(i.created_at),
                            'revoked', i.revoked_at is not null, 'version', i.version)
$$;

-- Everything the viewer may see that changed after `since`, plus the cursor to send next time.
-- ONE statement ⇒ one snapshot ⇒ the cursor and the rows agree (see app.clock for why this is gap-free).
-- Inside a command transaction it also sees that transaction's own writes.
create function lib.changes(viewer app.members, since bigint) returns jsonb stable language sql as $$
  select jsonb_build_object(
    'cursor',  (select v from app.clock),
    'me',      lib.member_json(viewer, viewer),
    'jobs',    coalesce((select jsonb_agg(lib.job_json(j)) from app.jobs j where j.version > since), '[]'),
    'tasks',   coalesce((select jsonb_agg(lib.task_json(viewer, t)) from app.tasks t where t.version > since), '[]'),
    'members', coalesce((select jsonb_agg(lib.member_json(viewer, m)) from app.members m where m.version > since), '[]'),
    'invites', case when viewer.role = 'admin'
                    then coalesce((select jsonb_agg(lib.invite_json(i)) from app.invites i where i.version > since), '[]')
                    else '[]' end)
$$;

-- =============================================================================================
-- lib: sessions
-- =============================================================================================

create function lib.token_hash(p_token text) returns bytea immutable language sql as $$
  select public.digest(p_token, 'sha256')
$$;

-- The live member behind a session token, or NULL. Removed members and expired sessions resolve to NULL.
-- Sliding expiry: extended to 30 days when under 7 days remain (at most one write per ~3 weeks per session).
create function lib.session_member(p_token text) returns app.members language plpgsql as $$
declare m app.members; v_exp timestamptz;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return null; end if;
  select s.expires_at into v_exp from app.sessions s
   where s.token_hash = lib.token_hash(p_token) and s.expires_at > now();
  if v_exp is null then return null; end if;
  select mm.* into m from app.sessions s join app.members mm on mm.uid = s.uid
   where s.token_hash = lib.token_hash(p_token) and mm.removed_at is null;
  if m.uid is not null and v_exp < now() + interval '7 days' then
    update app.sessions set expires_at = now() + interval '30 days' where token_hash = lib.token_hash(p_token);
  end if;
  return m;
end $$;

-- =============================================================================================
-- cmd: one function per command. Signature is fixed: (me app.members, args jsonb) returns jsonb.
-- `me` is already authenticated (gate.call resolved it from the session); never trust ids in args for identity.
-- =============================================================================================

create function cmd.claim_task(me app.members, args jsonb) returns jsonb language plpgsql as $$
declare g record; t app.tasks;
begin
  select * into g from lib.guard(me, lib.arg_uuid(args, 'taskId'), 'claim');
  if g.already then return lib.task_json(me, g.task); end if;
  update app.tasks set status = g.next_status, assignee_uid = me.uid where id = (g.task).id returning * into t;
  return lib.task_json(me, t);
end $$;

create function cmd.submit_task(me app.members, args jsonb) returns jsonb language plpgsql as $$
declare g record; t app.tasks; v_url text; v_note text;
begin
  v_url  := lib.arg_text(args, 'url', 2000);
  v_note := lib.arg_text(args, 'note', 2000, allow_empty => true);
  if v_url !~ '^https?://.+' then perform lib.fail('invalid', 'url must start with http:// or https://'); end if;
  select * into g from lib.guard(me, lib.arg_uuid(args, 'taskId'), 'submit');
  if g.already then return lib.task_json(me, g.task); end if;
  update app.tasks
     set status = g.next_status, submission_url = v_url, submission_note = v_note, submitted_at = now()   -- server time
   where id = (g.task).id returning * into t;
  return lib.task_json(me, t);
end $$;

create function cmd.approve_task(me app.members, args jsonb) returns jsonb language plpgsql as $$
declare g record; t app.tasks; v_grade int; v_feedback text;
begin
  v_grade    := lib.arg_int(args, 'grade', 1, 5);
  v_feedback := lib.arg_text(args, 'feedback', 2000, allow_empty => true);
  select * into g from lib.guard(me, lib.arg_uuid(args, 'taskId'), 'approve');
  if g.already then return lib.task_json(me, g.task); end if;
  insert into app.task_reviews (task_id, assignee_uid, verdict, grade, feedback, reviewer_uid)
  values ((g.task).id, (g.task).assignee_uid, 'approved', v_grade, v_feedback, me.uid);
  update app.tasks set status = g.next_status where id = (g.task).id returning * into t;
  return lib.task_json(me, t);
end $$;

create function cmd.reject_task(me app.members, args jsonb) returns jsonb language plpgsql as $$
declare g record; t app.tasks; v_feedback text;
begin
  v_feedback := lib.arg_text(args, 'feedback', 2000);
  select * into g from lib.guard(me, lib.arg_uuid(args, 'taskId'), 'reject');
  if g.already then return lib.task_json(me, g.task); end if;
  -- "rejections += 1" is this insert: the count is derived (lib.task_json), so it cannot drift or race.
  insert into app.task_reviews (task_id, assignee_uid, verdict, grade, feedback, reviewer_uid)
  values ((g.task).id, (g.task).assignee_uid, 'changes', null, v_feedback, me.uid);
  update app.tasks set status = g.next_status where id = (g.task).id returning * into t;
  return lib.task_json(me, t);
end $$;

create function cmd.pay_task(me app.members, args jsonb) returns jsonb language plpgsql as $$
declare g record; t app.tasks;
begin
  select * into g from lib.guard(me, lib.arg_uuid(args, 'taskId'), 'pay');
  if g.already then return lib.task_json(me, g.task); end if;
  update app.tasks set status = g.next_status, paid_at = now() where id = (g.task).id returning * into t;
  return lib.task_json(me, t);
end $$;

create function cmd.create_job(me app.members, args jsonb) returns jsonb language plpgsql as $$
declare j app.jobs;
begin
  perform lib.require_admin(me);
  insert into app.jobs (title, customer, description, customer_deadline, created_by)
  values (lib.arg_text(args, 'title', 200), lib.arg_text(args, 'customer', 200),
          lib.arg_text(args, 'description', 10000, allow_empty => true), lib.arg_date(args, 'customerDeadline'), me.uid)
  returning * into j;
  return lib.job_json(j);
end $$;

create function cmd.create_task(me app.members, args jsonb) returns jsonb language plpgsql as $$
declare j app.jobs; t app.tasks; v_due date; v_payout int;
begin
  perform lib.require_admin(me);
  select * into j from app.jobs where id = lib.arg_uuid(args, 'jobId');
  if not found then perform lib.fail('not_found', 'Job not found'); end if;
  v_due    := lib.arg_date(args, 'freelancerDeadline');
  v_payout := lib.arg_int(args, 'payout', 0, 10000000);
  if v_due > j.customer_deadline then                                   -- new rule; see open questions
    perform lib.fail('invalid', 'freelancerDeadline is after the client deadline');
  end if;
  insert into app.tasks (job_id, title, description, payout, freelancer_deadline)
  values (j.id, lib.arg_text(args, 'title', 200), lib.arg_text(args, 'description', 10000, allow_empty => true),
          v_payout, v_due)
  returning * into t;
  return lib.task_json(me, t);
end $$;

-- Invite is also how an admin re-admits a removed member (one way to undo a removal).
create function cmd.invite(me app.members, args jsonb) returns jsonb language plpgsql as $$
declare i app.invites; v_email text := lib.normalize_email(lib.arg_text(args, 'email', 320));
begin
  perform lib.require_admin(me);
  insert into app.invites (email, invited_by) values (v_email, me.uid)
  on conflict (email) do update set revoked_at = null, invited_by = excluded.invited_by
  returning * into i;                       -- malformed email: app.invites CHECK → gate.call reports 'invalid'
  update app.members set removed_at = null where email = v_email and removed_at is not null;
  return lib.invite_json(i);
end $$;

create function cmd.revoke_invite(me app.members, args jsonb) returns jsonb language plpgsql as $$
declare v_email text := lib.normalize_email(lib.arg_text(args, 'email', 320));
begin
  perform lib.require_admin(me);
  if exists (select 1 from app.members where email = v_email and removed_at is null) then
    perform lib.fail('wrong_state', 'Already joined; remove the member instead');
  end if;
  update app.invites set revoked_at = now() where email = v_email and revoked_at is null;
  return 'null'::jsonb;                     -- idempotent: revoking a revoked/missing invite is a no-op
end $$;

-- Removes a freelancer: signs them out everywhere, blocks re-enrollment, and returns their in-flight
-- tasks (assigned|changes) to the open pool. Submitted/approved/paid history is kept.
create function cmd.remove_member(me app.members, args jsonb) returns jsonb language plpgsql as $$
declare m app.members;
begin
  perform lib.require_admin(me);
  select * into m from app.members where uid = lib.arg_text(args, 'uid', 255) for update;
  if not found then perform lib.fail('not_found', 'Member not found'); end if;
  if m.role = 'admin' then perform lib.fail('not_allowed', 'Admins cannot be removed here'); end if;
  if m.removed_at is not null then return lib.member_json(me, m); end if;

  update app.members set removed_at = now() where uid = m.uid returning * into m;
  delete from app.sessions where uid = m.uid;
  update app.invites set revoked_at = now() where email = m.email and revoked_at is null;
  update app.tasks
     set status = 'open', assignee_uid = null, submission_url = null, submission_note = null, submitted_at = null
   where assignee_uid = m.uid and status in ('assigned', 'changes');
  return lib.member_json(me, m);
end $$;

-- =============================================================================================
-- gate: the transport surface. SECURITY DEFINER, pinned search_path, everything schema-qualified.
-- These three are the only functions bt_gateway can execute. Each returns a jsonb envelope with
-- an integer `status` the transport copies onto the HTTP response without interpreting anything else.
-- =============================================================================================

-- Sign-in / enrollment. `identity` = claims of a Google id_token the transport verified:
--   { sub, email, email_verified, name, picture }
-- TRUST BOUNDARY: this is the only place Postgres believes the transport about identity. After this,
-- every call carries an opaque 256-bit token that Postgres itself resolves.
-- Returns { status: 200, token, me } or { status: 403, error }.
create function gate.sign_in(identity jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  v_sub      text    := identity ->> 'sub';
  v_email    text    := lib.normalize_email(identity ->> 'email');
  v_verified boolean := coalesce((identity ->> 'email_verified')::boolean, false);
  m app.members; v_role app.role; v_token text;
begin
  if v_sub is null or v_email is null then
    return jsonb_build_object('status', 400, 'error', lib.error_json('bad_request', 'identity incomplete'));
  end if;

  select * into m from app.members where uid = v_sub;
  if found and m.removed_at is not null then
    return jsonb_build_object('status', 403, 'error', lib.error_json('removed', 'This account was removed by an admin'));
  end if;

  if not found then
    -- Invariants 2 + 3. email_verified is now required for both roles (rules only required it for admin).
    if not v_verified then
      return jsonb_build_object('status', 403, 'error', lib.error_json('email_unverified', v_email));
    end if;
    if exists (select 1 from app.admin_allowlist a where a.email = v_email) then
      v_role := 'admin';
    elsif exists (select 1 from app.invites i where i.email = v_email and i.revoked_at is null) then
      v_role := 'freelancer';
    else
      return jsonb_build_object('status', 403, 'error', lib.error_json('not_invited', v_email));
    end if;
    insert into app.members (uid, email, name, photo, role)
    values (v_sub, v_email, coalesce(nullif(btrim(identity ->> 'name'), ''), v_email),
            coalesce(identity ->> 'picture', ''), v_role)
    returning * into m;
    -- Stored role is authoritative from here on; allowlist changes do not demote/promote existing members.
  end if;

  v_token := encode(public.gen_random_bytes(32), 'hex');
  insert into app.sessions (token_hash, uid, expires_at)
  values (lib.token_hash(v_token), m.uid, now() + interval '30 days');
  return jsonb_build_object('status', 200, 'token', v_token, 'me', lib.member_json(m, m));
end $$;

-- Every request after sign-in. body = { since: number, command?: { name, args, requestId } }.
-- Returns lib.changes(me, since) || { status, result, error } — so a poll and a command share one
-- response shape, and a failed command still delivers fresh state (the claim loser sees the winner).
create function gate.call(p_token text, p_body jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  me app.members; v_since bigint; c jsonb; v_name text; v_req uuid;
  v_result jsonb; v_err jsonb; v_code text; v_detail text;
begin
  me := lib.session_member(p_token);
  if me.uid is null then
    return jsonb_build_object('status', 401, 'error', lib.error_json('not_signed_in', 'Sign in again'));
  end if;

  begin
    v_since := coalesce((p_body ->> 'since')::bigint, 0);
  exception when others then
    return jsonb_build_object('status', 400, 'error', lib.error_json('bad_request', 'since must be an integer'));
  end;

  c := p_body -> 'command';
  if c is not null then
    v_name := c ->> 'name';
    begin
      v_req := (c ->> 'requestId')::uuid;
    exception when others then v_req := null;
    end;
    if v_name is null or v_req is null or v_name !~ '^[a-z_]+$'
       or to_regprocedure(format('cmd.%I(app.members,jsonb)', v_name)) is null then
      v_err := lib.error_json('unknown_command', coalesce(v_name, '(none)'));
    else
      select l.result into v_result from app.command_log l where l.request_id = v_req and l.uid = me.uid;
      if not found then
        begin                                                   -- subtransaction: a failed command leaves no writes
          execute format('select cmd.%I($1, $2)', v_name) into v_result using me, coalesce(c -> 'args', '{}'::jsonb);
          insert into app.command_log (request_id, uid, command, args, result)
          values (v_req, me.uid, v_name, coalesce(c -> 'args', '{}'::jsonb), v_result);
        exception
          when sqlstate 'BT000' then
            get stacked diagnostics v_code = message_text, v_detail = pg_exception_detail;
            v_err := lib.error_json(v_code, v_detail);
            v_result := null;
          when check_violation then
            -- A table CHECK caught bad input the arg_* parsers let through (e.g. a malformed email).
            -- Report it as 'invalid' naming the constraint, instead of duplicating every CHECK in lib.arg_*.
            get stacked diagnostics v_detail = constraint_name;
            v_err := lib.error_json('invalid', v_detail);
            v_result := null;
        end;
      end if;
    end if;
  end if;

  return lib.changes(me, v_since) || jsonb_build_object(
    'status', coalesce((select e.http from lib.errors() e where e.code = v_err ->> 'code'), 200),
    'result', v_result,
    'error',  v_err);
end $$;

create function gate.sign_out(p_token text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  delete from app.sessions where token_hash = lib.token_hash(p_token);
  return jsonb_build_object('status', 200);
end $$;

-- =============================================================================================
-- Grants: the whole allowlist for the transport. No table, no lib, no cmd.
-- =============================================================================================
revoke execute on all functions in schema app, lib, cmd, gate from public;   -- app too: a pg_restore re-grants app.stamp() to PUBLIC
grant usage on schema gate to bt_gateway;
grant execute on function gate.sign_in(jsonb), gate.call(text, jsonb), gate.sign_out(text) to bt_gateway;
