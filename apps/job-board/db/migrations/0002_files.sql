-- 0002_files.sql — attachments. The bytes live in R2 (bucket bt-crew-files). Everything that decides who may
-- put or see them lives here and in ../api.sql. An object's key is derived from its row id (lib.file_key), so
-- the row is the only owner: the R2 object is a derived artifact the nightly sweep reconciles against this
-- table, never the reverse.
--
-- Same rule as 0001: nothing in app.* references lib/cmd/gate. Per-kind limits (mime allowlist, max bytes,
-- who may upload) are policy and live in lib.file_rules() in api.sql; the CHECKs below are only the shape
-- that must hold whatever api.sql says.
--
-- Not synced on its own (no `version` column): like app.task_reviews, every attach/detach happens in a
-- command that also touches the parent row (task, job or member), whose stamp carries the change to pollers.

-- The nightly orphan sweep (GitHub Actions) connects as bt_sweeper: EXECUTE on gate.sweep(uuid[]) only.
-- Created in SQL for the same reason as 0001 (console roles join neon_superuser).
do $$
begin
  if not exists (select from pg_roles where rolname = 'bt_sweeper') then create role bt_sweeper login; end if;
end $$;

create type app.file_kind  as enum ('submission', 'brief', 'avatar');
-- pending   upload URLs were issued; nothing is known about the bytes yet
-- ready     the transport measured the stored object and SQL accepted the facts (gate.upload_done)
-- failed    the stored object did not match what was declared (size, type, or metadata left in)
-- attached  visible on its parent; only commands get a file here, and only from ready
-- detached  removed from view; the sweep purges the objects 30 days later
create type app.file_state as enum ('pending', 'ready', 'failed', 'attached', 'detached');

create table app.files (
  -- Chosen by the client for uploads (makes gate.upload idempotent under retry), by Postgres for avatars.
  -- Object keys: 'f/' || id (the file), 't/' || id (its thumbnail). Never stored: derived in lib.file_key.
  id           uuid primary key,
  kind         app.file_kind not null,
  uploader_uid text not null references app.members (uid),
  name         text not null check (length(btrim(name)) between 1 and 200),
  mime         text not null check (length(mime) <= 100 and mime ~ '^[a-z]+/[a-z0-9.+-]+$'),
  -- Exact byte count the uploader declared; gate.upload_done refuses an object of any other size. NULL only
  -- for avatars, which the transport writes itself under its own 1 MB cap.
  bytes        integer check (bytes between 1 and 26214400),
  thumb_bytes  integer check (thumb_bytes between 1 and 1048576),       -- present iff a 't/' object exists
  -- Base64 MD5 of the bytes the uploader declared, signed into the PUT as Content-MD5: storage refuses any
  -- other body, so a verified object can't be swapped later through a still-valid upload URL.
  md5          text check (md5 ~ '^[A-Za-z0-9+/]{22}==$'),
  thumb_md5    text check (thumb_md5 ~ '^[A-Za-z0-9+/]{22}==$'),
  width        integer check (width between 1 and 20000),
  height       integer check (height between 1 and 20000),
  state        app.file_state not null default 'pending',
  failure      text check (length(failure) <= 200),                    -- why upload_done refused it
  -- The parent. Exactly one is set once attached; which one depends on kind (constraint below).
  task_id      uuid references app.tasks (id),
  job_id       uuid references app.jobs (id),
  member_uid   text references app.members (uid),
  source_hash  bytea,                                                  -- avatar: sha256 of the Google picture URL
  created_at   timestamptz not null default now(),
  attached_at  timestamptz,
  detached_at  timestamptz,
  purged_at    timestamptz,                                            -- the sweep deleted the R2 objects
  constraint bytes_known check (kind = 'avatar' or (bytes is not null and md5 is not null)),
  constraint thumb_md5_iff_thumb check ((thumb_bytes is null) = (thumb_md5 is null)),
  constraint parent_fits_kind check (case kind
    when 'submission' then job_id is null and member_uid is null and source_hash is null
    when 'brief'      then member_uid is null and source_hash is null and num_nonnulls(task_id, job_id) <= 1
    when 'avatar'     then member_uid is not null and task_id is null and job_id is null and source_hash is not null
  end),
  constraint attached_has_one_parent check (state <> 'attached' or num_nonnulls(task_id, job_id, member_uid) = 1),
  constraint state_times check (case state
    when 'attached' then attached_at is not null and detached_at is null
    when 'detached' then detached_at is not null
    else attached_at is null and detached_at is null
  end),
  constraint failed_says_why check ((state = 'failed') = (failure is not null)),
  -- An attached file's objects are never deleted. The "owed-work evidence" invariant in one line.
  constraint never_purge_attached check (purged_at is null or state <> 'attached')
);
create index files_task     on app.files (task_id) where state = 'attached';
create index files_job      on app.files (job_id)  where state = 'attached';
create index files_uploader on app.files (uploader_uid, created_at);                 -- upload quota
create index files_sweep    on app.files ((coalesce(detached_at, created_at))) where state <> 'attached' and purged_at is null;
create unique index files_avatar_source on app.files (member_uid, source_hash) where kind = 'avatar';
create unique index files_one_avatar    on app.files (member_uid) where kind = 'avatar' and state = 'attached';

-- members.photo keeps Google's picture URL, now only as the source the avatar is copied from. Projections emit
-- `photoId` (an R2-backed file) instead. The column keeps its name so the old api.sql keeps working in the
-- seconds between this migration and the api.sql rebuild.

-- A submission is now a link, files, or both. "Has evidence" can no longer be a single-row CHECK (files are
-- in another table), so it moves into cmd.submit_task. The note/time half of the invariant stays here.
alter table app.tasks drop constraint submission_present;
alter table app.tasks add constraint submission_present check (
  status not in ('submitted', 'approved', 'paid') or (submission_note is not null and submitted_at is not null));

-- bt_backup gets SELECT on app.files through 0001's default privileges; the dump includes it.
