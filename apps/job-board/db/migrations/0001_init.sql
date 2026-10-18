-- 0001_init.sql — tables, enums, the change clock. Applied once, forward-only, by db/migrate.sh as the
-- owner role (neondb_owner) from CI. Logic (state machine, commands, projections, the transport surface)
-- is NOT here: it lives in ../api.sql, which is dropped and re-created on every deploy.
--
-- Rule for this file and every later migration: app.* objects must never reference lib.*, cmd.* or
-- gate.* (api.sql does `drop schema … cascade`; a CHECK calling lib.f() would silently vanish).
-- CHECKs here use only built-ins, so they hold no matter what api.sql does.
--
-- Roles. Both are created here in SQL, never in the Neon console: console-created roles join
-- neon_superuser, which carries pg_read_all_data / pg_write_all_data and would bypass every grant below.
-- ../assert_privileges.sql runs after every migrate and fails the deploy if either role gains more.
--   neondb_owner  owns every object, runs migrations. Its URL lives only in GitHub Actions secrets.
--   bt_gateway    the Cloudflare Worker. USAGE on schema gate + EXECUTE on three functions (bottom of
--                 api.sql). No table privileges, ever.
--   bt_backup     the nightly pg_dump. SELECT on schema app, nothing else.
-- Passwords are set once by a human in the Neon SQL editor: alter role bt_gateway password '…';

do $$
begin
  if not exists (select from pg_roles where rolname = 'bt_gateway') then create role bt_gateway login; end if;
  if not exists (select from pg_roles where rolname = 'bt_backup') then create role bt_backup login; end if;
end $$;

create extension if not exists pgcrypto;   -- digest(), gen_random_bytes(); Neon installs into public

create schema app;
revoke all on schema app from public;
-- Postgres lets PUBLIC execute every new function by default. Turn that off for everything this role creates.
alter default privileges revoke execute on functions from public;

create type app.role        as enum ('admin', 'freelancer');
create type app.task_status as enum ('open', 'assigned', 'changes', 'submitted', 'approved', 'paid');
create type app.task_action as enum ('claim', 'submit', 'approve', 'reject', 'pay');
create type app.actor_kind  as enum ('admin', 'freelancer', 'assignee');
create type app.verdict     as enum ('approved', 'changes');

