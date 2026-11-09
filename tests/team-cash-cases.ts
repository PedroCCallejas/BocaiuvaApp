import assert from 'node:assert/strict';
import fs from 'node:fs';
import { cashAmount, cashTotal, cashWeekStart } from '@/lib/team-cash';

export const teamCashTestCases = [
  { name: 'caixa normaliza semana sem depender do fuso', run() {
    assert.equal(cashWeekStart('2026-11-09'), '2026-11-09');
    assert.equal(cashWeekStart('2026-11-15'), '2026-11-09');
    assert.equal(cashWeekStart('2027-01-01'), '2026-12-28');
    for (const date of ['', '2026-02-30', '09/11/2026', '2026-13-01']) assert.throws(() => cashWeekStart(date));
  }},
  { name: 'caixa valida dinheiro em centavos sem valores inventados', run() {
    assert.equal(cashAmount('150,50'), 15050);
    assert.equal(cashAmount('1.500,50'), 150050);
    assert.equal(cashAmount('0,01'), 1);
    for (const value of ['', '0', '-1', 'abc100', '1,234', 'Infinity', '999999999999999']) assert.throws(() => cashAmount(value));
    assert.equal(cashTotal([]), 0);
    assert.equal(cashTotal([10001, 20002].map((amount_cents, i) => ({
      id: String(i), team_id: 'fixture', week_start: '2026-11-09', amount_cents, description: null,
    }))), 30003);
  }},
  { name: 'caixa congela RLS, paginação e isolamento por time', run() {
    const sql = fs.readFileSync('supabase/migrations/20261109135601_caixa_semanal.sql', 'utf8');
    assert.match(sql, /enable row level security/);
    assert.match(sql, /from public, anon, authenticated/);
    assert.match(sql, /unique \(team_id, week_start\)/);
    assert.match(sql, /with check \(app.can_manage_team\(team_id\)\)/);
    const service = fs.readFileSync('src/services/repository/supabase/caixa.ts', 'utf8');
    assert.match(service, /todasAsLinhas/);
    assert.match(service, /\.eq\('id', input.id\)\.eq\('team_id', input.teamId\)/);
    const hook = fs.readFileSync('src/hooks/use-team-cash.ts', 'utf8');
    assert.match(hook, /request === generation.current/);
    assert.match(hook, /state.key === key/);
  }},
];
