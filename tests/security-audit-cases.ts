import assert from 'node:assert/strict';
import { reviewAudit } from '../scripts/security-audit.mjs';

export const securityAuditTestCases = [
  { name: 'auditoria resolve ciclos transitivos sem aceitar novas fontes ou ciclos sem advisory', run() {
    const root = { severity: 'high', nodes: ['node_modules/example'], via: [{ name: 'example', severity: 'high', url: 'https://github.com/advisories/known' }] };
    const report = { vulnerabilities: { example: root, metro: { severity: 'high', via: ['config', 'example'], nodes: [] }, config: { severity: 'high', via: ['metro'], nodes: [] } } };
    const lock = { packages: { 'node_modules/example': { version: '1.0.0' } } };
    const exceptions = [{ package: 'example', version: '1.0.0', nodes: ['node_modules/example'], advisory: 'https://github.com/advisories/known', expires: '2026-11-12', approved: true }];
    const now = new Date('2026-10-13');
    assert.deepEqual(reviewAudit(report, lock, exceptions, now).blocked, []);
    const newSource = { ...report, vulnerabilities: { ...report.vulnerabilities, config: { ...report.vulnerabilities.config, via: ['metro', 'unknown'] } } };
    assert.deepEqual(reviewAudit(newSource, lock, exceptions, now).blocked, ['metro', 'config']);
    const orphanCycle = { vulnerabilities: { metro: { severity: 'high', via: ['config'], nodes: [] }, config: { severity: 'high', via: ['metro'], nodes: [] } } };
    assert.deepEqual(reviewAudit(orphanCycle, lock, exceptions, now).blocked, ['metro', 'config']);
    const newAdvisory = { vulnerabilities: { ...report.vulnerabilities, example: { ...root, via: [...root.via, { name: 'example', severity: 'critical', url: 'https://github.com/advisories/new' }] } } };
    assert.deepEqual(reviewAudit(newAdvisory, lock, exceptions, now).blocked, ['example', 'metro', 'config']);
  } },
  { name: 'auditoria só aceita exceção aprovada, exata, vigente e com mesma versão instalada', run() {
    const root = { severity: 'high', nodes: ['node_modules/example'], via: [{ name: 'example', severity: 'high', url: 'https://github.com/advisories/known' }] };
    const report = { vulnerabilities: { example: root, parent: { severity: 'high', via: ['example'], nodes: ['node_modules/parent'] } } };
    const lock = { packages: { 'node_modules/example': { version: '1.0.0' } } };
    const exception = { package: 'example', version: '1.0.0', nodes: ['node_modules/example'], advisory: 'https://github.com/advisories/known', expires: '2026-11-12', approved: true };
    const now = new Date('2026-10-13');
    assert.equal(reviewAudit(report, lock, [{ ...exception, approved: false }], now).blocked.length, 2);
    assert.equal(reviewAudit(report, lock, [exception], now).blocked.length, 0);
    assert.equal(reviewAudit(report, lock, [exception], new Date('2026-11-12')).blocked.length, 2);
    assert.equal(reviewAudit(report, lock, [{ ...exception, version: '1.0.1' }], now).blocked.length, 2);
    assert.equal(reviewAudit(report, lock, [{ ...exception, advisory: 'other' }], now).blocked.length, 2);
    const another = { vulnerabilities: { ...report.vulnerabilities, fresh: { ...root, via: [{ name: 'example', severity: 'critical', url: 'https://github.com/advisories/new' }] } } };
    assert.deepEqual(reviewAudit(another, lock, [exception], now).blocked, ['fresh']);
    const escalated = { vulnerabilities: { example: { ...root, severity: 'critical', via: [{ ...root.via[0], severity: 'critical' }] } } };
    assert.deepEqual(reviewAudit(escalated, lock, [exception], now).blocked, ['example']);
    const criticalParent = { vulnerabilities: { ...report.vulnerabilities, parent: { ...report.vulnerabilities.parent, severity: 'critical' } } };
    assert.deepEqual(reviewAudit(criticalParent, lock, [exception], now).blocked, ['parent']);
    assert.throws(() => reviewAudit({ error: {} }, lock, [], now), /válido/);
  } },
];
