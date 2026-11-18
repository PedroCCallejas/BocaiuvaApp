-- Compara todos os registros sintéticos públicos e metadados de proteção.
create temporary table qa_fingerprint(part text primary key, value jsonb);
do $$
declare item record; payload jsonb;
begin
  for item in
    select tablename from pg_tables where schemaname = 'public' order by tablename
  loop
    execute format('select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text), ''[]''::jsonb) from public.%I t', item.tablename)
      into payload;
    insert into qa_fingerprint values ('rows:' || item.tablename, payload);
  end loop;
end $$;
insert into qa_fingerprint
select 'rls', jsonb_agg(jsonb_build_object('table', c.relname, 'rls', c.relrowsecurity) order by c.relname)
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r';
insert into qa_fingerprint
select 'policies', jsonb_agg(to_jsonb(p) order by schemaname, tablename, policyname)
from pg_policies p where schemaname in ('public', 'storage');
insert into qa_fingerprint
select 'acl:tables', jsonb_agg(to_jsonb(t) - 'table_catalog' order by t.table_schema, t.table_name, t.grantee, t.privilege_type)
from information_schema.table_privileges t where table_schema in ('public', 'app');
insert into qa_fingerprint
select 'acl:columns', jsonb_agg(to_jsonb(t) - 'table_catalog' order by t.table_schema, t.table_name, t.column_name, t.grantee, t.privilege_type)
from information_schema.column_privileges t where table_schema in ('public', 'app');
insert into qa_fingerprint
select 'acl:functions', jsonb_agg(jsonb_build_object('schema', n.nspname,
  'name', p.proname, 'args', pg_get_function_identity_arguments(p.oid),
  'acl', (select jsonb_agg(jsonb_build_object(
    'grantor', a.grantor::regrole::text, 'grantee', a.grantee::regrole::text,
    'privilege', a.privilege_type, 'grantable', a.is_grantable)
    order by a.grantor::regrole::text, a.grantee::regrole::text, a.privilege_type)
    from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a)) order by n.nspname, p.proname, pg_get_function_identity_arguments(p.oid))
from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','app');
insert into qa_fingerprint
select 'acl:defaults', jsonb_agg(jsonb_build_object('owner', d.defaclrole::regrole::text,
  'schema', n.nspname, 'type', d.defaclobjtype,
  'grantor', a.grantor::regrole::text, 'grantee', a.grantee::regrole::text,
  'privilege', a.privilege_type, 'grantable', a.is_grantable)
  order by d.defaclrole::regrole::text, n.nspname, d.defaclobjtype,
    a.grantor::regrole::text, a.grantee::regrole::text, a.privilege_type)
from pg_default_acl d left join pg_namespace n on n.oid = d.defaclnamespace
left join lateral aclexplode(d.defaclacl) a on true;
select md5(jsonb_object_agg(part, value)::text) from qa_fingerprint;
