import assert from 'node:assert/strict';
import test from 'node:test';

import { PLAYER_STATUS_LABELS } from '@/constants/options';
import { isPlayerInactive } from '@/lib/player-management';
import { buildPlayerAggregates, buildRankingByMetric } from '@/lib/stats';

import {
  createAttendance,
  createMatch,
  createMatchStat,
  createPlayer,
  createSnapshot,
  createTeam,
} from './test-helpers';

// ── isPlayerInactive ─────────────────────────────────────────────────────────

test('isPlayerInactive retorna false apenas para jogador ativo sem deletedAt', () => {
  const active = createPlayer({ status: 'active', deletedAt: null });
  const injured = createPlayer({ status: 'injured', deletedAt: null });
  const inactive = createPlayer({ status: 'inactive', deletedAt: null });
  const suspended = createPlayer({ status: 'suspended', deletedAt: null });
  const activeWithDeletedAt = createPlayer({ status: 'active', deletedAt: '2026-05-01T00:00:00.000Z' });

  assert.equal(isPlayerInactive(active), false, 'ativo → false');
  assert.equal(isPlayerInactive(injured), true, 'lesionado → true (deve exibir botão Reativar)');
  assert.equal(isPlayerInactive(inactive), true, 'inativo → true');
  assert.equal(isPlayerInactive(suspended), true, 'antigo (suspended) → true');
  assert.equal(isPlayerInactive(activeWithDeletedAt), true, 'ativo com deletedAt → true');
});

// ── labels de status ──────────────────────────────────────────────────────────

test('suspended exibe "Antigo" e nenhum status exibe "Suspenso"', () => {
  assert.equal(PLAYER_STATUS_LABELS.suspended, 'Antigo');
  assert.equal(PLAYER_STATUS_LABELS.active, 'Ativo');
  assert.equal(PLAYER_STATUS_LABELS.injured, 'Lesionado');
  assert.equal(PLAYER_STATUS_LABELS.inactive, 'Inativo');
  const allLabels = Object.values(PLAYER_STATUS_LABELS);
  assert.ok(!allLabels.includes('Suspenso'), 'nenhum label deve exibir "Suspenso"');
});

// ── estatísticas históricas: jogador lesionado ────────────────────────────────

test('jogador lesionado mantém gols e assistências de jogo encerrado', () => {
  const team = createTeam({ id: 'team-inj-stats' });
  const match = createMatch({ teamId: team.id, status: 'finished' });
  const player = createPlayer({ id: 'p-injured', teamId: team.id, status: 'injured' });

  const snapshot = createSnapshot({
    teams: [team],
    players: [player],
    matches: [match],
    attendance: [createAttendance({ teamId: team.id, matchId: match.id, playerId: player.id, status: 'confirmed' })],
    matchStats: [createMatchStat({ teamId: team.id, matchId: match.id, playerId: player.id, goals: 1, assists: 2 })],
  });

  const agg = buildPlayerAggregates(snapshot, team.id).find((a) => a.player.id === player.id);

  assert.ok(agg, 'lesionado com histórico aparece no escopo padrão (with-history)');
  assert.equal(agg.goals, 1);
  assert.equal(agg.assists, 2);
  assert.equal(agg.games, 1);
  assert.equal(agg.isActive, false, 'isActive deve ser false para lesionado');
});

// ── estatísticas históricas: jogador antigo ───────────────────────────────────

test('jogador antigo (suspended) mantém estatísticas de jogo encerrado', () => {
  const team = createTeam({ id: 'team-sus-stats' });
  const match = createMatch({ teamId: team.id, status: 'finished' });
  const player = createPlayer({ id: 'p-suspended', teamId: team.id, status: 'suspended' });

  const snapshot = createSnapshot({
    teams: [team],
    players: [player],
    matches: [match],
    attendance: [createAttendance({ teamId: team.id, matchId: match.id, playerId: player.id, status: 'confirmed' })],
    matchStats: [createMatchStat({ teamId: team.id, matchId: match.id, playerId: player.id, goals: 3 })],
  });

  const agg = buildPlayerAggregates(snapshot, team.id).find((a) => a.player.id === player.id);

  assert.ok(agg, 'antigo com histórico aparece no escopo padrão (with-history)');
  assert.equal(agg.goals, 3);
  assert.equal(agg.isActive, false, 'isActive deve ser false para antigo');
});

