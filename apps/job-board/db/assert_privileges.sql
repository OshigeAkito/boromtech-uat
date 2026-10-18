-- Runs after every migrate (migrate.sh). Fails loudly if a role can reach more than the design allows.
-- The design's whole security model is "the grants are the allowlist"; this keeps that true in production,
-- where a role created in the Neon console instead of SQL would silently inherit neon_superuser.
do $$
declare bad text;
begin
  select string_agg(r.rolname || ' in ' || g.rolname, ', ') into bad
    from pg_auth_members am
    join pg_roles g on g.oid = am.roleid
    join pg_roles r on r.oid = am.member
   where r.rolname in ('bt_gateway', 'bt_backup');
  if bad is not null then raise exception 'role memberships not allowed: %', bad; end if;

  select string_agg(rolname, ', ') into bad from pg_roles
   where rolname in ('bt_gateway', 'bt_backup') and (rolsuper or rolcreaterole or rolcreatedb or rolbypassrls);
  if bad is not null then raise exception 'roles with elevated attributes: %', bad; end if;

  select string_agg(n.nspname || '.' || c.relname, ', ') into bad
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where c.relkind in ('r', 'v', 'm', 'p') and n.nspname not in ('pg_catalog', 'information_schema')
     and has_table_privilege('bt_gateway', c.oid, 'select, insert, update, delete, truncate');
  if bad is not null then raise exception 'bt_gateway can touch tables: %', bad; end if;

  select string_agg(p.oid::regprocedure::text, ', ') into bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('app', 'lib', 'cmd', 'gate') and has_function_privilege('bt_gateway', p.oid, 'execute')
     and p.oid::regprocedure::text not in ('gate.sign_in(jsonb)', 'gate.call(text,jsonb)', 'gate.sign_out(text)');
  if bad is not null then raise exception 'bt_gateway can execute: %', bad; end if;

  select string_agg(n.nspname || '.' || c.relname, ', ') into bad
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where c.relkind in ('r', 'v', 'm', 'p') and n.nspname not in ('pg_catalog', 'information_schema')
     and has_table_privilege('bt_backup', c.oid, 'insert, update, delete, truncate');
  if bad is not null then raise exception 'bt_backup can write: %', bad; end if;
end $$;
