import assert from 'node:assert/strict';

import { buildMatchFieldCost, getMatchFieldPaymentSummary } from '@/lib/field-cost';
import {
  getProfilePhotoSaveErrorMessage,
  getProfilePhotoUploadErrorMessage,
} from '@/lib/profile-photo-errors';
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
  canSelfEditPlayerProfileWithMembershipLink,
  suggestPlayerLinksForUser,
} from '@/lib/player-linking';
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
  selectCurrentPlayer,
  selectCurrentTeam,
  selectTeamHistoricalPlayers,
  selectTeamPlayers,
} from '@/store/selectors';
import {
  buildBootstrapRecoverySnapshot,
  extractRepositoryPartialSnapshot,
  isRepositoryPermissionDeniedError,
  resolveBootstrapAccessNotice,
  shouldShowTeamAccessPermissionMessage,
  shouldShowUserAccountPermissionMessage,
} from '@/store/bootstrap-recovery';
import {
  canCreateTeamFromOwnedTeamsCount,
  getOwnedTeamsCount,
  OWNED_TEAMS_LIMIT_REACHED_MESSAGE,
} from '@/lib/team';
import {
  buildTeamMembershipIndexDocument,
  canCreateOwnMvpVote,
  canCreateOwnPlayerRating,
  canEditOwnPrivatePlayer,
  canManagePrivateTeamData,
  canManagePrivateTeamPlayers,
  canReadPrivateTeamData,
  canUpdateOwnAttendance,
} from '@/lib/team-membership-index';
import { appendCacheBustParam } from '@/lib/storage-url';
import { toFriendlyAuthError } from '@/services/auth/errors';
import {
  mockRepository,
  resetMockRepositoryState,
} from '@/services/repository/mock-repository';
import { normalizeTeamMemberStatus } from '@/lib/team-membership';
import {
  LOST_TEAM_ACCESS_MESSAGE,
  TEAM_ACCESS_PERMISSION_MESSAGE,
  USER_ACCOUNT_PERMISSION_MESSAGE,
} from '@/constants/access-notices';

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
    name: 'selector currentPlayer encontra o jogador pelo linkedEmail quando o membership ainda nao tem playerId',
    run() {
      const team = createTeam({ id: 'team-linked-email' });
      const user = createUser({
        id: 'user-linked-email',
        email: 'linked@professo.test',
        activeTeamId: team.id,
        teamId: team.id,
      });
      const membership = createTeamMember({
        userId: user.id,
        teamId: team.id,
        playerId: null,
        roles: ['player'],
      });
      const player = createPlayer({
        id: 'player-linked-email',
        teamId: team.id,
        linkedUserId: null,
        linkedEmail: user.email,
      });

      assert.equal(
        selectCurrentPlayer({
          currentUserId: user.id,
          snapshot: createSnapshot({
            users: [user],
            teams: [team],
            teamMembers: [membership],
            players: [player],
          }),
        })?.id,
        player.id,
      );
    },
  },
  {
    name: 'membership index libera leitura apenas para o proprio time privado',
    run() {
      const membership = createTeamMember({
        userId: 'user-private-reader',
        teamId: 'team-private-reader',
        playerId: 'player-private-reader',
        roles: ['player'],
      });
      const membershipIndex = buildTeamMembershipIndexDocument(membership);

      assert.equal(
        canReadPrivateTeamData({
          teamId: 'team-private-reader',
          userId: 'user-private-reader',
          membershipIndex,
        }),
        true,
      );
      assert.equal(membershipIndex.role, 'player');
      assert.equal(membershipIndex.sourceTeamMemberId, membership.id);
      assert.equal(
        canReadPrivateTeamData({
          teamId: 'team-other',
          userId: 'user-private-reader',
          membershipIndex,
        }),
        false,
      );
    },
  },
  {
    name: 'admin do time gerencia dados privados sem depender de activeTeamId no users',
    run() {
      assert.equal(
        canManagePrivateTeamData({
          teamId: 'team-admin-private',
          userId: 'user-admin-private',
          teamAdminUserId: 'user-admin-private',
        }),
        true,
      );
      assert.equal(
        canManagePrivateTeamPlayers({
          teamId: 'team-admin-private',
          userId: 'user-admin-private',
          teamAdminUserId: 'user-admin-private',
        }),
        true,
      );
    },
  },
  {
    name: 'jogador comum fica restrito ao proprio perfil, presenca e acoes de jogador',
    run() {
      const membership = createTeamMember({
        userId: 'user-common-player',
        teamId: 'team-common-player',
        playerId: 'player-common-player',
        roles: ['player'],
        canManageTeam: false,
        canManagePlayers: false,
      });
      const membershipIndex = buildTeamMembershipIndexDocument(membership);
      const fallbackMembershipIndex = buildTeamMembershipIndexDocument({
        ...membership,
        playerId: null,
      });
      const input = {
        teamId: 'team-common-player',
        userId: 'user-common-player',
        membershipIndex,
      };

      assert.equal(canManagePrivateTeamData(input), false);
      assert.equal(canManagePrivateTeamPlayers(input), false);
      assert.equal(
        canEditOwnPrivatePlayer({
          ...input,
          playerId: 'player-common-player',
        }),
        true,
      );
      assert.equal(
        canEditOwnPrivatePlayer({
          ...input,
          membershipIndex: fallbackMembershipIndex,
          playerId: 'player-linked-fallback',
          playerLinkedEmail: 'user-common-player@professo.test',
          userEmail: 'user-common-player@professo.test',
        }),
        true,
      );
      assert.equal(
        canEditOwnPrivatePlayer({
          ...input,
          playerId: 'player-other',
        }),
        false,
      );
      assert.equal(
        canUpdateOwnAttendance({
          ...input,
          playerId: 'player-common-player',
        }),
        true,
      );
      assert.equal(
        canUpdateOwnAttendance({
          ...input,
          playerId: 'player-other',
        }),
        false,
      );
      assert.equal(
        canCreateOwnMvpVote({
          ...input,
          voterPlayerId: 'player-common-player',
        }),
        true,
      );
      assert.equal(
        canCreateOwnPlayerRating({
          ...input,
          raterPlayerId: 'player-common-player',
        }),
        true,
      );
    },
  },
  {
    name: 'autoedicao do perfil aceita fallback por linkedEmail com membership ativo de jogador',
    run() {
      const membership = createTeamMember({
        userId: 'user-fallback',
        teamId: 'team-fallback',
        playerId: null,
        roles: ['player'],
      });
      const player = createPlayer({
        id: 'player-fallback',
        teamId: 'team-fallback',
        linkedUserId: null,
        linkedEmail: 'fallback@professo.test',
      });

      assert.equal(
        canSelfEditPlayerProfileWithMembershipLink({
          teamId: 'team-fallback',
          user: { id: 'user-fallback', email: 'fallback@professo.test' },
          membership,
          player,
        }),
        true,
      );
      assert.equal(
        canSelfEditPlayerProfileWithMembershipLink({
          teamId: 'team-fallback',
          user: { id: 'user-fallback', email: 'fallback@professo.test' },
          membership,
          player: createPlayer({
            id: 'player-other-fallback',
            teamId: 'team-fallback',
            linkedUserId: null,
            linkedEmail: 'other@professo.test',
          }),
        }),
        false,
      );
      assert.equal(
        canSelfEditPlayerProfileWithMembershipLink({
          teamId: 'team-fallback',
          user: { id: 'user-fallback', email: 'fallback@professo.test' },
          membership: {
            ...membership,
            playerId: 'player-other-membership',
          },
          player,
        }),
        false,
      );
      assert.equal(
        canSelfEditPlayerProfileWithMembershipLink({
          teamId: 'team-fallback',
          user: { id: 'user-fallback', email: 'fallback@professo.test' },
          membership: null,
          player,
        }),
        false,
      );
      assert.equal(
        canSelfEditPlayerProfileWithMembershipLink({
          teamId: 'team-fallback',
          user: { id: 'user-fallback', email: 'fallback@professo.test' },
          membership: {
            ...membership,
            status: 'inactive',
          },
          player,
        }),
        false,
      );
    },
  },
  {
    name: 'sugestao de vinculo prioriza nome, apelido e e-mail local da conta',
    run() {
      const team = createTeam({ id: 'team-suggestion-score' });
      const user = createUser({
        id: 'user-suggestion-score',
        email: 'joao.silva10@professo.test',
        displayName: 'João Silva',
      });
      const directMatch = createPlayer({
        id: 'player-direct-match',
        teamId: team.id,
        fullName: 'João Silva',
        nickname: 'João',
        linkedUserId: null,
      });
      const weakerMatch = createPlayer({
        id: 'player-weaker-match',
        teamId: team.id,
        fullName: 'Jonathan Souza',
        nickname: 'Jo',
        linkedUserId: null,
      });

      const suggestions = suggestPlayerLinksForUser({
        teamPlayers: [weakerMatch, directMatch],
        teamId: team.id,
        user,
      });

      assert.equal(suggestions[0]?.playerId, directMatch.id);
      assert.equal(suggestions.length > 0, true);
      assert.equal(
        suggestions[0]?.reasons.some(
          (reason) =>
            reason === 'Nome igual ao cadastro da conta' ||
            reason === 'Apelido parecido com o nome da conta',
        ),
        true,
      );
    },
  },
  {
    name: 'sugestao de vinculo nao oferece jogador ja ligado a outra conta',
    run() {
      const team = createTeam({ id: 'team-suggestion-blocked' });
      const user = createUser({
        id: 'user-suggestion-blocked',
        email: 'marquinhos@professo.test',
        displayName: 'Marquinhos',
      });
      const blockedPlayer = createPlayer({
        id: 'player-blocked-suggestion',
        teamId: team.id,
        fullName: 'Marquinhos Silva',
        nickname: 'Marquinhos',
        linkedUserId: 'user-other-linked',
      });

      const suggestions = suggestPlayerLinksForUser({
        teamPlayers: [blockedPlayer],
        teamId: team.id,
        user,
      });

      assert.deepEqual(suggestions, []);
    },
  },
  {
    name: 'mensagem do Google orienta quando a Vercel nao esta autorizada',
    run() {
      const friendlyError = toFriendlyAuthError(
        new Error('redirect_uri_mismatch: The redirect URI in the request is invalid.'),
        'Falhou.',
      );

      assert.equal(
        friendlyError.message,
        'O retorno do login com Google não confere com o domínio configurado. Revise a URL da Vercel no Firebase Authentication e no cliente OAuth da web.',
      );
    },
  },
  {
    name: 'login por e-mail continua funcionando mesmo com o fluxo Google separado',
    async run() {
      resetMockRepositoryState();
      const user = await mockRepository.login({
        email: 'admin@bocaiuva.app',
        password: '123456',
      });

      assert.equal(user.id, 'user-admin');
      assert.equal(user.email, 'admin@bocaiuva.app');
    },
  },
  {
    name: 'membership inativo perde acesso privado e nao pode votar ou avaliar',
    run() {
      const membership = createTeamMember({
        userId: 'user-inactive-private',
        teamId: 'team-inactive-private',
        playerId: 'player-inactive-private',
        status: 'inactive',
      });
      const membershipIndex = buildTeamMembershipIndexDocument(membership);
      const input = {
        teamId: 'team-inactive-private',
        userId: 'user-inactive-private',
        membershipIndex,
      };

      assert.equal(canReadPrivateTeamData(input), false);
      assert.equal(canManagePrivateTeamData(input), false);
      assert.equal(
        canCreateOwnMvpVote({
          ...input,
          voterPlayerId: 'player-inactive-private',
        }),
        false,
      );
      assert.equal(
        canCreateOwnPlayerRating({
          ...input,
          raterPlayerId: 'player-inactive-private',
        }),
        false,
      );
    },
  },
  {
    name: 'usuario sem membership index nao acessa dados privados do time',
    run() {
      assert.equal(
        canReadPrivateTeamData({
          teamId: 'team-without-membership',
          userId: 'user-without-membership',
          membershipIndex: null,
        }),
        false,
      );
    },
  },
  {
    name: 'user com activeTeamId valido e membership ativa mostra o time em team-access',
    run() {
      const team = createTeam({ id: 'team-active' });
      const user = createUser({
        id: 'user-active-team',
        activeTeamId: team.id,
        teamId: team.id,
      });
      const membership = createTeamMember({
        id: 'membership-active-team',
        userId: user.id,
        teamId: team.id,
        roles: ['player'],
      });

      assert.equal(
        selectCurrentTeam({
          currentUserId: user.id,
          snapshot: createSnapshot({
            users: [user],
            teams: [team],
            teamMembers: [membership],
          }),
        })?.id,
        team.id,
      );
    },
  },
  {
    name: 'selector usa a primeira membership ativa quando activeTeamId ainda esta vazio',
    run() {
      const team = createTeam({ id: 'team-fallback' });
      const user = createUser({
        id: 'user-fallback',
        activeTeamId: null,
        teamId: null,
        playerId: null,
      });
      const membership = createTeamMember({
        id: 'membership-fallback',
        userId: user.id,
        teamId: team.id,
        playerId: 'player-fallback',
        roles: ['player'],
      });

      assert.equal(
        selectCurrentTeam({
          currentUserId: user.id,
          snapshot: createSnapshot({
            users: [user],
            teams: [team],
            teamMembers: [membership],
            accessNotice: null,
          }),
        })?.id,
        team.id,
      );
    },
  },
  {
    name: 'membership com doc id aleatorio continua resolvendo o teamId correto',
    run() {
      const team = createTeam({ id: 'team-random-membership' });
      const user = createUser({
        id: 'user-random-membership',
        activeTeamId: null,
        teamId: null,
      });
      const membership = createTeamMember({
        id: 'L8gP2nQx9ZkA41f',
        userId: user.id,
        teamId: team.id,
        playerId: 'player-random-membership',
      });

      assert.equal(
        selectCurrentTeam({
          currentUserId: user.id,
          snapshot: createSnapshot({
            users: [user],
            teams: [team],
            teamMembers: [membership],
            accessNotice: null,
          }),
        })?.id,
        team.id,
      );
    },
  },
  {
    name: 'status legado de membership e normalizado como ativo quando esperado',
    run() {
      assert.equal(normalizeTeamMemberStatus('accepted'), 'active');
      assert.equal(normalizeTeamMemberStatus('joined'), 'active');
      assert.equal(normalizeTeamMemberStatus('ativo'), 'active');
      assert.equal(normalizeTeamMemberStatus('member'), 'active');
      assert.equal(normalizeTeamMemberStatus('pending'), 'inactive');
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
  {
    name: 'permission-denied em users vira aviso especifico da conta',
    run() {
      const error = Object.assign(new Error('Missing or insufficient permissions'), {
        code: 'permission-denied',
        context: {
          collection: 'users',
        },
      });

      assert.equal(shouldShowTeamAccessPermissionMessage(error), false);
      assert.equal(shouldShowUserAccountPermissionMessage(error), true);
      assert.equal(
        resolveBootstrapAccessNotice(error, createSnapshot()),
        USER_ACCOUNT_PERMISSION_MESSAGE,
      );
    },
  },
  {
    name: 'permission-denied em teamMembers e teams vira aviso de permissoes no team-access',
    run() {
      for (const collection of ['teamMembers', 'teams']) {
        const error = Object.assign(new Error('Missing or insufficient permissions'), {
          code: 'permission-denied',
          context: {
            collection,
          },
        });

        assert.equal(shouldShowTeamAccessPermissionMessage(error), true);
        assert.equal(shouldShowUserAccountPermissionMessage(error), false);
        assert.equal(
          resolveBootstrapAccessNotice(error, createSnapshot()),
          TEAM_ACCESS_PERMISSION_MESSAGE,
        );
      }
    },
  },
  {
    name: 'permission-denied fora do vinculo auth-team preserva aviso padrao de acesso perdido',
    run() {
      const error = Object.assign(new Error('Missing or insufficient permissions'), {
        code: 'permission-denied',
        context: {
          collection: 'players',
        },
      });
      const snapshot = createSnapshot({
        accessNotice: LOST_TEAM_ACCESS_MESSAGE,
      });

      assert.equal(shouldShowTeamAccessPermissionMessage(error), false);
      assert.equal(resolveBootstrapAccessNotice(error, snapshot), LOST_TEAM_ACCESS_MESSAGE);
    },
  },
  {
    name: 'bootstrap com permission-denied limpa contexto do time sem quebrar o snapshot',
    run() {
      const team = createTeam({ id: 'team-bootstrap' });
      const sessionUser = {
        authId: 'user-bootstrap',
        email: 'bootstrap@professo.test',
        displayName: 'Bootstrap User',
        avatarUrl: null,
      };
      const storedUser = createUser({
        id: sessionUser.authId,
        email: sessionUser.email,
        displayName: sessionUser.displayName,
        activeTeamId: team.id,
        teamId: team.id,
        playerId: 'player-bootstrap',
      });
      const membership = createTeamMember({
        id: 'membership-bootstrap',
        userId: storedUser.id,
        teamId: team.id,
        playerId: 'player-bootstrap',
        roles: ['player'],
      });
      const player = createPlayer({
        id: 'player-bootstrap',
        teamId: team.id,
      });
      const match = createMatch({
        id: 'match-bootstrap',
        teamId: team.id,
      });
      const partialSnapshot = createSnapshot({
        users: [storedUser],
        teams: [team],
        teamMembers: [membership],
        players: [player],
        matches: [match],
        attendance: [
          createAttendance({
            id: 'attendance-bootstrap',
            teamId: team.id,
            matchId: match.id,
            playerId: player.id,
          }),
        ],
        matchStats: [
          createMatchStat({
            id: 'stat-bootstrap',
            teamId: team.id,
            matchId: match.id,
            playerId: player.id,
          }),
        ],
        ratingCriteria: [
          createCriterion({
            id: 'criterion-bootstrap',
            teamId: team.id,
          }),
        ],
      });
      const permissionDeniedError = Object.assign(
        new Error('Missing or insufficient permissions'),
        {
          code: 'permission-denied',
          partialSnapshot,
        },
      );

      assert.equal(isRepositoryPermissionDeniedError(permissionDeniedError), true);

      const recovered = buildBootstrapRecoverySnapshot(
        sessionUser,
        extractRepositoryPartialSnapshot(permissionDeniedError),
      );

      assert.equal(recovered.users[0]?.id, sessionUser.authId);
      assert.equal(recovered.users[0]?.activeTeamId, null);
      assert.equal(recovered.users[0]?.teamId, null);
      assert.equal(recovered.users[0]?.playerId, null);
      assert.equal(recovered.accessNotice, LOST_TEAM_ACCESS_MESSAGE);
      assert.deepEqual(recovered.teamMembers.map((item) => item.id), [membership.id]);
      assert.deepEqual(recovered.teams.map((item) => item.id), [team.id]);
      assert.deepEqual(recovered.players, []);
      assert.deepEqual(recovered.matches, []);
      assert.deepEqual(recovered.lineups, []);
      assert.deepEqual(recovered.attendance, []);
      assert.deepEqual(recovered.matchStats, []);
      assert.deepEqual(recovered.mvpVotes, []);
      assert.deepEqual(recovered.playerRatings, []);
      assert.deepEqual(recovered.ratingCriteria, []);
      assert.deepEqual(recovered.notifications, []);
      assert.deepEqual(recovered.matchDiaryEntries, []);
      assert.deepEqual(recovered.seasons, []);
      assert.equal(
        selectCurrentTeam({
          currentUserId: sessionUser.authId,
          snapshot: recovered,
        }),
        null,
      );
    },
  },
  {
    name: 'jogador comum consegue atualizar a propria foto no mock repository',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({
        email: 'atacante@bocaiuva.app',
        password: '123456',
      });

      await mockRepository.updatePlayer(
        'player-9',
        { photoUrl: 'https://cdn.professo.test/player-9-new.jpg?v=1' },
        'user-striker',
      );

      const snapshot = await mockRepository.getSnapshot();
      assert.equal(
        snapshot.players.find((player) => player.id === 'player-9')?.photoUrl,
        'https://cdn.professo.test/player-9-new.jpg?v=1',
      );
    },
  },
  {
    name: 'jogador comum nao consegue atualizar a foto de outro jogador no mock repository',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({
        email: 'atacante@bocaiuva.app',
        password: '123456',
      });

      await assert.rejects(
        () =>
          mockRepository.updatePlayer(
            'player-7',
            { photoUrl: 'https://cdn.professo.test/player-7-new.jpg?v=1' },
            'user-striker',
          ),
        (error) =>
          error instanceof Error &&
          error.message === 'Você não tem permissão para editar esse jogador.',
      );
    },
  },
  {
    name: 'admin consegue atualizar a foto de qualquer jogador do proprio time no mock repository',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({
        email: 'admin@bocaiuva.app',
        password: '123456',
      });

      await mockRepository.updatePlayer(
        'player-9',
        { photoUrl: 'https://cdn.professo.test/player-9-admin.jpg?v=1' },
        'user-admin',
      );

      const snapshot = await mockRepository.getSnapshot();
      assert.equal(
        snapshot.players.find((player) => player.id === 'player-9')?.photoUrl,
        'https://cdn.professo.test/player-9-admin.jpg?v=1',
      );
    },
  },
  {
    name: 'mensagem de upload da foto fica clara quando o Storage rejeita a policy',
    run() {
      assert.equal(
        getProfilePhotoUploadErrorMessage(new Error('new row violates row-level security policy')),
        'O Storage recusou o envio da foto. Revise as policies do bucket player-photos e tente novamente.',
      );
    },
  },
  {
    name: 'permission-denied ao salvar a foto vira mensagem clara de vinculo',
    run() {
      const error = Object.assign(new Error('Missing or insufficient permissions'), {
        code: 'permission-denied',
      });

      assert.equal(
        getProfilePhotoSaveErrorMessage(error),
        'Sua conta não tem permissão para salvar a foto neste perfil. Confirme se o membership ativo está vinculado ao seu jogador ou peça ao admin para revisar o vínculo.',
      );
    },
  },
  {
    name: 'publicUrl da foto recebe cache bust para evitar imagem antiga apos overwrite',
    run() {
      assert.equal(
        appendCacheBustParam(
          'https://xepbopkhsprfemqjzrkm.supabase.co/storage/v1/object/public/player-photos/team/player.jpg',
          123,
        ),
        'https://xepbopkhsprfemqjzrkm.supabase.co/storage/v1/object/public/player-photos/team/player.jpg?v=123',
      );
    },
  },
  {
    name: 'usuario sem time consegue abrir a galeria publica sanitizada',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({
        email: 'gestor@bocaiuva.app',
        password: '123456',
      });

      const teams = await mockRepository.listPublicTeams('user-manager');
      const privateProfile = await mockRepository.getPublicTeamProfile(
        'team-bocaiuva',
        'user-manager',
      );

      assert.deepEqual(teams.map((team) => team.id), ['team-serrano']);
      assert.equal(privateProfile, null);
    },
  },
  {
    name: 'admin editando o time sincroniza publicTeams sem expor o time privado antes da hora',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({
        email: 'admin@bocaiuva.app',
        password: '123456',
      });

      await mockRepository.updateTeam(
        'team-bocaiuva',
        {
          name: 'Bocaiuva FC',
          coachName: 'Rafael Nogueira',
          slug: 'bocaiuva-fc',
          primaryColor: '#0E8A43',
          secondaryColor: '#F4C542',
          accentColor: '#113322',
          description: 'Time organizado para amistosos e campeonatos locais.',
          isPublic: true,
          city: 'Bocaiuva',
          state: 'mt',
          neighborhood: 'Centro',
          homeFieldName: 'Arena Bocaiuva',
          contactName: 'Rafael Nogueira',
          contactPhone: '65999990000',
          contactWhatsapp: '65999990000',
          publicDescription: 'Time pronto para amistosos de fim de semana.',
          allowFriendlyContact: true,
          publicRosterEnabled: true,
        },
        'user-admin',
      );

      const teams = await mockRepository.listPublicTeams('user-admin');
      const profile = await mockRepository.getPublicTeamProfile(
        'team-bocaiuva',
        'user-admin',
      );

      assert.equal(teams.some((team) => team.id === 'team-bocaiuva'), true);
      assert.equal(profile?.city, 'Bocaiuva');
      assert.equal(profile?.state, 'MT');
      assert.equal(profile?.publicRosterEnabled, true);
      assert.equal((profile?.roster.length ?? 0) > 0, true);
    },
  },
  {
    name: 'entrada por inviteCode cria membership ativa e troca o contexto para o novo time',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({
        email: 'atacante@bocaiuva.app',
        password: '123456',
      });

      const result = await mockRepository.joinTeamWithInviteCode('SERR26', 'user-striker');
      const snapshot = await mockRepository.getSnapshot();
      const striker = snapshot.users[0];
      const newMembership = snapshot.teamMembers.find(
        (membership) => membership.teamId === 'team-serrano',
      );

      assert.equal(result.team.id, 'team-serrano');
      assert.equal(result.alreadyMember, false);
      assert.equal(striker?.activeTeamId, 'team-serrano');
      assert.equal(striker?.teamId, 'team-serrano');
      assert.equal(newMembership?.status, 'active');
      assert.equal(newMembership?.inviteCodeUsed, 'SERR26');
      assert.equal(
        selectCurrentTeam({
          currentUserId: 'user-striker',
          snapshot,
        })?.id,
        'team-serrano',
      );
    },
  },
  {
    name: 'entrada por inviteCode vincula automaticamente o jogador quando o linkedEmail confere',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({
        email: 'admin@bocaiuva.app',
        password: '123456',
      });

      const createdTeam = await mockRepository.createTeam(
        {
          name: 'Time Link Automático',
          coachName: 'Professor Link',
          primaryColor: '#14532D',
          secondaryColor: '#F8FAFC',
          accentColor: '#F59E0B',
        },
        'user-admin',
      );

      const linkedPlayer = await mockRepository.createPlayer(
        {
          teamId: createdTeam.id,
          fullName: 'Atacante Convidado',
          nickname: 'Artilheiro',
          jerseyNumber: 99,
          primaryPosition: 'striker',
          secondaryPositions: ['forward'],
          dominantFoot: 'right',
          status: 'active',
          linkedEmail: 'novo.convite@professo.test',
        },
        'user-admin',
      );

      const registeredUser = await mockRepository.register({
        displayName: 'Novo Convite',
        email: 'novo.convite@professo.test',
        password: '123456',
      });

      const result = await mockRepository.joinTeamWithInviteCode(
        createdTeam.inviteCode,
        registeredUser.id,
      );
      const snapshot = await mockRepository.getSnapshot();
      const membership = snapshot.teamMembers.find(
        (item) => item.teamId === createdTeam.id && item.userId === registeredUser.id,
      );
      const resolvedPlayer = snapshot.players.find((player) => player.id === linkedPlayer.id);

      assert.equal(result.playerLink.status, 'linked');
      assert.equal(result.playerLink.source, 'linked-email');
      assert.equal(result.playerLink.playerId, linkedPlayer.id);
      assert.equal(membership?.playerId, linkedPlayer.id);
      assert.equal(resolvedPlayer?.linkedUserId, registeredUser.id);
      assert.equal(
        selectCurrentPlayer({
          currentUserId: registeredUser.id,
          snapshot,
        })?.id,
        linkedPlayer.id,
      );
    },
  },
  {
    name: 'entrada por inviteCode sem jogador compativel retorna aviso claro sem auto criar jogador',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({
        email: 'admin@bocaiuva.app',
        password: '123456',
      });

      const createdTeam = await mockRepository.createTeam(
        {
          name: 'Time Sem Vinculo',
          coachName: 'Professor Sem Vinculo',
          primaryColor: '#1D4ED8',
          secondaryColor: '#E0F2FE',
          accentColor: '#0F172A',
        },
        'user-admin',
      );
      const playersBeforeJoin = (await mockRepository.getSnapshot()).players.filter(
        (player) => player.teamId === createdTeam.id,
      ).length;

      await mockRepository.login({
        email: 'gestor@bocaiuva.app',
        password: '123456',
      });

      const result = await mockRepository.joinTeamWithInviteCode(
        createdTeam.inviteCode,
        'user-manager',
      );
      const snapshot = await mockRepository.getSnapshot();
      const membership = snapshot.teamMembers.find(
        (item) => item.teamId === createdTeam.id && item.userId === 'user-manager',
      );
      const playersAfterJoin = snapshot.players.filter((player) => player.teamId === createdTeam.id)
        .length;

      assert.equal(result.playerLink.status, 'unresolved');
      assert.deepEqual(result.playerLink.suggestions, []);
      assert.equal(membership?.playerId, null);
      assert.equal(playersAfterJoin, playersBeforeJoin);
    },
  },
  {
    name: 'entrada por inviteCode com multiplos candidatos retorna sugestoes assistidas',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({
        email: 'admin@bocaiuva.app',
        password: '123456',
      });

      const createdTeam = await mockRepository.createTeam(
        {
          name: 'Time Sugestao',
          coachName: 'Professor Sugestao',
          primaryColor: '#7C3AED',
          secondaryColor: '#F8FAFC',
          accentColor: '#0EA5E9',
        },
        'user-admin',
      );

      await mockRepository.createPlayer(
        {
          teamId: createdTeam.id,
          fullName: 'Joao Silva',
          nickname: 'Joao',
          jerseyNumber: 13,
          primaryPosition: 'midfielder',
          secondaryPositions: [],
          dominantFoot: 'right',
          status: 'active',
        },
        'user-admin',
      );
      await mockRepository.createPlayer(
        {
          teamId: createdTeam.id,
          fullName: 'Joao Pedro Silva',
          nickname: 'JP Silva',
          jerseyNumber: 18,
          primaryPosition: 'forward',
          secondaryPositions: ['winger'],
          dominantFoot: 'left',
          status: 'active',
        },
        'user-admin',
      );

      const registeredUser = await mockRepository.register({
        displayName: 'Joao Silva',
        email: 'joao.silva@professo.test',
        password: '123456',
      });

      const result = await mockRepository.joinTeamWithInviteCode(
        createdTeam.inviteCode,
        registeredUser.id,
      );
      const snapshot = await mockRepository.getSnapshot();
      const membership = snapshot.teamMembers.find(
        (item) => item.teamId === createdTeam.id && item.userId === registeredUser.id,
      );

      assert.equal(result.playerLink.status, 'suggested');
      assert.equal(result.playerLink.suggestions.length >= 2, true);
      assert.equal(membership?.playerId, null);
      assert.deepEqual(
        result.playerLink.suggestions.map((suggestion) => suggestion.nickname),
        ['Joao', 'JP Silva'],
      );
    },
  },
  {
    name: 'regenerar inviteCode invalida o codigo antigo e publica o novo em teamInvites',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({
        email: 'admin@bocaiuva.app',
        password: '123456',
      });

      const updatedTeam = await mockRepository.regenerateTeamInviteCode(
        'team-bocaiuva',
        'user-admin',
      );

      await assert.rejects(
        () => mockRepository.joinTeamWithInviteCode('BOCA26', 'user-manager'),
        (error) =>
          error instanceof Error &&
          error.message === 'Não encontramos um time com esse código.',
      );

      const joinResult = await mockRepository.joinTeamWithInviteCode(
        updatedTeam.inviteCode,
        'user-manager',
      );

      assert.equal(joinResult.team.id, 'team-bocaiuva');
      assert.equal(joinResult.alreadyMember, false);
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