// ── escopo "active": exclui não-ativos ────────────────────────────────────────

test('escopo "active" exclui lesionado, inativo e antigo do ranking', () => {
  const team = createTeam({ id: 'team-scope-active' });
  const match = createMatch({ teamId: team.id, status: 'finished' });

  const pActive = createPlayer({ id: 'p-act', teamId: team.id, status: 'active' });
  const pInjured = createPlayer({ id: 'p-inj', teamId: team.id, status: 'injured' });
  const pInactive = createPlayer({ id: 'p-ina', teamId: team.id, status: 'inactive', deletedAt: '2026-01-01T00:00:00.000Z' });
  const pSuspended = createPlayer({ id: 'p-sus', teamId: team.id, status: 'suspended' });

  const makeAttendance = (playerId: string) =>
    createAttendance({ teamId: team.id, matchId: match.id, playerId, status: 'confirmed' });
  const makeStat = (playerId: string, goals: number) =>
    createMatchStat({ teamId: team.id, matchId: match.id, playerId, goals });

  const snapshot = createSnapshot({
    teams: [team],
    players: [pActive, pInjured, pInactive, pSuspended],
    matches: [match],
    attendance: [pActive, pInjured, pInactive, pSuspended].map((p) => makeAttendance(p.id)),
    matchStats: [
      makeStat(pActive.id, 1),
      makeStat(pInjured.id, 5),
      makeStat(pInactive.id, 4),
      makeStat(pSuspended.id, 3),
    ],
  });

  const aggregates = buildPlayerAggregates(snapshot, team.id, { playerScope: 'active' });
  const ids = new Set(aggregates.map((a) => a.player.id));

  assert.ok(ids.has(pActive.id), 'ativo deve aparecer no escopo active');
  assert.ok(!ids.has(pInjured.id), 'lesionado não deve aparecer no escopo active');
  assert.ok(!ids.has(pInactive.id), 'inativo não deve aparecer no escopo active');
  assert.ok(!ids.has(pSuspended.id), 'antigo não deve aparecer no escopo active');
});

// ── escopo "with-history": inclui não-ativos com histórico ───────────────────

test('escopo "with-history" inclui lesionado e antigo com histórico, exclui sem histórico', () => {
  const team = createTeam({ id: 'team-scope-wh' });
  const match = createMatch({ teamId: team.id, status: 'finished' });
  const injuredWithHistory = createPlayer({ id: 'p-inj-hist', teamId: team.id, status: 'injured' });
  const suspendedNoHistory = createPlayer({ id: 'p-sus-no-hist', teamId: team.id, status: 'suspended' });

  const snapshot = createSnapshot({
    teams: [team],
    players: [injuredWithHistory, suspendedNoHistory],
    matches: [match],
    attendance: [createAttendance({ teamId: team.id, matchId: match.id, playerId: injuredWithHistory.id, status: 'confirmed' })],
    matchStats: [createMatchStat({ teamId: team.id, matchId: match.id, playerId: injuredWithHistory.id, goals: 2 })],
  });

  const aggregates = buildPlayerAggregates(snapshot, team.id, { playerScope: 'with-history' });
  const ids = new Set(aggregates.map((a) => a.player.id));

  assert.ok(ids.has(injuredWithHistory.id), 'lesionado com histórico aparece em with-history');
  assert.ok(!ids.has(suspendedNoHistory.id), 'antigo sem histórico não aparece em with-history');
});

// ── escopo "all": inclui todos, mesmo sem histórico ──────────────────────────