-- ---------------------------------------------------------------------------------------------
-- The change clock. One row. Every insert/update of a synced table bumps it (trigger app.stamp) and
-- stores the new value in the row's `version`. Because the bump is an UPDATE of this single row, it
-- takes a row lock held to commit: ticks are handed out in commit order, so "committed clock = V" implies
-- every row with version <= V is committed. That is what makes `version > since` gap-free for pollers.
-- (A plain bigserial is NOT: nextval order != commit order, and a slow writer's row would be skipped.)
-- Cost: all writes serialize on this row. At pilot scale that is nothing.
-- ---------------------------------------------------------------------------------------------
create table app.clock (
  singleton boolean primary key default true check (singleton),
  v bigint not null default 0
);
insert into app.clock default values;

create function app.stamp() returns trigger language plpgsql as $$
begin
  update app.clock set v = v + 1 returning v into new.version;
  return new;
end $$;

-- Single source of truth for who may enroll as admin (was duplicated in firestore.rules + ADMIN_EMAILS).
create table app.admin_allowlist (
  email text primary key check (email = lower(btrim(email)))
);
insert into app.admin_allowlist (email) values ('pongwasin@gmail.com');

create table app.members (
  uid        text primary key,                            -- Google OIDC `sub`
  email      text not null unique check (email = lower(email)),
  name       text not null check (length(btrim(name)) between 1 and 200),
  photo      text not null default '' check (length(photo) <= 2000),
  role       app.role not null,
  joined_at  timestamptz not null default now(),
  removed_at timestamptz,                                 -- soft delete: rows are never deleted, so sync needs no tombstones
  version    bigint not null,
  constraint admins_are_not_removed check (not (role = 'admin' and removed_at is not null))
);
create trigger stamp before insert or update on app.members for each row execute function app.stamp();
create index members_version on app.members (version);

create table app.invites (
  email      text primary key
             check (email = lower(btrim(email)) and length(email) <= 320 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  invited_by text not null references app.members (uid),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,                                 -- soft delete; re-invite clears it
  version    bigint not null
);
create trigger stamp before insert or update on app.invites for each row execute function app.stamp();
create index invites_version on app.invites (version);

create table app.jobs (
  id                uuid primary key default gen_random_uuid(),
  title             text not null check (length(btrim(title)) between 1 and 200),
  customer          text not null check (length(btrim(customer)) between 1 and 200),
  description       text not null default '' check (length(description) <= 10000),
  customer_deadline date not null,
  created_by        text not null references app.members (uid),
  created_at        timestamptz not null default now(),
  version           bigint not null
);
create trigger stamp before insert or update on app.jobs for each row execute function app.stamp();
create index jobs_version on app.jobs (version);

create table app.tasks (
  id                  uuid primary key default gen_random_uuid(),
  job_id              uuid not null references app.jobs (id),
  title               text not null check (length(btrim(title)) between 1 and 200),
  description         text not null default '' check (length(description) <= 10000),
  payout              integer not null check (payout >= 0),          -- whole THB
  freelancer_deadline date not null,
  status              app.task_status not null default 'open',
  assignee_uid        text references app.members (uid),
  submission_url      text check (length(submission_url) <= 2000 and submission_url ~ '^https?://.+'),
  submission_note     text check (length(submission_note) <= 2000),
  submitted_at        timestamptz,                                    -- always now() of the submit txn
  paid_at             timestamptz,
  created_at          timestamptz not null default now(),
  version             bigint not null,
  -- Shape invariants that hold regardless of which function wrote the row:
  constraint assignee_iff_claimed check ((status = 'open') = (assignee_uid is null)),
  constraint submission_present check (
    status not in ('submitted', 'approved', 'paid')
    or (submission_url is not null and submission_note is not null and submitted_at is not null)),
  constraint paid_iff_paid_at check ((status = 'paid') = (paid_at is not null))
);
create trigger stamp before insert or update on app.tasks for each row execute function app.stamp();
create index tasks_version on app.tasks (version);
create index tasks_job on app.tasks (job_id);

-- Append-only review history (today a rejection's review is overwritten by the approval).
-- Not synced on its own: every insert here happens in the same command that changes app.tasks.status,
-- so the task's version bump carries it.
create table app.task_reviews (
  id           bigint generated always as identity primary key,
  task_id      uuid not null references app.tasks (id),
  assignee_uid text not null references app.members (uid),     -- whose work was reviewed; scopes `rejections`
  verdict      app.verdict not null,
  grade        smallint,
  feedback     text not null default '' check (length(feedback) <= 2000),
  reviewer_uid text not null references app.members (uid),
  at           timestamptz not null default now(),
  constraint grade_matches_verdict check (
    (verdict = 'approved' and grade between 1 and 5) or (verdict = 'changes' and grade is null))
);
create index task_reviews_task on app.task_reviews (task_id, id desc);

-- Opaque session tokens; only the SHA-256 is stored. Deleting a member's rows here signs them out
-- everywhere on their next request (the gap firestore.rules had: no way to remove a joined freelancer).
create table app.sessions (
  token_hash bytea primary key,
  uid        text not null references app.members (uid),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index sessions_uid on app.sessions (uid);

-- Exactly-once commands + audit trail. gate.call looks up request_id before running a command and
-- returns the stored result on a retry. A failed command rolls back its own log row, so it may be retried.
create table app.command_log (
  request_id uuid primary key,
  uid        text not null references app.members (uid),
  command    text not null,
  args       jsonb not null,
  result     jsonb,
  at         timestamptz not null default now()
);

grant usage on schema app to bt_backup;
grant select on public.schema_migrations to bt_backup;   -- so a restored dump knows which migrations it has
grant select on all tables in schema app to bt_backup;
alter default privileges in schema app grant select on tables to bt_backup;
grant select on all sequences in schema app to bt_backup;
alter default privileges in schema app grant select on sequences to bt_backup;
