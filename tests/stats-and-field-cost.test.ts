import assert from 'node:assert/strict';
import test from 'node:test';

import { buildMatchFieldCost, getMatchFieldPaymentSummary } from '@/lib/field-cost';
import {
  buildManualAdjustmentsFromDesiredTotals,
  buildPlayerAggregates,
  buildRankingByMetric,
  getDesiredTotalsFromManualAdjustments,
} from '@/lib/stats';

import {
  createAttendance,
  createMatch,
  createMatchStat,
  createPlayer,
  createSnapshot,
  createTeam,
} from './test-helpers';

test('totais finais refletem calculo do app somado ao ajuste manual', () => {
  const computed = {
    matches: 10,
    goals: 3,
    assists: 4,
    wins: 6,
    draws: 2,
    losses: 2,
    mvps: 1,
  };
  const desired = {
    matches: 12,
    goals: 5,
    assists: 6,
    wins: 7,
    draws: 2,
    losses: 3,
    mvps: 2,
  };

  const manual = buildManualAdjustmentsFromDesiredTotals(computed, desired);

  assert.deepEqual(manual, {
    matches: 2,
    goals: 2,
    assists: 2,
    wins: 1,
    draws: 0,
    losses: 1,
    mvps: 1,
  });
  assert.deepEqual(getDesiredTotalsFromManualAdjustments(computed, manual), desired);
});

test('ranking usa o total final do jogador e preserva historico de atleta inativo', () => {
  const team = createTeam({ id: 'team-stats' });
  const match = createMatch({ id: 'match-stats', teamId: team.id });
  const activePlayer = createPlayer({
    id: 'player-active',
    teamId: team.id,
    manualStats: {
      matches: 0,
      goals: 2,
      assists: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      mvps: 0,
    },
  });
  const inactivePlayer = createPlayer({
    id: 'player-inactive',
    teamId: team.id,
    status: 'inactive',
    deletedAt: '2026-05-22T10:00:00.000Z',
  });

  const snapshot = createSnapshot({
    teams: [team],
    players: [activePlayer, inactivePlayer],
    matches: [match],
    attendance: [
      createAttendance({
        id: 'attendance-active',
        teamId: team.id,
        matchId: match.id,
        playerId: activePlayer.id,
        status: 'confirmed',
      }),
      createAttendance({
        id: 'attendance-inactive',
        teamId: team.id,
        matchId: match.id,
        playerId: inactivePlayer.id,
        status: 'confirmed',
      }),
    ],
    matchStats: [
      createMatchStat({
        id: 'stat-active',
        teamId: team.id,
        matchId: match.id,
        playerId: activePlayer.id,
        goals: 1,
      }),
      createMatchStat({
        id: 'stat-inactive',
        teamId: team.id,
        matchId: match.id,
        playerId: inactivePlayer.id,
        goals: 2,
      }),
    ],
  });

  const aggregates = buildPlayerAggregates(snapshot, team.id);
  const rankedByGoals = buildRankingByMetric(aggregates, 'goals');

  assert.equal(aggregates.find((item) => item.player.id === inactivePlayer.id)?.goals, 2);
  assert.equal(aggregates.find((item) => item.player.id === inactivePlayer.id)?.isActive, false);
  assert.equal(rankedByGoals[0]?.player.id, activePlayer.id);
  assert.equal(rankedByGoals[0]?.goals, 3);
});

test('valor do campo calcula R$ 120 dividido por 8 como R$ 15 por pessoa', () => {
  const fieldCost = buildMatchFieldCost({
    values: {
      totalAmount: 120,
      splitCount: 8,
    },
    updatedAt: '2026-06-02T18:00:00.000Z',
    updatedByUserId: 'user-admin',
  });

  assert.equal(fieldCost.amountPerPlayer, 15);

  const summary = getMatchFieldPaymentSummary(fieldCost, null);

  assert.equal(summary.totalPaidCount, 0);
  assert.equal(summary.totalReceived, 0);
  assert.equal(summary.pendingCount, 8);
  assert.equal(summary.pendingAmount, 120);
});
