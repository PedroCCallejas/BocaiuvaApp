import assert from 'node:assert/strict';

import { buildMatchFieldCost, getMatchFieldPaymentSummary } from '@/lib/field-cost';
import {
  buildInactivatedPlayerState,
  buildReactivatedPlayerState,
  buildUnlinkedPlayerState,
  canEditPlayerProfile,
  canManagePlayerAccountLinking,
  canManagePlayerLifecycle,
} from '@/lib/player-management';
import { buildPublicTeamProfile, buildPublicTeamSummary } from '@/lib/public-team';
import { getActiveRatingCriteria } from '@/lib/rating-criteria';
import {
  buildManualAdjustmentsFromDesiredTotals,
  buildPlayerAggregates,
  buildRankingByMetric,
  getDesiredTotalsFromManualAdjustments,
  splitCriteriaSummaryEntries,
} from '@/lib/stats';
import {
  findPlayerById,
  selectCanManageTeam,
  selectTeamHistoricalPlayers,
  selectTeamPlayers,
} from '@/store/selectors';
import {
  canCreateTeamFromOwnedTeamsCount,
  getOwnedTeamsCount,
  OWNED_TEAMS_LIMIT_REACHED_MESSAGE,
} from '@/lib/team';

import {
  createAttendance,
  createCriterion,
  createMatch,
  createMatchStat,
  createPlayer,
  createSnapshot,
  createTeam,
  createTeamMember,
  createUser,
} from './test-helpers';

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

