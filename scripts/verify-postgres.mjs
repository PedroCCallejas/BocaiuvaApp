import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fs.realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const container = `appboca-qa-${randomUUID().slice(0, 8)}`;
const image = 'postgres:17';
const startedAt = Date.now();
let created = false;

function docker(args, options = {}) {
  const result = spawnSync('docker', args, { encoding: 'utf8', timeout: 60000, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`docker ${args[0]} falhou: ${(result.stderr || result.stdout).trim()}`);
  }
  return result.stdout.trim();
}

function mount(relative, target) {
  const source = fs.realpathSync(path.join(root, relative));
  assert.ok(source.startsWith(root + path.sep), 'Mount deve permanecer no projeto.');
  return ['--mount', `type=bind,source=${source},target=${target},readonly`];
}

function sql(file, database = 'appboca_qa') {
  return docker(['exec', container, 'psql', '-X', '-Atq', '-v', 'ON_ERROR_STOP=1',
    '-U', 'postgres', '-d', database, '-f', file]);
}

try {
  docker(['info', '--format', '{{.ServerVersion}}']);
  docker(['run', '--detach', '--rm', '--name', container, '--network', 'none',
    '--cpus', '1', '--memory', '1g', '--pids-limit', '128', '--read-only',
    '--security-opt', 'no-new-privileges',
    '--tmpfs', '/var/lib/postgresql/data:rw,size=512m',
    '--tmpfs', '/var/run/postgresql:rw,size=16m', '--tmpfs', '/tmp:rw,size=256m',
    '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', '-e', 'POSTGRES_DB=appboca_qa',
    ...mount('supabase/migrations', '/migrations'),
    ...mount('supabase/tests', '/tests'),
    ...mount('tests/postgres', '/fixtures'),
    image, '-c', 'wal_level=logical']);
  created = true;

  let ready = false;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const check = spawnSync('docker', ['exec', container, 'pg_isready', '-U', 'postgres', '-d', 'appboca_qa'], { timeout: 5000 });
    if (check.status === 0) { ready = true; break; }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  assert.ok(ready, 'PostgreSQL não ficou pronto em 30 tentativas.');

  sql('/fixtures/bootstrap.sql');
  const migrations = fs.readdirSync(path.join(root, 'supabase/migrations')).filter(name => name.endsWith('.sql')).sort();
  const tests = fs.readdirSync(path.join(root, 'supabase/tests')).filter(name => name.endsWith('.sql')).sort();
  for (const name of migrations) sql(`/migrations/${name}`);
  console.log(`PASS: ${migrations.length} migrations reconstruídas.`);
  for (const name of tests) {
    sql(`/tests/${name}`);
    console.log(`PASS: ${name}`);
  }

  sql('/fixtures/backup-fixture.sql');
  const before = sql('/fixtures/fingerprint.sql');
  assert.match(before, /^[0-9a-f]{32}$/);
  docker(['exec', container, 'pg_dump', '-U', 'postgres', '-Fc', '--no-owner', '-f', '/tmp/qa.dump', 'appboca_qa']);
  docker(['exec', container, 'createdb', '-U', 'postgres', '-T', 'template0', 'appboca_restore']);
  docker(['exec', container, 'pg_restore', '-U', 'postgres', '--exit-on-error', '--no-owner', '-d', 'appboca_restore', '/tmp/qa.dump']);
  const after = sql('/fixtures/fingerprint.sql', 'appboca_restore');
  assert.equal(after, before, 'Restauração alterou dados, policies ou RLS.');
  for (const name of tests) sql(`/tests/${name}`, 'appboca_restore');
  console.log('PASS: pg_dump/pg_restore; dados, RLS e policies iguais; testes repetidos no banco restaurado.');

  const report = {
    status: 'passed', image, migrations: migrations.length, tests: tests.length,
    testsRepeatedAfterRestore: tests.length, fingerprint: before,
    elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
    limits: { network: 'none', cpus: 1, memory: '1g', pids: 128, readOnlyMounts: true },
    scope: 'PostgreSQL 17 local, dados sintéticos, compatibilidade mínima Auth/Storage. Não restaura produção ou objetos Storage.',
  };
  if (process.argv[2]) {
    const destination = path.resolve(root, process.argv[2]);
    assert.ok(destination.startsWith(root + path.sep), 'Relatório deve permanecer no projeto.');
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, JSON.stringify(report, null, 2) + '\n');
  }
  console.log(JSON.stringify(report));
} finally {
  if (created) docker(['stop', '--time', '5', container]);
}
