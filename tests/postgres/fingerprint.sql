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
select md5(jsonb_object_agg(part, value)::text) from qa_fingerprint;