const testCases: TestCase[] = [
  {
    name: 'inativar jogador preserva historico e apenas muda o estado do cadastro',
    run() {
      const player = createPlayer({
        linkedUserId: 'user-1',
        linkedEmail: 'atleta@professo.test',
        manualStats: {
          matches: 12,
          goals: 7,
          assists: 3,
          wins: 6,
          draws: 2,
          losses: 4,
          mvps: 1,
        },
      });

      const updated = buildInactivatedPlayerState(player, '2026-06-02T15:00:00.000Z');

      assert.equal(updated.status, 'inactive');
      assert.equal(updated.deletedAt, '2026-06-02T15:00:00.000Z');
      assert.equal(updated.linkedUserId, player.linkedUserId);
      assert.deepEqual(updated.manualStats, player.manualStats);
    },
  },
  {
    name: 'reativar jogador devolve o cadastro para o elenco ativo',
    run() {
      const player = createPlayer({
        status: 'inactive',
        deletedAt: '2026-05-01T10:00:00.000Z',
      });

      const updated = buildReactivatedPlayerState(player, '2026-06-02T15:00:00.000Z');

      assert.equal(updated.status, 'active');
      assert.equal(updated.deletedAt, null);
      assert.equal(updated.updatedAt, '2026-06-02T15:00:00.000Z');
    },
  },
  {
    name: 'desvincular conta limpa o vinculo sem apagar estatisticas do jogador',
    run() {
      const player = createPlayer({
        linkedUserId: 'user-2',
        linkedEmail: 'vinculado@professo.test',
        manualStats: {
          matches: 8,
          goals: 5,
          assists: 4,
          wins: 4,
          draws: 1,
          losses: 3,
          mvps: 2,
        },
      });

      const updated = buildUnlinkedPlayerState(player, '2026-06-02T16:00:00.000Z');

      assert.equal(updated.linkedUserId, null);
      assert.equal(updated.linkedEmail, null);
      assert.deepEqual(updated.manualStats, player.manualStats);
    },
  },
  {
    name: 'somente quem gerencia o time pode inativar ou desvincular jogador',
    run() {
      assert.equal(canManagePlayerLifecycle({ canManageTeam: true }), true);
      assert.equal(canManagePlayerLifecycle({ canManageTeam: false }), false);
      assert.equal(canManagePlayerAccountLinking({ canManageTeam: true }), true);
      assert.equal(canManagePlayerAccountLinking({ canManageTeam: false }), false);
    },
  },
  {
    name: 'selector de elenco ativo remove jogador inativo, mas o historico continua acessivel',
    run() {
      const team = createTeam({ id: 'team-1' });
      const user = createUser({ id: 'user-1', activeTeamId: team.id, teamId: team.id });
      const membership = createTeamMember({
        userId: user.id,
        teamId: team.id,
        playerId: 'player-1',
        roles: ['player'],
        canManagePlayers: false,
      });
      const activePlayer = createPlayer({ id: 'player-1', teamId: team.id, status: 'active' });
      const inactivePlayer = createPlayer({
        id: 'player-2',
        teamId: team.id,
        status: 'inactive',
        deletedAt: '2026-05-01T10:00:00.000Z',
      });

      const state = {
        currentUserId: user.id,
        snapshot: createSnapshot({
          users: [user],
          teams: [team],
          teamMembers: [membership],
          players: [activePlayer, inactivePlayer],
        }),
      };

      assert.deepEqual(
        selectTeamPlayers(state).map((player) => player.id),
        [activePlayer.id],
      );
      assert.deepEqual(
        selectTeamHistoricalPlayers(state).map((player) => player.id).sort(),
        [activePlayer.id, inactivePlayer.id].sort(),
      );
    },
  },
  {
    name: 'jogador comum continua vendo outro perfil, mas nao pode editar outro jogador',
    run() {
      const viewer = createUser({ id: 'user-viewer' });
      const team = createTeam({ id: 'team-2' });
      const player = createPlayer({ id: 'player-10', teamId: team.id });
      const snapshot = createSnapshot({
        users: [viewer],
        teams: [team],
        players: [player],
      });

      assert.equal(findPlayerById({ snapshot }, player.id)?.id, player.id);
      assert.equal(
        canEditPlayerProfile({
          canManagePlayers: false,
          currentPlayerId: 'player-viewer',
          targetPlayerId: player.id,
        }),
        false,
      );
      assert.equal(
        canEditPlayerProfile({
          canManagePlayers: false,
          currentPlayerId: player.id,
          targetPlayerId: player.id,
        }),
        true,
      );
    },
  },
  {
    name: 'admin do time tem permissao de gestao e pode editar outros jogadores',
    run() {
      const team = createTeam({ id: 'team-3' });
      const admin = createUser({ id: 'user-admin', activeTeamId: team.id, teamId: team.id });
      const membership = createTeamMember({
        userId: admin.id,
        teamId: team.id,
        roles: ['admin'],
        canManageTeam: true,
        canManagePlayers: true,
      });

      const state = {
        currentUserId: admin.id,
        snapshot: createSnapshot({
          users: [admin],
          teams: [team],
          teamMembers: [membership],
        }),
      };

      assert.equal(selectCanManageTeam(state), true);
      assert.equal(
        canEditPlayerProfile({
          canManagePlayers: true,
          currentPlayerId: null,
          targetPlayerId: 'player-99',
        }),
        true,
      );
    },
  },
  {
    name: 'contagem de times considera apenas os times em que o usuario e dono',
    run() {
      const ownerId = 'user-owner';
      const teams = [
        createTeam({ id: 'team-a', adminUserId: ownerId }),
        createTeam({ id: 'team-b', adminUserId: ownerId }),
        createTeam({ id: 'team-c', adminUserId: 'user-other' }),
      ];

      assert.equal(getOwnedTeamsCount(teams, ownerId), 2);
      assert.equal(getOwnedTeamsCount(teams, 'user-other'), 1);
    },
  },
  {
    name: 'terceiro time e bloqueado quando a conta ja administra dois',
    run() {
      assert.equal(canCreateTeamFromOwnedTeamsCount(0), true);
      assert.equal(canCreateTeamFromOwnedTeamsCount(1), true);
      assert.equal(canCreateTeamFromOwnedTeamsCount(2), false);
      assert.equal(
        OWNED_TEAMS_LIMIT_REACHED_MESSAGE,
        'Você já atingiu o limite de 2 times por conta.',
      );
    },
  },
  {
    name: 'totais finais refletem calculo do app somado ao ajuste manual',
    run() {
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
    },
  },
  {
    name: 'ranking usa o total final do jogador e preserva historico de atleta inativo',
    run() {
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
    },
  },
  {
    name: 'valor do campo calcula R$ 120 dividido por 8 como R$ 15 por pessoa',
    run() {
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
    },
  },
  {
    name: 'novas avaliacoes consideram apenas criterios ativos do time',
    run() {
      const activeCriterion = createCriterion({
        id: 'criterion-active',
        label: 'Compromisso',
        active: true,
        order: 0,
      });
      const inactiveCriterion = createCriterion({
        id: 'criterion-legacy',
        label: 'Folego',
        active: false,
        order: 1,
      });

      const activeCriteria = getActiveRatingCriteria([inactiveCriterion, activeCriterion]);

      assert.deepEqual(activeCriteria.map((criterion) => criterion.id), [activeCriterion.id]);
    },
  },
  {
    name: 'criterios historicos continuam separados do conjunto ativo atual',
    run() {
      const activeCriterion = createCriterion({
        id: 'criterion-active',
        label: 'Compromisso',
        active: true,
        type: 'positive',
      });
      const legacyCriterion = createCriterion({
        id: 'criterion-legacy',
        label: 'Folego',
        active: false,
        type: 'negative',
      });

      const summary = {
        criteriaAverages: {
          [activeCriterion.id]: 8.4,
          [legacyCriterion.id]: 6.8,
        },
        criteriaAdjustedAverages: {
          [activeCriterion.id]: 8.4,
          [legacyCriterion.id]: 6.8,
        },
        criteriaCounts: {
          [activeCriterion.id]: 3,
          [legacyCriterion.id]: 2,
        },
        criteriaSnapshotById: {
          [activeCriterion.id]: {
            criterionId: activeCriterion.id,
            label: activeCriterion.label,
            type: activeCriterion.type,
            weight: activeCriterion.weight,
            order: activeCriterion.order,
          },
          [legacyCriterion.id]: {
            criterionId: legacyCriterion.id,
            label: legacyCriterion.label,
            type: legacyCriterion.type,
            weight: legacyCriterion.weight,
            order: legacyCriterion.order,
          },
        },
      };

      const sections = splitCriteriaSummaryEntries(summary, [activeCriterion]);

      assert.deepEqual(sections.active.map((item) => item.criterionId), [activeCriterion.id]);
      assert.deepEqual(sections.legacy.map((item) => item.criterionId), [legacyCriterion.id]);
    },
  },
  {
    name: 'time privado nao aparece na galeria publica',
    run() {
      const privateTeam = createTeam({
        id: 'team-private',
        isPublic: false,
        city: 'Cuiaba',
        state: 'MT',
      });

      assert.equal(buildPublicTeamSummary(privateTeam, []), null);
    },
  },
  {
    name: 'time publico aparece na galeria quando tem cidade e estado',
    run() {
      const publicTeam = createTeam({
        id: 'team-public',
        name: 'Professo United',
        isPublic: true,
        city: 'Cuiaba',
        state: 'MT',
        publicDescription: 'Time de bairro pronto para amistosos.',
      });
      const match = createMatch({ teamId: publicTeam.id });

      const summary = buildPublicTeamSummary(publicTeam, [match]);

      assert.equal(summary?.id, publicTeam.id);
      assert.equal(summary?.city, 'Cuiaba');
      assert.equal(summary?.state, 'MT');
    },
  },
  {
    name: 'elenco publico so aparece quando publicRosterEnabled esta ativo',
    run() {
      const team = createTeam({
        id: 'team-roster',
        isPublic: true,
        city: 'Cuiaba',
        state: 'MT',
        publicRosterEnabled: false,
      });
      const activePlayer = createPlayer({ id: 'player-public', teamId: team.id, status: 'active' });
      const inactivePlayer = createPlayer({
        id: 'player-inactive',
        teamId: team.id,
        status: 'inactive',
        deletedAt: '2026-05-01T10:00:00.000Z',
      });

      const hiddenRosterProfile = buildPublicTeamProfile(team, [], [activePlayer, inactivePlayer]);

      assert.equal(hiddenRosterProfile?.publicRosterEnabled, false);
      assert.deepEqual(hiddenRosterProfile?.roster, []);

      const visibleProfile = buildPublicTeamProfile(
        {
          ...team,
          publicRosterEnabled: true,
        },
        [],
        [activePlayer, inactivePlayer],
      );

      assert.equal(visibleProfile?.publicRosterEnabled, true);
      assert.deepEqual(visibleProfile?.roster.map((player) => player.id), [activePlayer.id]);
    },
  },
];

let failed = 0;

for (const testCase of testCases) {
  try {
    await testCase.run();
    console.log(`ok - ${testCase.name}`);
  } catch (error) {
    failed += 1;
    console.error(`not ok - ${testCase.name}`);
    console.error(error);
  }
}

if (failed > 0) {
  console.error(`Falhas: ${failed}/${testCases.length}`);
  process.exitCode = 1;
} else {
  console.log(`Todos os ${testCases.length} testes passaram.`);
}