test('escopo "all" inclui todos os jogadores independente de status ou histórico', () => {
  const team = createTeam({ id: 'team-scope-all' });
  const match = createMatch({ teamId: team.id, status: 'finished' });
  const pActive = createPlayer({ id: 'p-all-act', teamId: team.id, status: 'active' });
  const pInjured = createPlayer({ id: 'p-all-inj', teamId: team.id, status: 'injured' });
  const pSuspended = createPlayer({ id: 'p-all-sus', teamId: team.id, status: 'suspended' });

  const snapshot = createSnapshot({
    teams: [team],
    players: [pActive, pInjured, pSuspended],
    matches: [match],
    attendance: [createAttendance({ teamId: team.id, matchId: match.id, playerId: pInjured.id, status: 'confirmed' })],
    matchStats: [createMatchStat({ teamId: team.id, matchId: match.id, playerId: pInjured.id, goals: 4 })],
  });

  const aggregates = buildPlayerAggregates(snapshot, team.id, { playerScope: 'all' });
  const ids = new Set(aggregates.map((a) => a.player.id));

  assert.ok(ids.has(pActive.id), 'ativo aparece no escopo all');
  assert.ok(ids.has(pInjured.id), 'lesionado aparece no escopo all');
  assert.ok(ids.has(pSuspended.id), 'antigo aparece no escopo all mesmo sem histórico');

  const injAgg = aggregates.find((a) => a.player.id === pInjured.id);
  assert.equal(injAgg?.goals, 4, 'gols do lesionado preservados no escopo all');
});

// ── ranking geral inclui antigo com gols ──────────────────────────────────────

test('ranking geral (with-history) inclui antigo que tem mais gols que o ativo', () => {
  const team = createTeam({ id: 'team-rank-wh' });
  const match = createMatch({ teamId: team.id, status: 'finished' });
  const pActive = createPlayer({ id: 'p-rank-act', teamId: team.id, status: 'active' });
  const pSuspended = createPlayer({ id: 'p-rank-sus', teamId: team.id, status: 'suspended' });

  const snapshot = createSnapshot({
    teams: [team],
    players: [pActive, pSuspended],
    matches: [match],
    attendance: [
      createAttendance({ teamId: team.id, matchId: match.id, playerId: pActive.id, status: 'confirmed' }),
      createAttendance({ teamId: team.id, matchId: match.id, playerId: pSuspended.id, status: 'confirmed' }),
    ],
    matchStats: [
      createMatchStat({ teamId: team.id, matchId: match.id, playerId: pActive.id, goals: 2 }),
      createMatchStat({ teamId: team.id, matchId: match.id, playerId: pSuspended.id, goals: 5 }),
    ],
  });

  const aggregates = buildPlayerAggregates(snapshot, team.id, { playerScope: 'with-history' });
  const ranked = buildRankingByMetric(aggregates, 'goals');

  assert.ok(ranked.find((r) => r.player.id === pSuspended.id), 'antigo aparece no ranking geral');
  assert.equal(ranked[0]?.player.id, pSuspended.id, 'antigo com mais gols é o #1');
  assert.equal(ranked[0]?.goals, 5);
});

// ── partida não encerrada não conta para estatísticas ────────────────────────

test('jogo agendado não contribui para estatísticas históricas', () => {
  const team = createTeam({ id: 'team-sched-stats' });
  const scheduledMatch = createMatch({ teamId: team.id, status: 'scheduled' });
  const player = createPlayer({ id: 'p-sched', teamId: team.id, status: 'active' });

  const snapshot = createSnapshot({
    teams: [team],
    players: [player],
    matches: [scheduledMatch],
    attendance: [createAttendance({ teamId: team.id, matchId: scheduledMatch.id, playerId: player.id, status: 'confirmed' })],
    matchStats: [createMatchStat({ teamId: team.id, matchId: scheduledMatch.id, playerId: player.id, goals: 10 })],
  });

  const agg = buildPlayerAggregates(snapshot, team.id, { playerScope: 'all' }).find((a) => a.player.id === player.id);

  assert.equal(agg?.goals, 0, 'jogo agendado não conta nos gols');
  assert.equal(agg?.games, 0, 'jogo agendado não conta nos jogos');
});
