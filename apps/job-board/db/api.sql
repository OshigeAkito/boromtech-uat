-- api.sql — the whole server. Re-applied in full on every deploy, in ONE transaction (psql -1), after
-- migrations. It owns:
--   lib   the state machine, guards, argument parsing, read projections, error table
--   cmd   one function per command: cmd.<name>(me app.members, args jsonb) returns jsonb
--         The set of functions in this schema IS the command list (gate.call resolves by name).
--   gate  the transport surface: SECURITY DEFINER functions, the only things bt_gateway (and bt_sweeper, for
--         gate.sweep) can execute. Everything else runs inside them with the owner's privileges. The grants at
--         the bottom and assert_privileges.sql list them; a deploy fails if the two disagree.
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
         ('invalid', 422), ('too_many', 429), ('unknown_command', 400), ('bad_request', 400)
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

-- Envelope for an error caught in a gate.* function other than gate.call (which also carries changes).
create function lib.error_envelope(p_code text, p_detail text) returns jsonb stable language sql as $$
  select jsonb_build_object('status', (select e.http from lib.errors() e where e.code = p_code),
                            'error', lib.error_json(p_code, p_detail))
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

-- =============================================================================================
-- lib: files. Rules, keys, signing specs, visibility: the ONLY copy of each.
--
-- Postgres decides every "may they put or see this object?" and hands the transport a SIGNING SPEC. The
-- transport (Go on Cloud Run) holds the R2 secret, signs whatever spec it is given, and never interprets
-- kinds, parents or roles. Spec shape, produced only here and in gate.sign_in / gate.sweep:
--   { method: PUT|GET|DELETE, key: f/<uuid> or t/<uuid>, ttl: seconds,
--     contentType?, contentLength?, cacheControl?, disposition? }
-- A gate.* envelope may carry presign: { <label>: spec }; the transport replaces it with
-- signed: { <label>: { method, url, headers } }.
-- =============================================================================================

-- Per-kind upload policy. Mirrored by UPLOAD_RULES in @boromtech/domain for the file picker's `accept` and
-- an early size message; contract.test.ts fails CI if they differ. 'transport' = never uploadable by a
-- browser (gate.upload refuses it); the transport writes avatars itself at sign-in.
create function lib.file_rules()
returns table (kind app.file_kind, uploader text, mimes text[], max_bytes int)
immutable language sql as $$
  values ('submission'::app.file_kind, 'assignee',  '{image/jpeg,image/png,application/pdf,application/zip}'::text[], 15 * 1048576),
         ('brief',                     'admin',     '{image/jpeg,image/png,application/pdf}'::text[],                 25 * 1048576),
         ('avatar',                    'transport', '{image/jpeg}'::text[],                                            1048576)
$$;


create function lib.file_key(p_id uuid, p_thumb boolean default false) returns text immutable language sql as $$
  select case when p_thumb then 't/' else 'f/' end || p_id::text
$$;


-- Browser PUT: the exact type, length and Content-MD5 are signed, so storage refuses any other body, and a
-- still-valid URL can only ever write the declared bytes again. Keys are never reused, so cache forever.
create function lib.presign_put(p_key text, p_mime text, p_bytes int, p_md5 text) returns jsonb immutable language sql as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'method', 'PUT', 'key', p_key, 'ttl', 600, 'contentType', p_mime, 'contentLength', p_bytes,
    'contentMD5', p_md5, 'cacheControl', 'private, max-age=31536000, immutable'))
$$;


-- RFC 5987 percent-encoding, so Thai file names survive Content-Disposition.
create function lib.rfc5987(p text) returns text immutable language sql as $$
  select coalesce(string_agg(case when b between 48 and 57 or b between 65 and 90 or b between 97 and 122
                                       or b in (45, 46, 95, 126) then chr(b)
                                  else '%' || upper(lpad(to_hex(b), 2, '0')) end, '' order by i), '')
    from (select i, get_byte(convert_to(p, 'UTF8'), i) as b
            from generate_series(0, octet_length(convert_to(p, 'UTF8')) - 1) i) x
$$;

