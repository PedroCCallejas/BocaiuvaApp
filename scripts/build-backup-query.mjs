import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function buildBackupQuery(publicKey, tables) {
  assert.match(publicKey, /^-----BEGIN PGP PUBLIC KEY BLOCK-----/);
  assert.ok(publicKey.length < 10000 && publicKey.endsWith('-----END PGP PUBLIC KEY BLOCK-----'));
  const literal = value => "'" + value.replaceAll("'", "''") + "'";
  const aggregate = items => 'jsonb_build_object(' + items.map(({ schemaname, tablename }) => {
    assert.ok(['public', 'storage', 'supabase_migrations'].includes(schemaname));
    assert.match(tablename, /^[a-z][a-z0-9_]*$/);
    return `${literal(schemaname + '.' + tablename)}, (select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text), '[]'::jsonb) from "${schemaname}"."${tablename}" t)`;
  }).join(',') + ')';
  const publicTables = tables.filter(item => item.schemaname === 'public');
  assert.ok(publicTables.length > 0);
  const auxiliary = tables.filter(item => item.schemaname !== 'public');
  return `with payload as (select ${aggregate(publicTables)} as public_tables)
select encode(extensions.pgp_pub_encrypt(jsonb_build_object(
  'format', 'professo-data-snapshot-v1', 'created_at', now(),
  'project_ref', 'xepbopkhsprfemqjzrkm', 'public_tables', public_tables,
  'public_fingerprint', md5(public_tables::text),
  'auxiliary_tables', ${aggregate(auxiliary)},
  'policies', (select jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname)
    from pg_policies p where schemaname in ('public','storage')),
  'functions', (select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'definition',pg_get_functiondef(p.oid)) order by n.nspname,p.proname,p.oid)
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','app') and p.prokind='f'),
  'columns', (select jsonb_agg(to_jsonb(c) order by table_schema,table_name,ordinal_position)
    from information_schema.columns c where table_schema in ('public','app','storage')),
  'constraints', (select jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname,'name',con.conname,'definition',pg_get_constraintdef(con.oid)) order by n.nspname,c.relname,con.conname)
    from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'),
  'indexes', (select jsonb_agg(to_jsonb(i) order by schemaname,tablename,indexname) from pg_indexes i where schemaname='public')
)::text, extensions.dearmor(${literal(publicKey)}), 'compress-algo=1,cipher-algo=aes256'), 'base64') as encrypted_snapshot from payload;\n`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fs.realpathSync(path.resolve('.expo/backups-reais'));
  const directory = fs.realpathSync(process.argv[2]);
  assert.ok(directory.startsWith(root + path.sep));
  const query = buildBackupQuery(fs.readFileSync(path.join(directory, 'public-key.asc'), 'utf8').trim(),
    JSON.parse(fs.readFileSync(path.join(directory, 'tables.json'), 'utf8')));
  fs.writeFileSync(path.join(directory, 'snapshot-query.sql'), query, { flag: 'wx' });
  console.log('Consulta preparada: somente SELECT, conteúdo criptografado antes de retornar ao conector.');
}
