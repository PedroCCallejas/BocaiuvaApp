import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = fs.realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const boundary = fs.realpathSync(path.join(root, '.expo/backups-reais'));
const directory = fs.realpathSync(process.argv[2]);
assert.ok(directory.startsWith(boundary + path.sep));
const container = `appboca-restore-${randomUUID().slice(0, 8)}`;
let created = false;
let stage = 'abrir cópia criptografada';
const startedAt = Date.now();
function run(command, args, input) {
  const result = spawnSync(command, args, { encoding: 'utf8', input, timeout: 60000, maxBuffer: 32 * 1024 * 1024 });
  // Não expor stderr: erros SQL podem conter o registro privado que foi recusado.
  if (result.status !== 0 || result.error) throw new Error(`Falha na etapa: ${stage}. Saída técnica privada não exibida.`);
  return result.stdout.trim();
}
const docker = (args, input) => run('docker', args, input);
const sql = input => docker(['exec', '-i', container, 'psql', '-X', '-Atq', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'restore_check'], input);
const literal = value => "'" + value.replaceAll("'", "''") + "'";
const identifier = value => { assert.match(value, /^[a-z][a-z0-9_]*$/); return `"${value}"`; };

try {
  const decrypted = run('C:\\Program Files\\Git\\usr\\bin\\gpg.exe', [
    '--homedir', process.argv[3], '--batch', '--quiet', '--decrypt', path.join(directory, 'snapshot.pgp'),
  ]);
  const snapshot = JSON.parse(decrypted);
  assert.equal(snapshot.format, 'professo-data-snapshot-v1');
  assert.equal(snapshot.project_ref, 'xepbopkhsprfemqjzrkm');
  const publicTables = Object.keys(snapshot.public_tables).sort();
  assert.ok(publicTables.length > 0);
  const mounts = relative => `type=bind,source=${fs.realpathSync(path.join(root, relative))},target=/${relative.replaceAll('\\', '/')},readonly`;
  stage = 'iniciar PostgreSQL local sem rede';
  docker(['run', '--detach', '--rm', '--name', container, '--network', 'none', '--cpus', '1', '--memory', '1g', '--pids-limit', '128',
    '--read-only', '--security-opt', 'no-new-privileges', '--tmpfs', '/var/lib/postgresql/data:rw,size=512m',
    '--tmpfs', '/var/run/postgresql:rw,size=16m', '--tmpfs', '/tmp:rw,size=256m',
    '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', '-e', 'POSTGRES_DB=restore_check',
    '--mount', mounts('supabase/migrations'), '--mount', mounts('supabase/tests'), '--mount', mounts('tests/postgres'),
    'postgres:17', '-c', 'wal_level=logical']);
  created = true;
  let ready = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    if (spawnSync('docker', ['exec', container, 'pg_isready', '-U', 'postgres', '-d', 'restore_check'], { timeout: 5000 }).status === 0) { ready = true; break; }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  assert.ok(ready, 'PostgreSQL local não iniciou.');
  stage = 'reconstruir schema versionado';
  sql('\\i /tests/postgres/bootstrap.sql');
  const migrations = fs.readdirSync(path.join(root, 'supabase/migrations')).filter(name => name.endsWith('.sql')).sort();
  const versions = migrations.map(name => name.split('_')[0]);
  const remoteVersions = snapshot.auxiliary_tables['supabase_migrations.schema_migrations'].map(row => row.version).sort();
  assert.deepEqual(versions, remoteVersions, 'Migrations da cópia e do repositório divergentes.');
  for (const migration of migrations) sql(`\\i /supabase/migrations/${migration}`);
  const localTables = JSON.parse(sql("select json_agg('public.' || tablename order by tablename) from pg_tables where schemaname='public';"));
  assert.deepEqual(publicTables, localTables, 'Tabelas da cópia e do schema reconstruído divergentes.');
  stage = 'restaurar registros reais somente no contêiner isolado';
  let restore = 'begin; set local standard_conforming_strings=on; set local session_replication_role=replica;\n';
  for (const qualified of publicTables) {
    const table = qualified.slice('public.'.length);
    const columns = JSON.parse(sql(`select json_agg(column_name order by ordinal_position) from information_schema.columns where table_schema='public' and table_name=${literal(table)} and is_generated='NEVER';`));
    const columnSql = columns.map(identifier).join(',');
    restore += `insert into public.${identifier(table)} (${columnSql}) select ${columnSql} from jsonb_populate_recordset(null::public.${identifier(table)}, ${literal(JSON.stringify(snapshot.public_tables[qualified]))}::jsonb);\n`;
  }
  restore += 'commit;';
  sql(restore);
  stage = 'comparar todos os registros restaurados';
  const aggregate = 'jsonb_build_object(' + publicTables.map(qualified => `${literal(qualified)}, (select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text), '[]'::jsonb) from public.${identifier(qualified.slice(7))} t)`).join(',') + ')';
  const fingerprint = sql(`select md5((${aggregate})::text);`);
  assert.equal(fingerprint, snapshot.public_fingerprint, 'Os registros restaurados não correspondem integralmente à cópia.');
  stage = 'conferir referências entre os registros reais';
  sql(`do $$ declare item record; predicate text; nonnull text; invalid boolean; begin
    for item in select con.oid, con.conname, con.conrelid::regclass as child, con.confrelid::regclass as parent
      from pg_constraint con join pg_namespace n on n.oid=con.connamespace where con.contype='f' and n.nspname='public'
    loop
      select string_agg(format('c.%I = p.%I', ca.attname, pa.attname), ' and '), string_agg(format('c.%I is not null', ca.attname), ' and ')
        into predicate, nonnull from pg_constraint con, unnest(con.conkey,con.confkey) as k(ca,pa)
        join pg_attribute ca on ca.attrelid=item.child and ca.attnum=k.ca
        join pg_attribute pa on pa.attrelid=item.parent and pa.attnum=k.pa where con.oid=item.oid;
      execute format('select exists(select 1 from %s c where %s and not exists(select 1 from %s p where %s))', item.child, nonnull, item.parent, predicate) into invalid;
      if invalid then raise exception 'Referência inválida na restauração: %', item.conname; end if;
    end loop;
  end $$;`);
  stage = 'conferir policies e RLS';
  const policies = JSON.parse(sql("select json_agg(p order by schemaname,tablename,policyname) from pg_policies p where schemaname in ('public','storage');"));
  assert.deepEqual(policies, snapshot.policies, 'Policies reconstruídas diferem das policies capturadas.');
  const rlsCount = Number(sql("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity;"));
  assert.equal(rlsCount, publicTables.length);
  stage = 'executar testes SQL sobre o banco restaurado';
  const tests = fs.readdirSync(path.join(root, 'supabase/tests')).filter(name => name.endsWith('.sql')).sort();
  for (const test of tests) sql(`\\i /supabase/tests/${test}`);
  const report = {
    status: 'passed', format: snapshot.format, createdAt: snapshot.created_at,
    verifiedAt: new Date().toISOString(), publicTables: publicTables.length,
    publicRows: Object.values(snapshot.public_tables).reduce((sum, rows) => sum + rows.length, 0),
    publicFingerprint: fingerprint, migrations: migrations.length, sqlTests: tests.length,
    publicRlsTables: rlsCount, policiesEqual: true, foreignKeysChecked: true,
    ciphertextSha256: createHash('sha256').update(fs.readFileSync(path.join(directory, 'snapshot.pgp'))).digest('hex'),
    elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
    limitations: ['Dados do produto restaurados sobre migrations locais; não é pg_dump integral de toda a plataforma.',
      'Metadados Storage/histórico de migrations estão na cópia criptografada; objetos binários Storage não estão.',
      'Firebase Auth, secrets, grants e configurações dos serviços não são restaurados por este ensaio.',
      'Chave DPAPI exige o perfil Windows atual; falta chave de recuperação portátil e cópia externa.'],
  };
  fs.writeFileSync(path.join(directory, 'verification.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} catch (error) {
  console.error(`Verificação não concluída: ${stage}. ${error instanceof assert.AssertionError ? 'Comparação de integridade reprovada.' : 'Falha operacional; dados privados não exibidos.'}`);
  process.exitCode = 1;
} finally {
  if (created) {
    stage = 'remover somente o contêiner de verificação criado nesta execução';
    docker(['stop', '--time', '5', container]);
  }
}