-- Browser GET. The transport floors the signing time to the hour and signs for `ttl`, so a URL is identical
-- for an hour (the browser caches the bytes) and every URL handed out has at least an hour left. Access
-- outlives revocation by at most ~2 h. Served from R2's own origin, never ours, so a hostile file cannot
-- touch crew.boromtech.com cookies.
create function lib.presign_get(f app.files, p_thumb boolean) returns jsonb immutable language sql as $$
  select jsonb_build_object(
    'method', 'GET', 'key', lib.file_key(f.id, p_thumb), 'ttl', 7200,
    'disposition', case when f.mime like 'image/%' then 'inline' else 'attachment' end
                   || '; filename*=UTF-8''''' || lib.rfc5987(f.name))
$$;

-- "May this viewer see the private part of this task?" — the rule lib.task_json always had, now named so
-- task fields and submission files cannot drift apart.
create function lib.task_private(viewer app.members, t app.tasks) returns boolean stable language sql as $$
  select viewer.role = 'admin' or t.assignee_uid is not distinct from viewer.uid
$$;


-- THE visibility rule for files. Used by every projection that lists files AND by gate.file (the view route),
-- so "listed" and "openable" are the same decision. `viewer` is already a live member (session_member).
create function lib.file_visible(viewer app.members, f app.files) returns boolean stable language sql as $$
  select f.state = 'attached' and f.purged_at is null and case f.kind
    when 'avatar' then true                                         -- every member sees every member's photo
    when 'brief'  then true                                         -- every member sees every job and task
    when 'submission' then exists (
      select 1 from app.tasks t
       where t.id = f.task_id and lib.task_private(viewer, t)
         and (viewer.role = 'admin' or f.uploader_uid = viewer.uid))  -- assignee: only their own round's files
  end
$$;


create function lib.file_json(f app.files) returns jsonb immutable language sql as $$
  select jsonb_build_object('id', f.id, 'kind', f.kind, 'name', f.name, 'mime', f.mime, 'bytes', f.bytes,
                            'width', f.width, 'height', f.height, 'thumb', f.thumb_bytes is not null)
$$;


create function lib.files_json(viewer app.members, p_task uuid, p_job uuid) returns jsonb stable language sql as $$
  select coalesce(jsonb_agg(lib.file_json(f) order by f.attached_at, f.id), '[]')
    from app.files f
   where ((p_task is not null and f.task_id = p_task) or (p_job is not null and f.job_id = p_job))
     and lib.file_visible(viewer, f)
$$;


-- Bump a parent's version so pollers re-fetch its projection (which now embeds files). The stamp trigger
-- does the bump; this UPDATE changes nothing else.
create function lib.touch(p_task uuid, p_job uuid) returns void language sql as $$
  update app.tasks set id = id where id = p_task;
  update app.jobs  set id = id where id = p_job;
$$;


create function lib.arg_uuids(args jsonb, key text, max_n int) returns uuid[] language plpgsql as $$
declare v uuid[];
begin
  if args -> key is null then return '{}'; end if;
  if jsonb_typeof(args -> key) <> 'array' then perform lib.fail('invalid', key || ' must be a list'); end if;
  if jsonb_array_length(args -> key) > max_n then perform lib.fail('invalid', format('at most %s %s', max_n, key)); end if;
  select coalesce(array_agg(distinct x::uuid), '{}') into v from jsonb_array_elements_text(args -> key) x;
  return v;
exception when invalid_text_representation then
  perform lib.fail('invalid', key || ' must be ids');
end $$;


-- Attach the caller's own verified uploads to one parent. Idempotent: a file already attached to this exact
-- parent is skipped, so a retried command (new request id) is a no-op. Does NOT touch the parent; the
-- calling command does (it usually updates the parent anyway).
create function lib.attach(me app.members, p_ids uuid[], p_kind app.file_kind, p_task uuid, p_job uuid)
returns void language plpgsql as $$
declare f app.files; v_id uuid;
begin
  foreach v_id in array p_ids loop
    select * into f from app.files where id = v_id for update;
    if not found or f.uploader_uid <> me.uid then perform lib.fail('not_found', 'File not found'); end if;
    if f.kind <> p_kind then perform lib.fail('invalid', format('%s is not a %s file', f.name, p_kind)); end if;
    continue when f.state = 'attached' and f.task_id is not distinct from p_task and f.job_id is not distinct from p_job;
    -- Only verified uploads attach (gate.upload_done). A day-old one is abandoned; the sweep purges it.
    if f.state <> 'ready' or f.created_at < now() - interval '1 day' then
      perform lib.fail('wrong_state', format('%s can no longer be attached', f.name));
    end if;
    update app.files set state = 'attached', attached_at = now(), task_id = p_task, job_id = p_job where id = v_id;
  end loop;
end $$;


create function lib.ms(ts timestamptz) returns bigint immutable language sql as $$
  select (extract(epoch from ts) * 1000)::bigint
$$;

create function lib.member_json(viewer app.members, m app.members) returns jsonb stable language sql as $$
  select jsonb_build_object(
    'uid', m.uid, 'name', m.name, 'role', m.role,
    'photoId', (select f.id from app.files f
                 where f.kind = 'avatar' and f.member_uid = m.uid and lib.file_visible(viewer, f)),
    'email', case when viewer.role = 'admin' or viewer.uid = m.uid then m.email end,
    'removed', m.removed_at is not null,
    'version', m.version)
$$;

create function lib.job_json(viewer app.members, j app.jobs) returns jsonb stable language sql as $$
  select jsonb_build_object(
    'id', j.id, 'title', j.title, 'customer', j.customer, 'description', j.description,
    'customerDeadline', j.customer_deadline, 'createdAt', lib.ms(j.created_at),
    'files', lib.files_json(viewer, null, j.id),
    'version', j.version)
$$;

create function lib.task_json(viewer app.members, t app.tasks) returns jsonb stable language sql as $$
  with latest as (select r.* from app.task_reviews r
                   where r.task_id = t.id and r.assignee_uid = t.assignee_uid order by r.id desc limit 1)
  select jsonb_build_object(
    'id', t.id, 'jobId', t.job_id, 'title', t.title, 'description', t.description,
    'payout', t.payout, 'freelancerDeadline', t.freelancer_deadline, 'status', t.status,
    'assigneeUid', t.assignee_uid,
    'submissionUrl',  case when lib.task_private(viewer, t) then t.submission_url end,
    'submissionNote', case when lib.task_private(viewer, t) then t.submission_note end,
    'submittedAt', lib.ms(t.submitted_at),
    'files', lib.files_json(viewer, t.id, null),           -- briefs for everyone; submissions per file_visible
    'review', (select jsonb_build_object(
                 'verdict', l.verdict, 'grade', coalesce(l.grade, 0),
                 'feedback', case when lib.task_private(viewer, t) then l.feedback end,
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
    'jobs',    coalesce((select jsonb_agg(lib.job_json(viewer, j)) from app.jobs j where j.version > since), '[]'),
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
declare g record; t app.tasks; v_url text; v_note text; v_files uuid[];
begin
  v_url   := nullif(lib.arg_text(args, 'url', 2000, allow_empty => true), '');
  v_note  := lib.arg_text(args, 'note', 2000, allow_empty => true);
  v_files := lib.arg_uuids(args, 'fileIds', 10);
  if v_url !~ '^https?://.+' then perform lib.fail('invalid', 'url must start with http:// or https://'); end if;
  select * into g from lib.guard(me, lib.arg_uuid(args, 'taskId'), 'submit');
  if g.already then return lib.task_json(me, g.task); end if;
  perform lib.attach(me, v_files, 'submission', (g.task).id, null);
  if v_url is null and not exists (select 1 from app.files f where f.task_id = (g.task).id and f.kind = 'submission'
                                     and f.state = 'attached' and f.uploader_uid = me.uid) then
    perform lib.fail('invalid', 'Add a link or at least one file');
  end if;
  update app.tasks
     set status = g.next_status, submission_url = v_url, submission_note = v_note, submitted_at = now()
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
  return lib.job_json(me, j);
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
declare m app.members; v_reopened uuid[];
begin
  perform lib.require_admin(me);
  select * into m from app.members where uid = lib.arg_text(args, 'uid', 255) for update;
  if not found then perform lib.fail('not_found', 'Member not found'); end if;
  if m.role = 'admin' then perform lib.fail('not_allowed', 'Admins cannot be removed here'); end if;
  if m.removed_at is not null then return lib.member_json(me, m); end if;

  update app.members set removed_at = now() where uid = m.uid returning * into m;
  delete from app.sessions where uid = m.uid;
  update app.invites set revoked_at = now() where email = m.email and revoked_at is null;
  with reopened as (
    update app.tasks
       set status = 'open', assignee_uid = null, submission_url = null, submission_note = null, submitted_at = null
     where assignee_uid = m.uid and status in ('assigned', 'changes')
    returning id)
  select coalesce(array_agg(id), '{}') into v_reopened from reopened;
  -- NEW: their files on the reopened tasks go with them (a 'changes' task may hold a rejected round's files).
  update app.files set state = 'detached', detached_at = now()
   where kind = 'submission' and uploader_uid = m.uid and state = 'attached' and task_id = any (v_reopened);
  return lib.member_json(me, m);
end $$;

create function cmd.attach_files(me app.members, args jsonb) returns jsonb language plpgsql as $$
declare v_task uuid; v_job uuid;
begin
  perform lib.require_admin(me);
  if (args ? 'taskId') = (args ? 'jobId') then perform lib.fail('invalid', 'give exactly one of taskId, jobId'); end if;
  if args ? 'taskId' then
    v_task := lib.arg_uuid(args, 'taskId');
    if not exists (select 1 from app.tasks where id = v_task) then perform lib.fail('not_found', 'Task not found'); end if;
  else
    v_job := lib.arg_uuid(args, 'jobId');
    if not exists (select 1 from app.jobs where id = v_job) then perform lib.fail('not_found', 'Job not found'); end if;
  end if;
  perform lib.attach(me, lib.arg_uuids(args, 'fileIds', 20), 'brief', v_task, v_job);
  perform lib.touch(v_task, v_job);
  return 'null'::jsonb;
end $$;

create function cmd.detach_file(me app.members, args jsonb) returns jsonb language plpgsql as $$
declare f app.files; t app.tasks;
begin
  select * into f from app.files where id = lib.arg_uuid(args, 'fileId') for update;
  if not found then perform lib.fail('not_found', 'File not found'); end if;
  if f.state <> 'attached' then return 'null'::jsonb; end if;                   -- already detached: no-op
  if not lib.file_visible(me, f) then perform lib.fail('not_found', 'File not found'); end if;
  if f.kind = 'avatar' then perform lib.fail('not_allowed'); end if;
  if me.role <> 'admin' then
    select * into t from app.tasks where id = f.task_id;
    if f.kind <> 'submission' or f.uploader_uid <> me.uid or t.assignee_uid is distinct from me.uid
       or t.status not in ('assigned', 'changes') then
      perform lib.fail('not_allowed');
    end if;
  end if;
  update app.files set state = 'detached', detached_at = now() where id = f.id;
  perform lib.touch(f.task_id, f.job_id);
  return 'null'::jsonb;
end $$;

-- =============================================================================================
-- gate: the transport surface. SECURITY DEFINER, pinned search_path, everything schema-qualified.
-- They are the only functions bt_gateway and bt_sweeper can execute. Each returns a jsonb envelope with
-- an integer `status` the transport copies onto the HTTP response without interpreting anything else.
-- =============================================================================================

-- Sign-in / enrollment. `identity` = claims of a Google id_token the transport verified:
--   { sub, email, email_verified, name, picture }
-- TRUST BOUNDARY: this is the only place Postgres believes the transport about identity. After this,
-- every call carries an opaque 256-bit token that Postgres itself resolves.
-- Returns { status: 200, token, me } or { status: 403, error }.
create function lib.avatar_from(m app.members, p_picture text) returns app.files language plpgsql as $$
declare f app.files; v_hash bytea := public.digest(p_picture, 'sha256'); v_prev uuid;
begin
  select id into v_prev from app.files where kind = 'avatar' and member_uid = m.uid and state = 'attached';
  update app.files set state = 'detached', detached_at = now()
   where kind = 'avatar' and member_uid = m.uid and state = 'attached' and source_hash <> v_hash;
  insert into app.files (id, kind, uploader_uid, member_uid, name, mime, source_hash, state, attached_at)
  values (gen_random_uuid(), 'avatar', m.uid, m.uid, 'avatar.jpg', 'image/jpeg', v_hash, 'attached', now())
  on conflict (member_uid, source_hash) where kind = 'avatar'
  do update set state = 'attached', attached_at = coalesce(app.files.attached_at, now()),
                detached_at = null, purged_at = null
  returning * into f;
  if v_prev is distinct from f.id then
    update app.members set photo = p_picture where uid = m.uid;   -- stamp → pollers re-read photoId
  end if;
  return f;
end $$;

create function gate.sign_in(identity jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  v_sub      text    := identity ->> 'sub';
  v_email    text    := lib.normalize_email(identity ->> 'email');
  v_verified boolean := coalesce((identity ->> 'email_verified')::boolean, false);
  v_pic      text    := identity ->> 'picture';
  m app.members; v_role app.role; v_token text; f app.files; v_presign jsonb;
begin
  if v_sub is null or v_email is null then
    return jsonb_build_object('status', 400, 'error', lib.error_json('bad_request', 'identity incomplete'));
  end if;

  select * into m from app.members where uid = v_sub;
  if found and m.removed_at is not null then
    return jsonb_build_object('status', 403, 'error', lib.error_json('removed', 'This account was removed by an admin'));
  end if;

  if not found then
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
    values (v_sub, v_email, coalesce(nullif(btrim(identity ->> 'name'), ''), v_email), '', v_role)
    returning * into m;
  end if;

  -- Avatar: only Google's own image host, and only a sane URL; anything else → no avatar, initials.
  -- The transport copies the picture into R2 only when this sign-in made a new current avatar (first sign-in,
  -- a changed Google picture, or one swept away). If that copy fails the <img> 404s until the picture changes.
  if v_pic ~ '^https://[a-z0-9.-]+\.googleusercontent\.com/[^\s]*$' and length(v_pic) <= 2000
     and not exists (select 1 from app.files a
                      where a.kind = 'avatar' and a.member_uid = m.uid and a.state = 'attached' and a.purged_at is null
                        and a.source_hash = public.digest(v_pic, 'sha256')) then
    f := lib.avatar_from(m, v_pic);
    v_presign := jsonb_build_object('avatar', jsonb_build_object(
      'method', 'PUT', 'key', lib.file_key(f.id), 'ttl', 120, 'contentType', 'image/jpeg',
      'cacheControl', 'private, max-age=31536000, immutable'));
    select * into m from app.members where uid = m.uid;              -- avatar_from may have stamped it
  end if;

  v_token := encode(public.gen_random_bytes(32), 'hex');
  insert into app.sessions (token_hash, uid, expires_at)
  values (lib.token_hash(v_token), m.uid, now() + interval '30 days');
  return jsonb_build_object('status', 200, 'token', v_token, 'me', lib.member_json(m, m))
         || case when v_presign is not null then jsonb_build_object('presign', v_presign) else '{}' end;
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


-- Upload intent. body: { id: uuid (client-chosen), kind, name, mime, bytes, md5, width?, height?,
--                        thumbBytes?, thumbMd5? }   md5 = base64 of the MD5 digest of exactly those bytes.
-- Returns { status: 200, file: { id }, presign: { file: put, thumb?: put } } or an error envelope.
-- Idempotent on id: a retry with the same attributes gets fresh URLs for the same keys.
-- Quota: 50 uploads and 300 MB per member per rolling 24 h (abuse cap, not a product limit).
create function gate.upload(p_token text, p_body jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  me app.members; rule record; f app.files; v_id uuid; v_kind app.file_kind; v_mime text; v_bytes int;
  v_thumb int; v_md5 text; v_thumb_md5 text; v_code text; v_detail text;
begin
  me := lib.session_member(p_token);
  if me.uid is null then return lib.error_envelope('not_signed_in', 'Sign in again'); end if;
  begin
    v_id    := lib.arg_uuid(p_body, 'id');
    v_mime  := lib.arg_text(p_body, 'mime', 100);
    v_bytes := lib.arg_int(p_body, 'bytes', 1, 26214400);
    v_thumb := case when p_body ? 'thumbBytes' then lib.arg_int(p_body, 'thumbBytes', 1, 1048576) end;
    v_md5   := lib.arg_text(p_body, 'md5', 24);
    v_thumb_md5 := case when v_thumb is not null then lib.arg_text(p_body, 'thumbMd5', 24) end;
    select * into rule from lib.file_rules() r where r.kind::text = p_body ->> 'kind';
    if not found or rule.uploader = 'transport' then perform lib.fail('invalid', 'kind'); end if;
    v_kind := rule.kind;
    if rule.uploader = 'admin' and me.role <> 'admin' then perform lib.fail('not_allowed'); end if;
    if rule.uploader = 'assignee' and me.role <> 'freelancer' then perform lib.fail('not_allowed'); end if;
    -- 'assignee' is checked for real at attach time (lib.guard in submit_task); here only the role gate.
    if not v_mime = any (rule.mimes) then perform lib.fail('invalid', v_mime || ' files are not accepted'); end if;
    if v_bytes > rule.max_bytes then perform lib.fail('invalid', format('max %s MB', rule.max_bytes / 1048576)); end if;
    if v_thumb is not null and v_mime not like 'image/%' then perform lib.fail('invalid', 'thumbBytes'); end if;

    select * into f from app.files where id = v_id;
    if not found then
      -- One upload declaration per member at a time, so concurrent requests can't both pass the quota check.
      perform pg_advisory_xact_lock(hashtext('upload:' || me.uid));
      if (select count(*) >= 50 or coalesce(sum(bytes), 0) + v_bytes > 300 * 1048576
            from app.files where uploader_uid = me.uid and created_at > now() - interval '24 hours') then
        perform lib.fail('too_many', 'Upload limit reached for today');
      end if;
      insert into app.files (id, kind, uploader_uid, name, mime, bytes, md5, thumb_bytes, thumb_md5, width, height)
      values (v_id, v_kind, me.uid, lib.arg_text(p_body, 'name', 200), v_mime, v_bytes, v_md5, v_thumb, v_thumb_md5,
              case when p_body ? 'width'  then lib.arg_int(p_body, 'width', 1, 20000) end,
              case when p_body ? 'height' then lib.arg_int(p_body, 'height', 1, 20000) end)
      on conflict (id) do nothing
      returning * into f;
      if f.id is null then select * into f from app.files where id = v_id; end if;   -- lost a same-id race
    end if;
    if f.uploader_uid <> me.uid or f.kind <> v_kind or f.mime <> v_mime or f.bytes <> v_bytes
       or f.md5 <> v_md5 or f.thumb_bytes is distinct from v_thumb or f.thumb_md5 is distinct from v_thumb_md5 then
      perform lib.fail('invalid', 'id already used for a different file');
    end if;
    if f.state <> 'pending' then perform lib.fail('wrong_state', 'already attached'); end if;
  exception
    when sqlstate 'BT000' then
      get stacked diagnostics v_code = message_text, v_detail = pg_exception_detail;
      return lib.error_envelope(v_code, v_detail);
    when check_violation then
      get stacked diagnostics v_detail = constraint_name;
      return lib.error_envelope('invalid', v_detail);
  end;
  return jsonb_build_object('status', 200, 'file', jsonb_build_object('id', f.id),
    'presign', jsonb_strip_nulls(jsonb_build_object(
      'file',  lib.presign_put(lib.file_key(f.id), f.mime, f.bytes, f.md5),
      'thumb', case when f.thumb_bytes is not null
                    then lib.presign_put(lib.file_key(f.id, true), 'image/jpeg', f.thumb_bytes, f.thumb_md5) end)));
end $$;


-- Upload verification. After the browser's PUTs, the transport reads the stored objects (HEAD for the size,
-- a ranged GET to parse the header) and reports what it found. SQL compares that with what was declared and
-- with the per-kind rules: only `ready` files can be attached. The transport measures; Postgres decides.
-- body: { id, file: Facts, thumb?: Facts }, Facts = { bytes: int, type: text, clean: boolean }
--   bytes  the stored object's size, 0 if it is missing
--   type   the format its magic bytes say: image/jpeg | image/png | application/pdf | application/zip | unknown
--   clean  true when no metadata segment was found (JPEG: no APP1/APP13/COM before SOS; PNG: no eXIf/tEXt/
--          iTXt/zTXt in the bytes read, best effort). Always true for PDF and ZIP, which are not inspected.
-- Returns { status: 200, file: { id, state } } or an error envelope; a refusal marks the file failed.
create function gate.upload_done(p_token text, p_body jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare me app.members; f app.files; v_id uuid; v_why text;
begin
  me := lib.session_member(p_token);
  if me.uid is null then return lib.error_envelope('not_signed_in', 'Sign in again'); end if;
  begin
    v_id := (p_body ->> 'id')::uuid;
  exception when invalid_text_representation then
    return lib.error_envelope('bad_request', 'id');
  end;
  select * into f from app.files where id = v_id for update;
  if not found or f.uploader_uid <> me.uid then return lib.error_envelope('not_found', 'File not found'); end if;
  if f.state = 'failed' then return lib.error_envelope('invalid', f.failure); end if;
  if f.state <> 'pending' then
    return jsonb_build_object('status', 200, 'file', jsonb_build_object('id', f.id, 'state', f.state));
  end if;
  if coalesce((p_body #>> '{file,bytes}')::bigint, 0) = 0
     or (f.thumb_bytes is not null and coalesce((p_body #>> '{thumb,bytes}')::bigint, 0) = 0) then
    return lib.error_envelope('wrong_state', 'Upload not finished');          -- PUT still in flight: retryable
  end if;

  v_why := case
    when (p_body #>> '{file,bytes}')::bigint <> f.bytes then 'size differs from what was declared'
    when p_body #>> '{file,type}' is distinct from f.mime then 'content is not ' || f.mime
    when f.mime like 'image/%' and (p_body #>> '{file,clean}')::boolean is not true then 'photo metadata was not removed'
    when f.thumb_bytes is not null and (p_body #>> '{thumb,bytes}')::bigint <> f.thumb_bytes then 'thumbnail size differs'
    when f.thumb_bytes is not null and p_body #>> '{thumb,type}' is distinct from 'image/jpeg' then 'thumbnail is not a JPEG'
    when f.thumb_bytes is not null and (p_body #>> '{thumb,clean}')::boolean is not true then 'thumbnail metadata was not removed'
  end;
  if v_why is not null then
    update app.files set state = 'failed', failure = v_why where id = f.id;
    return lib.error_envelope('invalid', v_why);
  end if;
  update app.files set state = 'ready' where id = f.id;
  return jsonb_build_object('status', 200, 'file', jsonb_build_object('id', f.id, 'state', 'ready'));
exception when invalid_text_representation or numeric_value_out_of_range then
  return lib.error_envelope('bad_request', 'facts');
end $$;

-- View. No command_log row and no clock bump (lib.session_member may still extend the session). 404 for "missing" and "not yours" alike, so ids can't
-- be probed. p_variant: 'file' | 'thumb'.
create function gate.file(p_token text, p_id uuid, p_variant text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare me app.members; f app.files;
begin
  me := lib.session_member(p_token);
  if me.uid is null then return lib.error_envelope('not_signed_in', 'Sign in again'); end if;
  select * into f from app.files where id = p_id;
  if not found or not lib.file_visible(me, f) or p_variant not in ('file', 'thumb')
     or (p_variant = 'thumb' and f.thumb_bytes is null) then
    return lib.error_envelope('not_found', 'File not found');
  end if;
  return jsonb_build_object('status', 200, 'presign', jsonb_build_object('get', lib.presign_get(f, p_variant = 'thumb')));
end $$;


-- Nightly sweep (bt_sweeper only). Call with the ids whose objects were deleted last round ('{}' first);
-- returns the next batch of DELETE specs, labelled '<id>' and '<id>:t'. Loop until `presign` is empty.
-- Eligible: never attached (pending, ready, failed) or detached, untouched for 30 days (= the R2 bucket-lock window, so the
-- delete cannot be refused). Idempotent: re-marking a purged id and re-deleting a missing object are no-ops.
create function gate.sweep(p_purged uuid[]) returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_specs jsonb;
begin
  update app.files set purged_at = now()
   where id = any (p_purged) and state <> 'attached' and purged_at is null;
  with batch as (
    select f.id, f.thumb_bytes is not null as has_thumb from app.files f
     where f.state <> 'attached' and f.purged_at is null
       and coalesce(f.detached_at, f.created_at) < now() - interval '30 days'
       and not (f.id = any (p_purged))
     order by coalesce(f.detached_at, f.created_at) limit 100)
  select coalesce(jsonb_object_agg(s.lbl, jsonb_build_object('method', 'DELETE', 'key', s.k, 'ttl', 300)), '{}')
    into v_specs
    from (select b.id::text as lbl, lib.file_key(b.id) as k from batch b
          union all
          select b.id::text || ':t', lib.file_key(b.id, true) from batch b where b.has_thumb) s;
  return jsonb_build_object('status', 200, 'presign', v_specs);
end $$;


-- =============================================================================================
-- Grants: the whole allowlist for the transport. No table, no lib, no cmd.
-- =============================================================================================
revoke execute on all functions in schema app, lib, cmd, gate from public;   -- app too: a pg_restore re-grants app.stamp() to PUBLIC
grant usage on schema gate to bt_gateway, bt_sweeper;
grant execute on function gate.sign_in(jsonb), gate.call(text, jsonb), gate.sign_out(text),
                          gate.upload(text, jsonb), gate.upload_done(text, jsonb), gate.file(text, uuid, text)
                       to bt_gateway;
grant execute on function gate.sweep(uuid[]) to bt_sweeper;
