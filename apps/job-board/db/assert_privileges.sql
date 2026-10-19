-- Runs after every migrate (migrate.sh). Fails loudly if a role can reach more than the design allows.
-- The design's security model is "the grants are the allowlist"; this keeps that true in production, where a
-- role created in the Neon console instead of SQL would silently inherit neon_superuser.
-- Adding a gate.* function = add it to api.sql's grant block AND to `allowed` below; every migrate (CI and
-- deploy) fails until both agree, in either direction.
do $$
declare bad text;
begin
  create temp table allowed (rolname name, sig text) on commit drop;
  insert into allowed values
    ('bt_gateway', 'gate.sign_in(jsonb)'),
    ('bt_gateway', 'gate.call(text,jsonb)'),
    ('bt_gateway', 'gate.sign_out(text)'),
    ('bt_gateway', 'gate.upload(text,jsonb)'),
    ('bt_gateway', 'gate.upload_done(text,jsonb)'),
    ('bt_gateway', 'gate.file(text,uuid,text)'),
    ('bt_sweeper', 'gate.sweep(uuid[])');
  -- bt_backup: SELECT on app only (checked below).

  create temp table checked (rolname name) on commit drop;
  insert into checked values ('bt_gateway'), ('bt_backup'), ('bt_sweeper');

  select string_agg(r.rolname || ' in ' || g.rolname, ', ') into bad
    from pg_auth_members am
    join pg_roles g on g.oid = am.roleid
    join pg_roles r on r.oid = am.member
   where r.rolname in (select rolname from checked);
  if bad is not null then raise exception 'role memberships not allowed: %', bad; end if;

  select string_agg(rolname, ', ') into bad from pg_roles
   where rolname in (select rolname from checked) and (rolsuper or rolcreaterole or rolcreatedb or rolbypassrls);
  if bad is not null then raise exception 'roles with elevated attributes: %', bad; end if;

  -- No role but bt_backup may touch any table; bt_backup may only read.
  select string_agg(k.rolname || ' → ' || n.nspname || '.' || c.relname, ', ') into bad
    from checked k cross join pg_class c join pg_namespace n on n.oid = c.relnamespace
   where c.relkind in ('r', 'v', 'm', 'p') and n.nspname not in ('pg_catalog', 'information_schema')
     and has_table_privilege(k.rolname, c.oid,
           case when k.rolname = 'bt_backup' then 'insert, update, delete, truncate'
                else 'select, insert, update, delete, truncate' end);
  if bad is not null then raise exception 'table privileges not allowed: %', bad; end if;

  -- Every executable function in our schemas, per role, must be on the allowlist…
  select string_agg(k.rolname || ' → ' || p.oid::regprocedure::text, ', ') into bad
    from checked k cross join pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('app', 'lib', 'cmd', 'gate') and has_function_privilege(k.rolname, p.oid, 'execute')
     and not exists (select 1 from allowed a where a.rolname = k.rolname and a.sig = p.oid::regprocedure::text);
  if bad is not null then raise exception 'execute not allowed: %', bad; end if;

  -- …and everything on the allowlist must exist and be granted (catches a renamed/forgotten gate function).
  select string_agg(a.rolname || ' → ' || a.sig, ', ') into bad
    from allowed a
   where to_regprocedure(a.sig) is null or not has_function_privilege(a.rolname, to_regprocedure(a.sig), 'execute');
  if bad is not null then raise exception 'allowlisted but not executable: %', bad; end if;

end $$;
