import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function reviewAudit(report, lock, exceptions, now = new Date()) {
  if (!report?.vulnerabilities || report.error) throw new Error('A auditoria não retornou um relatório válido.');
  const findings = report.vulnerabilities;
  function sources(name, seen = new Set()) {
    if (seen.has(name)) return [];
    if (!findings[name]) return [{ package: name, url: 'unresolved', nodes: [] }];
    const visited = new Set(seen).add(name);
    return findings[name].via.flatMap(via => typeof via === 'string' ? sources(via, visited) :
      ['high', 'critical'].includes(via.severity) ? [{ package: via.name, url: via.url, severity: via.severity, nodes: findings[name].nodes }] : []);
  }
  const allowed = [];
  const blocked = [];
  for (const [name, finding] of Object.entries(findings)) {
    if (!['high', 'critical'].includes(finding.severity)) continue;
    if (finding.severity === 'critical') {
      blocked.push(name);
      continue;
    }
    const rootFindings = sources(name);
    const covered = rootFindings.length > 0 && rootFindings.every(root => exceptions.some(exception =>
      root.severity === 'high' && exception.approved === true && exception.package === root.package && exception.advisory === root.url &&
      now < new Date(exception.expires + 'T00:00:00Z') && root.nodes.length > 0 && root.nodes.every(node =>
        exception.nodes.includes(node) && lock.packages[node]?.version === exception.version)));
    (covered ? allowed : blocked).push(name);
  }
  return { allowed, blocked };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (!process.env.npm_execpath) throw new Error('Execute por npm run audit:security.');
    const result = spawnSync(process.execPath, [process.env.npm_execpath, 'audit', '--omit=dev', '--audit-level=high', '--json'], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
    if (result.error || ![0, 1].includes(result.status)) throw new Error('Não foi possível executar a auditoria.');
    const report = JSON.parse(result.stdout);
    const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
    const exceptions = JSON.parse(fs.readFileSync('security/audit-exceptions.json', 'utf8'));
    const reviewed = reviewAudit(report, lock, exceptions);
    console.log('Resumo npm audit:', JSON.stringify(report.metadata.vulnerabilities));
    console.log('Exceções aprovadas e vigentes:', reviewed.allowed.join(', ') || 'nenhuma');
    console.log('Bloqueios:', reviewed.blocked.join(', ') || 'nenhum');
    process.exitCode = reviewed.blocked.length ? 1 : 0;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
