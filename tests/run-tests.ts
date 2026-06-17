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
  isPlayerInactive,
} from '@/lib/player-management';
import {
  buildSelfPlayerProfileUpdatePatch,
  canEditOwnPlayerProfile,
  getOwnPlayerProfileBlockedMessage,
  pickSelfPlayerProfileEditableInput,
  resolveOwnPlayerProfileAccess,
} from '@/lib/player-profile-access';
import { buildPublicTeamProfile, buildPublicTeamSummary } from '@/lib/public-team';
import { getActiveRatingCriteria } from '@/lib/rating-criteria';
import {
  canSelfEditPlayerProfileWithMembershipLink,
  resolvePlayerForUserWithDiagnostics,
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
  selectCurrentRoleLabel,
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
    name: 'resolucao central aceita playerId do membership index como vinculo seguro',
    run() {
      const membership = createTeamMember({
        userId: 'user-membership-index',
        teamId: 'team-membership-index',
        playerId: 'player-membership-index',
        roles: ['player'],
      });
      const membershipIndex = buildTeamMembershipIndexDocument(membership);
      const player = createPlayer({
        id: 'player-membership-index',
        teamId: 'team-membership-index',
      });

      const result = resolvePlayerForUserWithDiagnostics({
        teamPlayers: [player],
        teamId: 'team-membership-index',
        user: { id: 'user-membership-index', email: 'index@professo.test' },
        membership: membershipIndex,
      });

      assert.equal(result.status, 'resolved');
      assert.equal(result.source, 'membership-player-id');
      assert.equal(result.player?.id, player.id);
    },
  },
  {
    name: 'resolucao central aceita linkedUserId como fallback seguro',
    run() {
      const player = createPlayer({
        id: 'player-linked-user',
        teamId: 'team-linked-user',
        linkedUserId: 'user-linked-user',
      });

      const result = resolvePlayerForUserWithDiagnostics({
        teamPlayers: [player],
        teamId: 'team-linked-user',
        user: { id: 'user-linked-user', email: 'linked-user@professo.test' },
        membership: createTeamMember({
          userId: 'user-linked-user',
          teamId: 'team-linked-user',
          playerId: null,
          roles: ['player'],
        }),
      });

      assert.equal(result.status, 'resolved');
      assert.equal(result.source, 'linked-user-id');
      assert.equal(result.player?.id, player.id);
    },
  },
  {
    name: 'resolucao central aceita linkedEmail unico como fallback seguro',
    run() {
      const player = createPlayer({
        id: 'player-linked-email-unique',
        teamId: 'team-linked-email-unique',
        linkedUserId: null,
        linkedEmail: 'unique@professo.test',
      });

      const result = resolvePlayerForUserWithDiagnostics({
        teamPlayers: [player],
        teamId: 'team-linked-email-unique',
        user: { id: 'user-linked-email-unique', email: 'unique@professo.test' },
        membership: createTeamMember({
          userId: 'user-linked-email-unique',
          teamId: 'team-linked-email-unique',
          playerId: null,
          roles: ['player'],
        }),
      });

      assert.equal(result.status, 'resolved');
      assert.equal(result.source, 'linked-email');
      assert.equal(result.player?.id, player.id);
    },
  },
  {
    name: 'resolucao central bloqueia linkedEmail ambiguo com multiplos candidatos ativos',
    run() {
      const players = [
        createPlayer({
          id: 'player-ambiguous-1',
          teamId: 'team-ambiguous',
          linkedUserId: null,
          linkedEmail: 'ambiguous@professo.test',
        }),
        createPlayer({
          id: 'player-ambiguous-2',
          teamId: 'team-ambiguous',
          linkedUserId: null,
          linkedEmail: 'ambiguous@professo.test',
        }),
      ];

      const result = resolvePlayerForUserWithDiagnostics({
        teamPlayers: players,
        teamId: 'team-ambiguous',
        user: { id: 'user-ambiguous', email: 'ambiguous@professo.test' },
        membership: createTeamMember({
          userId: 'user-ambiguous',
          teamId: 'team-ambiguous',
          playerId: null,
          roles: ['player'],
        }),
      });

      assert.equal(result.status, 'ambiguous');
      assert.equal(result.player, null);
      assert.equal(result.failureReason, 'linked-email-ambiguous');
      assert.equal(result.candidates.length, 2);
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
        canEditOwnPrivatePlayer({
          ...input,
          playerId: 'player-common-player',
          playerLinkedUserId: 'user-other-linked',
        }),
        false,
      );
      assert.equal(
        canEditOwnPrivatePlayer({
          ...input,
          playerId: 'player-common-player',
          playerStatus: 'inactive',
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
          teamPlayers: [player],
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
    name: 'autoedicao central bloqueia jogador inativo e jogador ja vinculado a outro usuario',
    run() {
      const membership = createTeamMember({
        userId: 'user-central-access',
        teamId: 'team-central-access',
        playerId: 'player-central-access',
        roles: ['player'],
      });

      assert.equal(
        canEditOwnPlayerProfile({
          teamId: 'team-central-access',
          user: { id: 'user-central-access', email: 'central@professo.test' },
          membership,
          player: createPlayer({
            id: 'player-central-access',
            teamId: 'team-central-access',
            status: 'inactive',
            linkedUserId: 'user-central-access',
          }),
        }),
        false,
      );

      assert.equal(
        canEditOwnPlayerProfile({
          teamId: 'team-central-access',
          user: { id: 'user-central-access', email: 'central@professo.test' },
          membership,
          player: createPlayer({
            id: 'player-central-access',
            teamId: 'team-central-access',
            linkedUserId: 'user-other',
            linkedEmail: 'other@professo.test',
          }),
        }),
        false,
      );
    },
  },
  {
    name: 'autoedicao reconhece linkedUserId mesmo sem playerId no membership',
    run() {
      const membership = createTeamMember({
        userId: 'user-linked-user-self-edit',
        teamId: 'team-linked-user-self-edit',
        playerId: null,
        roles: ['player'],
      });
      const player = createPlayer({
        id: 'player-linked-user-self-edit',
        teamId: 'team-linked-user-self-edit',
        linkedUserId: 'user-linked-user-self-edit',
        linkedEmail: null,
      });

      const result = resolveOwnPlayerProfileAccess({
        teamId: 'team-linked-user-self-edit',
        user: {
          id: 'user-linked-user-self-edit',
          email: 'linked-user-self-edit@professo.test',
        },
        membership,
        player,
        teamPlayers: [player],
      });

      assert.equal(result.allowed, true);
      assert.equal(result.source, 'linked-user-id');
    },
  },
  {
    name: 'autoedicao bloqueia linkedEmail ambiguo e orienta procurar o administrador',
    run() {
      const targetPlayer = createPlayer({
        id: 'player-ambiguous-target',
        teamId: 'team-ambiguous-access',
        linkedUserId: null,
        linkedEmail: 'duplicado@professo.test',
      });
      const competingPlayer = createPlayer({
        id: 'player-ambiguous-competing',
        teamId: 'team-ambiguous-access',
        linkedUserId: null,
        linkedEmail: 'duplicado@professo.test',
      });

      const result = resolveOwnPlayerProfileAccess({
        teamId: 'team-ambiguous-access',
        user: { id: 'user-ambiguous-access', email: 'duplicado@professo.test' },
        membership: createTeamMember({
          userId: 'user-ambiguous-access',
          teamId: 'team-ambiguous-access',
          playerId: null,
          roles: ['player'],
        }),
        player: targetPlayer,
        teamPlayers: [targetPlayer, competingPlayer],
      });

      assert.equal(result.allowed, false);
      assert.equal(result.reason, 'multiple-player-candidates');
      assert.equal(
        getOwnPlayerProfileBlockedMessage(result),
        'Encontramos mais de um jogador ativo compativel com a sua conta. Peca ao administrador para revisar o vinculo correto.',
      );
    },
  },
  {
    name: 'autoedicao bloqueia quando a conta ja foi reconhecida em outro jogador do time',
    run() {
      const resolvedPlayer = createPlayer({
        id: 'player-resolved-other',
        teamId: 'team-resolved-other',
        linkedUserId: 'user-resolved-other',
      });
      const targetPlayer = createPlayer({
        id: 'player-target-other',
        teamId: 'team-resolved-other',
        linkedUserId: null,
        linkedEmail: null,
      });

      const result = resolveOwnPlayerProfileAccess({
        teamId: 'team-resolved-other',
        user: { id: 'user-resolved-other', email: 'resolved-other@professo.test' },
        membership: createTeamMember({
          userId: 'user-resolved-other',
          teamId: 'team-resolved-other',
          playerId: null,
          roles: ['player'],
        }),
        player: targetPlayer,
        teamPlayers: [resolvedPlayer, targetPlayer],
      });

      assert.equal(result.allowed, false);
      assert.equal(result.reason, 'different-linked-player');
      assert.equal(
        getOwnPlayerProfileBlockedMessage(result),
        'Sua conta ja esta vinculada a outro jogador deste time.',
      );
    },
  },
  {
    name: 'diagnostico da autoedicao explica quando o linkedEmail nao confere',
    run() {
      const result = resolveOwnPlayerProfileAccess({
        teamId: 'team-diagnostic',
        user: { id: 'user-diagnostic', email: 'pedro@professo.test' },
        membership: createTeamMember({
          userId: 'user-diagnostic',
          teamId: 'team-diagnostic',
          playerId: null,
          roles: ['player'],
        }),
        player: createPlayer({
          id: 'player-diagnostic',
          teamId: 'team-diagnostic',
          linkedUserId: null,
          linkedEmail: 'outro@professo.test',
        }),
      });

      assert.equal(result.allowed, false);
      assert.equal(result.reason, 'linked-email-mismatch');
      assert.equal(
        result.diagnostics.includes('Membership sem playerId.'),
        true,
      );
      assert.equal(
        result.diagnostics.includes('linkedEmail diferente do e-mail autenticado.'),
        true,
      );
    },
  },
  {
    name: 'mensagem de bloqueio da autoedicao orienta revisar o vinculo do jogador',
    run() {
      const result = resolveOwnPlayerProfileAccess({
        teamId: 'team-blocked-message',
        user: { id: 'user-blocked-message', email: 'pedro@professo.test' },
        membership: createTeamMember({
          userId: 'user-blocked-message',
          teamId: 'team-blocked-message',
          playerId: null,
          roles: ['player'],
        }),
        player: createPlayer({
          id: 'player-blocked-message',
          teamId: 'team-blocked-message',
          linkedUserId: null,
          linkedEmail: 'outro@professo.test',
        }),
      });

      assert.equal(
        getOwnPlayerProfileBlockedMessage(result),
        'Seu usuário ainda não está vinculado corretamente a este jogador.',
      );
    },
  },
  {
    name: 'mensagem de bloqueio informa quando o usuario esta no time sem jogador vinculado',
    run() {
      const result = resolveOwnPlayerProfileAccess({
        teamId: 'team-missing-link',
        user: { id: 'user-missing-link', email: 'missing-link@professo.test' },
        membership: createTeamMember({
          userId: 'user-missing-link',
          teamId: 'team-missing-link',
          playerId: null,
          roles: ['player'],
        }),
        player: createPlayer({
          id: 'player-missing-link',
          teamId: 'team-missing-link',
          linkedUserId: null,
          linkedEmail: null,
        }),
      });

      assert.equal(result.allowed, false);
      assert.equal(result.reason, 'missing-player-link');
      assert.equal(
        getOwnPlayerProfileBlockedMessage(result),
        'Voce esta no time, mas ainda nao possui um jogador vinculado ao seu usuario.',
      );
    },
  },
  {
    name: 'filtro de autoedicao remove campos administrativos do payload antes do save',
    run() {
      const sanitized = pickSelfPlayerProfileEditableInput({
        fullName: 'Pedro Centroavante',
        nickname: 'Pedro',
        photoUrl: 'https://cdn.professo.test/player.jpg',
        status: 'active',
        linkedEmail: 'pedro@professo.test',
        bio: 'Camisa 9 do time',
        preferredPosition: 'forward',
        introVideoUrl: 'https://youtube.com/watch?v=pedro',
        celebrationVideoUrl: 'https://instagram.com/pedro',
        allowSelfEditJerseyNumber: false,
      });

      assert.deepEqual(sanitized, {
        nickname: 'Pedro',
        photoUrl: 'https://cdn.professo.test/player.jpg',
        bio: 'Camisa 9 do time',
        preferredPosition: 'forward',
        introVideoUrl: 'https://youtube.com/watch?v=pedro',
        celebrationVideoUrl: 'https://instagram.com/pedro',
      });
    },
  },
  {
    name: 'patch de autoedicao envia apenas os campos alterados pelo proprio jogador',
    run() {
      const player = createPlayer({
        primaryPosition: 'forward',
      });

      const patch = buildSelfPlayerProfileUpdatePatch({
        player,
        changes: {
          photoUrl: null,
          bio: '  Centroavante de area.  ',
          secondaryPositions: ['forward', 'winger', 'winger'],
          preferredPosition: null,
          introVideoUrl: 'https://youtube.com/watch?v=pedro',
        },
        updatedAt: '2026-06-12T12:00:00.000Z',
      });

      assert.deepEqual(patch, {
        photoUrl: null,
        bio: 'Centroavante de area.',
        secondaryPositions: ['winger'],
        preferredPosition: null,
        introVideoUrl: 'https://youtube.com/watch?v=pedro',
        updatedAt: '2026-06-12T12:00:00.000Z',
      });
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
    name: 'erro do Google orienta liberar popup quando a janela e bloqueada',
    run() {
      const friendlyError = toFriendlyAuthError(
        new Error('popup blocked by browser policy'),
        'Falhou.',
      );

      assert.equal(
        friendlyError.message,
        'Permita a abertura da janela do Google para continuar.',
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
    name: 'activeTeamId preserva o contexto de jogador quando o usuario tambem e admin em outro time',
    run() {
      const adminTeam = createTeam({ id: 'team-admin-context' });
      const playerTeam = createTeam({ id: 'team-player-context' });
      const user = createUser({
        id: 'user-multi-team-context',
        activeTeamId: playerTeam.id,
        teamId: playerTeam.id,
      });
      const adminMembership = createTeamMember({
        id: 'membership-admin-context',
        userId: user.id,
        teamId: adminTeam.id,
        roles: ['admin'],
        canManageTeam: true,
        canManagePlayers: true,
      });
      const playerMembership = createTeamMember({
        id: 'membership-player-context',
        userId: user.id,
        teamId: playerTeam.id,
        playerId: 'player-multi-team-context',
        roles: ['player'],
      });
      const player = createPlayer({
        id: 'player-multi-team-context',
        teamId: playerTeam.id,
        linkedUserId: user.id,
      });
      const state = {
        currentUserId: user.id,
        snapshot: createSnapshot({
          users: [user],
          teams: [adminTeam, playerTeam],
          teamMembers: [adminMembership, playerMembership],
          players: [player],
          accessNotice: null,
        }),
      };

      assert.equal(selectCurrentTeam(state)?.id, playerTeam.id);
      assert.equal(selectCurrentPlayer(state)?.id, player.id);
      assert.equal(selectCurrentRoleLabel(state), 'Jogador');
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
    name: 'jogador comum consegue atualizar a propria bio e os proprios videos no mock repository',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({
        email: 'atacante@bocaiuva.app',
        password: '123456',
      });

      await mockRepository.updatePlayer(
        'player-9',
        {
          bio: 'Centroavante de area.',
          introVideoUrl: 'https://youtube.com/watch?v=pedro-centroavante',
          celebrationVideoUrl: 'https://instagram.com/p/pedro-centroavante',
        },
        'user-striker',
      );

      const snapshot = await mockRepository.getSnapshot();
      const updatedPlayer = snapshot.players.find((player) => player.id === 'player-9');

      assert.equal(updatedPlayer?.bio, 'Centroavante de area.');
      assert.equal(
        updatedPlayer?.introVideoUrl,
        'https://youtube.com/watch?v=pedro-centroavante',
      );
      assert.equal(
        updatedPlayer?.celebrationVideoUrl,
        'https://instagram.com/p/pedro-centroavante',
      );
    },
  },
  {
    name: 'payload de autoedicao com campos administrativos continua bloqueado no mock repository',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({
        email: 'atacante@bocaiuva.app',
        password: '123456',
      });

      await assert.rejects(
        () =>
          mockRepository.updatePlayer(
            'player-9',
            {
              fullName: 'Pedro Centroavante',
              nickname: 'Pedro',
              bio: 'Tentativa invalida',
              status: 'active',
              linkedEmail: 'pedro@professo.test',
            },
            'user-striker',
          ),
        (error) =>
          error instanceof Error &&
          error.message ===
            'Seu perfil permite editar apenas foto, apelido, bio, camisa quando liberada, posições, pé dominante e links de vídeo do jogador.',
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
  {
    name: 'admin confirma presença de qualquer jogador do time',
    async run() {
      resetMockRepositoryState();
      const record = await mockRepository.updateAttendance(
        { matchId: 'match-3', playerId: 'player-9', status: 'confirmed' },
        'user-admin',
      );
      assert.equal(record.playerId, 'player-9');
      assert.equal(record.status, 'confirmed');
    },
  },
  {
    name: 'admin altera presença de qualquer jogador inclusive para ausente',
    async run() {
      resetMockRepositoryState();
      await mockRepository.updateAttendance(
        { matchId: 'match-3', playerId: 'player-9', status: 'confirmed' },
        'user-admin',
      );
      const updated = await mockRepository.updateAttendance(
        { matchId: 'match-3', playerId: 'player-9', status: 'absent' },
        'user-admin',
      );
      assert.equal(updated.playerId, 'player-9');
      assert.equal(updated.status, 'absent');
    },
  },
  {
    name: 'jogador comum confirma a propria presença com sucesso',
    async run() {
      resetMockRepositoryState();
      const record = await mockRepository.updateAttendance(
        { matchId: 'match-3', playerId: 'player-9', status: 'confirmed' },
        'user-striker',
      );
      assert.equal(record.playerId, 'player-9');
      assert.equal(record.status, 'confirmed');
    },
  },
  {
    name: 'jogador comum nao consegue confirmar presença de outro jogador',
    async run() {
      resetMockRepositoryState();
      await assert.rejects(
        () =>
          mockRepository.updateAttendance(
            { matchId: 'match-3', playerId: 'player-7', status: 'confirmed' },
            'user-striker',
          ),
        (error) =>
          error instanceof Error &&
          error.message === 'Você só pode responder à sua própria presença.',
      );
    },
  },
  {
    name: 'admin que tambem é jogador confirma presença de outro jogador sem bloqueio',
    async run() {
      resetMockRepositoryState();
      // user-admin tem roles ['admin', 'player'] e playerId player-7
      // Confirma player-9 (jogador de outro usuario) — não pode ser bloqueado
      const record = await mockRepository.updateAttendance(
        { matchId: 'match-3', playerId: 'player-9', status: 'confirmed' },
        'user-admin',
      );
      assert.equal(record.playerId, 'player-9');
      assert.equal(record.status, 'confirmed');
    },
  },
  {
    name: 'auto-resposta de jogador nao cria notificacao no time',
    async run() {
      resetMockRepositoryState();
      const snapshotBefore = await mockRepository.getSnapshot();
      const notificationsBefore = snapshotBefore.notifications.length;

      await mockRepository.updateAttendance(
        { matchId: 'match-3', playerId: 'player-9', status: 'confirmed' },
        'user-striker',
      );

      const snapshotAfter = await mockRepository.getSnapshot();
      assert.equal(
        snapshotAfter.notifications.length,
        notificationsBefore,
        'auto-resposta de jogador nao deve criar notificacao',
      );
    },
  },
  {
    name: 'buildTeamMembershipIndexDocument espelha todos os campos verificados pela regra',
    run() {
      const membership = createTeamMember({
        id: 'mbr-backfill-1',
        userId: 'user-backfill',
        teamId: 'team-backfill',
        playerId: 'player-backfill',
        roles: ['player'],
        canManageTeam: false,
        canManagePlayers: false,
      });
      const indexDoc = buildTeamMembershipIndexDocument(membership);

      assert.equal(indexDoc.id, membership.userId, 'id deve ser userId');
      assert.equal(indexDoc.teamId, membership.teamId, 'teamId deve bater');
      assert.equal(indexDoc.userId, membership.userId, 'userId deve bater');
      assert.equal(indexDoc.membershipId, membership.id, 'membershipId deve ser o id da membership');
      assert.equal(indexDoc.playerId, membership.playerId, 'playerId deve bater');
      assert.deepEqual(indexDoc.roles, membership.roles, 'roles deve bater');
      assert.equal(indexDoc.canManageTeam, membership.canManageTeam, 'canManageTeam deve bater');
      assert.equal(indexDoc.canManagePlayers, membership.canManagePlayers, 'canManagePlayers deve bater');
      assert.equal(indexDoc.joinedAt, membership.joinedAt, 'joinedAt deve bater');
      assert.equal(indexDoc.createdAt, membership.createdAt, 'createdAt deve bater');
      assert.equal(indexDoc.updatedAt, membership.updatedAt, 'updatedAt deve bater');
    },
  },
  {
    name: 'buildTeamMembershipIndexDocument é idempotente para a mesma membership',
    run() {
      const membership = createTeamMember({
        userId: 'user-idem-backfill',
        teamId: 'team-idem-backfill',
        roles: ['admin', 'player'],
        canManageTeam: true,
        canManagePlayers: true,
      });
      const doc1 = buildTeamMembershipIndexDocument(membership);
      const doc2 = buildTeamMembershipIndexDocument(membership);
      assert.deepEqual(doc1, doc2, 'duas chamadas com mesma membership devem produzir documento idêntico');
    },
  },
  {
    name: 'backfill ignora memberships inativas: filtro status === active exclui inativas',
    run() {
      const membership = createTeamMember({
        userId: 'user-inactive-backfill',
        teamId: 'team-inactive-backfill',
        roles: ['player'],
        status: 'inactive',
      });
      const ownActive = [membership].filter(
        (m) => m.userId === 'user-inactive-backfill' && m.status === 'active',
      );
      assert.equal(ownActive.length, 0, 'membership inativa não deve ser incluída no backfill');
    },
  },
  {
    name: 'backfill ignora memberships de outros usuários: filtro userId exclui terceiros',
    run() {
      const membershipA = createTeamMember({
        userId: 'user-a-backfill',
        teamId: 'team-shared-backfill',
        roles: ['player'],
      });
      const membershipB = createTeamMember({
        userId: 'user-b-backfill',
        teamId: 'team-shared-backfill',
        roles: ['admin'],
        canManageTeam: true,
      });
      const ownActive = [membershipA, membershipB].filter(
        (m) => m.userId === 'user-a-backfill' && m.status === 'active',
      );
      assert.equal(ownActive.length, 1, 'somente membership do próprio usuário deve ser incluída');
      assert.equal(ownActive[0]?.userId, 'user-a-backfill');
    },
  },
  {
    name: 'isPlayerInactive retorna true quando status é inactive',
    run() {
      const player = createPlayer({ status: 'inactive', deletedAt: null });
      assert.equal(isPlayerInactive(player), true, 'status inactive deve ser considerado inativo');
    },
  },
  {
    name: 'isPlayerInactive retorna true quando deletedAt está preenchido',
    run() {
      const player = createPlayer({ status: 'active', deletedAt: '2026-01-01T00:00:00.000Z' });
      assert.equal(isPlayerInactive(player), true, 'deletedAt preenchido deve ser considerado inativo');
    },
  },
  {
    name: 'isPlayerInactive retorna false quando ativo e sem deletedAt',
    run() {
      const player = createPlayer({ status: 'active', deletedAt: null });
      assert.equal(isPlayerInactive(player), false, 'jogador ativo e sem deletedAt não é inativo');
    },
  },
  {
    name: 'buildInactivatedPlayerState define status inactive e deletedAt com updatedAt',
    run() {
      const player = createPlayer({ status: 'active', deletedAt: null });
      const updatedAt = '2026-06-15T10:00:00.000Z';
      const result = buildInactivatedPlayerState(player, updatedAt);
      assert.equal(result.status, 'inactive', 'status deve ser inactive');
      assert.equal(result.deletedAt, updatedAt, 'deletedAt deve ser igual ao updatedAt');
      assert.equal(result.updatedAt, updatedAt, 'updatedAt deve ser atualizado');
    },
  },
  {
    name: 'buildReactivatedPlayerState define status active e zera deletedAt',
    run() {
      const player = createPlayer({ status: 'inactive', deletedAt: '2026-01-01T00:00:00.000Z' });
      const updatedAt = '2026-06-15T10:00:00.000Z';
      const result = buildReactivatedPlayerState(player, updatedAt);
      assert.equal(result.status, 'active', 'status deve ser active');
      assert.equal(result.deletedAt, null, 'deletedAt deve ser null após reativação');
      assert.equal(result.updatedAt, updatedAt, 'updatedAt deve ser atualizado');
    },
  },
  {
    name: 'pickSelfPlayerProfileEditableInput exclui campos administrativos do payload',
    run() {
      const fullInput = {
        fullName: 'Nome Admin',
        nickname: 'Apelido',
        photoUrl: 'https://example.com/photo.jpg',
        jerseyNumber: 7,
        primaryPosition: 'midfielder' as const,
        secondaryPositions: [] as const,
        dominantFoot: 'right' as const,
        status: 'active' as const,
        linkedEmail: 'admin@example.com',
        bio: 'Bio do jogador',
        preferredPosition: null,
        introVideoUrl: null,
        celebrationVideoUrl: null,
        allowSelfEditJerseyNumber: true,
        manualStats: undefined,
      };
      const selfInput = pickSelfPlayerProfileEditableInput(fullInput);
      assert.equal('fullName' in selfInput, false, 'fullName não deve ser editável pelo próprio jogador');
      assert.equal('status' in selfInput, false, 'status não deve ser editável pelo próprio jogador');
      assert.equal('linkedEmail' in selfInput, false, 'linkedEmail não deve ser editável pelo próprio jogador');
      assert.equal('allowSelfEditJerseyNumber' in selfInput, false, 'allowSelfEditJerseyNumber não deve ser editável');
      assert.equal('nickname' in selfInput, true, 'nickname deve ser editável pelo próprio jogador');
      assert.equal('bio' in selfInput, true, 'bio deve ser editável pelo próprio jogador');
      assert.equal('photoUrl' in selfInput, true, 'photoUrl deve ser editável pelo próprio jogador');
    },
  },
  {
    name: 'admin pode excluir partida e partida recebe deletedAt e status canceled',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });
      await mockRepository.deleteMatch('match-1', 'user-admin');
      const snapshot = await mockRepository.getSnapshot();
      const match = snapshot.matches.find((m) => m.id === 'match-1');
      assert.ok(match, 'partida deve continuar no snapshot (soft delete)');
      assert.equal(match?.status, 'canceled', 'status deve mudar para canceled');
      assert.ok(match?.deletedAt, 'deletedAt deve ser preenchido');
      assert.equal(match?.deletedBy, 'user-admin', 'deletedBy deve registrar o admin');
    },
  },
  {
    name: 'jogador comum nao pode excluir partida',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'atacante@bocaiuva.app', password: '123456' });
      await assert.rejects(
        () => mockRepository.deleteMatch('match-1', 'user-striker'),
        (error) =>
          error instanceof Error &&
          error.message.toLowerCase().includes('administrador'),
      );
    },
  },
  {
    name: 'partida excluida nao aparece como finalizada nas estatisticas',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });
      const before = await mockRepository.getSnapshot();
      const finishedBefore = before.matches.filter((m) => m.status === 'finished').length;
      await mockRepository.deleteMatch('match-1', 'user-admin');
      const after = await mockRepository.getSnapshot();
      const finishedAfter = after.matches.filter((m) => m.status === 'finished').length;
      assert.equal(finishedAfter, finishedBefore - 1, 'partida excluida sai do conjunto de finalizadas');
      const deleted = after.matches.find((m) => m.id === 'match-1');
      assert.notEqual(deleted?.status, 'finished', 'partida excluida nao deve ter status finished');
    },
  },
  {
    name: 'admin pode definir MVP manual sobrescrevendo votos',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });
      const updated = await mockRepository.setManualMvp('match-1', 'player-3', 'user-admin');
      assert.deepEqual(updated.mvpWinnerPlayerIds, ['player-3'], 'mvpWinnerPlayerIds deve ser sobrescrito com jogador manual');
      assert.equal(updated.manualMvpPlayerId, 'player-3', 'manualMvpPlayerId deve ser registrado');
      assert.equal(updated.manualMvpSelectedBy, 'user-admin', 'manualMvpSelectedBy deve ser registrado');
    },
  },
  {
    name: 'admin pode limpar MVP manual e sistema volta para votos automaticos',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });
      await mockRepository.setManualMvp('match-1', 'player-3', 'user-admin');
      const cleared = await mockRepository.setManualMvp('match-1', null, 'user-admin');
      assert.equal(cleared.manualMvpPlayerId, null, 'manualMvpPlayerId deve ser limpo');
      assert.equal(cleared.manualMvpSelectedBy, null, 'manualMvpSelectedBy deve ser limpo');
    },
  },
  {
    name: 'jogador comum nao pode definir MVP manual',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'atacante@bocaiuva.app', password: '123456' });
      await assert.rejects(
        () => mockRepository.setManualMvp('match-1', 'player-3', 'user-striker'),
        (error) =>
          error instanceof Error &&
          error.message.toLowerCase().includes('administrador'),
      );
    },
  },
  {
    name: 'admin pode editar participantes de partida encerrada sem restricao de status',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });
      const record = await mockRepository.adminSetMatchAttendance('match-1', 'player-3', 'confirmed', 'user-admin');
      assert.equal(record.matchId, 'match-1', 'record deve pertencer a partida correta');
      assert.equal(record.playerId, 'player-3', 'record deve pertencer ao jogador correto');
      assert.equal(record.status, 'confirmed', 'status deve ser o informado');
      const snapshot = await mockRepository.getSnapshot();
      const attendanceRecord = snapshot.attendance.find(
        (a) => a.matchId === 'match-1' && a.playerId === 'player-3',
      );
      assert.ok(attendanceRecord, 'registro de presenca deve existir no snapshot');
      assert.equal(attendanceRecord?.status, 'confirmed');
    },
  },
  {
    name: 'jogador comum nao pode editar participantes de partida',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'atacante@bocaiuva.app', password: '123456' });
      await assert.rejects(
        () => mockRepository.adminSetMatchAttendance('match-1', 'player-3', 'confirmed', 'user-striker'),
        (error) =>
          error instanceof Error &&
          error.message.toLowerCase().includes('administrador'),
      );
    },
  },
  {
    name: 'admin pode atualizar nome do time',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });
      const updated = await mockRepository.updateTeam(
        'team-bocaiuva',
        {
          name: 'Bocaiuva United',
          coachName: 'Rafael Nogueira',
          slug: 'bocaiuva-united',
          primaryColor: '#0E8A43',
          secondaryColor: '#F4C542',
        },
        'user-admin',
      );
      assert.equal(updated.name, 'Bocaiuva United', 'nome deve ser atualizado');
      assert.equal(updated.slug, 'bocaiuva-united', 'slug deve ser atualizado');
    },
  },
  {
    name: 'jogador sem canManageTeam nao pode atualizar time',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'atacante@bocaiuva.app', password: '123456' });
      await assert.rejects(
        () =>
          mockRepository.updateTeam(
            'team-bocaiuva',
            {
              name: 'Bocaiuva FC',
              coachName: 'Caio Nunes',
              slug: 'bocaiuva-fc',
              primaryColor: '#0E8A43',
              secondaryColor: '#F4C542',
            },
            'user-striker',
          ),
        (error) =>
          error instanceof Error &&
          error.message.toLowerCase().includes('administrador'),
      );
    },
  },
  {
    name: 'updateTeam preserva adminUserId',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });
      const updated = await mockRepository.updateTeam(
        'team-bocaiuva',
        {
          name: 'Bocaiuva FC Atualizado',
          coachName: 'Rafael Nogueira',
          slug: 'bocaiuva-fc',
          primaryColor: '#0E8A43',
          secondaryColor: '#F4C542',
        },
        'user-admin',
      );
      assert.equal(updated.adminUserId, 'user-admin', 'adminUserId deve ser preservado');
    },
  },
  {
    name: 'updateTeam preserva inviteCode',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });
      const updated = await mockRepository.updateTeam(
        'team-bocaiuva',
        {
          name: 'Bocaiuva FC Atualizado',
          coachName: 'Rafael Nogueira',
          slug: 'bocaiuva-fc',
          primaryColor: '#0E8A43',
          secondaryColor: '#F4C542',
        },
        'user-admin',
      );
      assert.equal(updated.inviteCode, 'BOCA26', 'inviteCode deve ser preservado');
    },
  },
  {
    name: 'updateTeam preserva createdAt',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });
      const updated = await mockRepository.updateTeam(
        'team-bocaiuva',
        {
          name: 'Bocaiuva FC Atualizado',
          coachName: 'Rafael Nogueira',
          slug: 'bocaiuva-fc',
          primaryColor: '#0E8A43',
          secondaryColor: '#F4C542',
        },
        'user-admin',
      );
      assert.equal(
        updated.createdAt,
        '2026-03-01T12:00:00.000Z',
        'createdAt deve ser preservado',
      );
    },
  },
  {
    name: 'updateTeam valida isPublic requer city e state',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });
      await assert.rejects(
        () =>
          mockRepository.updateTeam(
            'team-bocaiuva',
            {
              name: 'Bocaiuva FC',
              coachName: 'Rafael Nogueira',
              slug: 'bocaiuva-fc',
              primaryColor: '#0E8A43',
              secondaryColor: '#F4C542',
              isPublic: true,
              city: null,
              state: null,
            },
            'user-admin',
          ),
        (error) =>
          error instanceof Error &&
          (error.message.toLowerCase().includes('cidade') ||
            error.message.toLowerCase().includes('estado') ||
            error.message.toLowerCase().includes('galeria')),
      );
    },
  },
  {
    name: 'updateTeam atualiza coachName',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });
      const updated = await mockRepository.updateTeam(
        'team-bocaiuva',
        {
          name: 'Bocaiuva FC',
          coachName: 'Novo Tecnico',
          slug: 'bocaiuva-fc',
          primaryColor: '#0E8A43',
          secondaryColor: '#F4C542',
        },
        'user-admin',
      );
      assert.equal(updated.coachName, 'Novo Tecnico', 'coachName deve ser atualizado');
    },
  },
  {
    name: 'updateTeam atualiza description',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });
      const updated = await mockRepository.updateTeam(
        'team-bocaiuva',
        {
          name: 'Bocaiuva FC',
          coachName: 'Rafael Nogueira',
          slug: 'bocaiuva-fc',
          primaryColor: '#0E8A43',
          secondaryColor: '#F4C542',
          description: 'Nova descricao do time',
        },
        'user-admin',
      );
      assert.equal(updated.description, 'Nova descricao do time', 'description deve ser atualizada');
    },
  },
  {
    name: 'updateTeam permite ativar perfil publico com city e state',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });
      const updated = await mockRepository.updateTeam(
        'team-bocaiuva',
        {
          name: 'Bocaiuva FC',
          coachName: 'Rafael Nogueira',
          slug: 'bocaiuva-fc',
          primaryColor: '#0E8A43',
          secondaryColor: '#F4C542',
          isPublic: true,
          city: 'Bocaiuva',
          state: 'MG',
        },
        'user-admin',
      );
      assert.equal(updated.isPublic, true, 'isPublic deve ser true');
      assert.equal(updated.city, 'Bocaiuva', 'city deve ser salva');
      assert.equal(updated.state, 'MG', 'state deve ser salvo');
    },
  },
  {
    name: 'admin+jogador confirma própria presença — userId do registro é o do actor',
    async run() {
      resetMockRepositoryState();
      // user-admin tem roles ['admin', 'player'] e playerId player-7
      const record = await mockRepository.updateAttendance(
        { matchId: 'match-3', playerId: 'player-7', status: 'confirmed' },
        'user-admin',
      );
      assert.equal(record.playerId, 'player-7', 'playerId deve ser player-7');
      assert.equal(record.status, 'confirmed', 'status deve ser confirmed');
      assert.equal(record.userId, 'user-admin', 'userId deve ser o do actor ao confirmar própria presença');
    },
  },
  {
    name: 'admin confirma presença em partida scheduled — retorna record com campos corretos',
    async run() {
      resetMockRepositoryState();
      // match-4 tem status scheduled; player-8 já tem att-4-8 (pending)
      const record = await mockRepository.updateAttendance(
        { matchId: 'match-4', playerId: 'player-8', status: 'confirmed' },
        'user-admin',
      );
      assert.equal(record.matchId, 'match-4', 'matchId deve ser match-4');
      assert.equal(record.playerId, 'player-8', 'playerId deve ser player-8');
      assert.equal(record.teamId, 'team-bocaiuva', 'teamId deve ser do time');
      assert.equal(record.status, 'confirmed', 'status deve ser confirmed');
    },
  },
  {
    name: 'admin cria notificação ao confirmar presença de outro jogador',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });

      await mockRepository.updateAttendance(
        { matchId: 'match-3', playerId: 'player-10', status: 'confirmed' },
        'user-admin',
      );

      const snapshotAfter = await mockRepository.getSnapshot();
      const notification = snapshotAfter.notifications.find(
        (n) => n.id === 'notification__attendance-confirmed__match-3__player-10',
      );
      assert.ok(notification, 'notificação de presença deve existir para player-10 após confirmar');
    },
  },
  {
    name: 'admin cria notificação ao marcar outro jogador como ausente',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });

      await mockRepository.updateAttendance(
        { matchId: 'match-3', playerId: 'player-10', status: 'absent' },
        'user-admin',
      );

      const snapshotAfter = await mockRepository.getSnapshot();
      const notification = snapshotAfter.notifications.find(
        (n) => n.id === 'notification__attendance-confirmed__match-3__player-10',
      );
      assert.ok(notification, 'notificação deve existir para player-10 após marcar ausente');
    },
  },
  {
    name: 'admin remove notificação ao limpar presença de outro jogador',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });

      // Cria a notificação primeiro
      await mockRepository.updateAttendance(
        { matchId: 'match-3', playerId: 'player-10', status: 'confirmed' },
        'user-admin',
      );
      const snapshotAfterConfirm = await mockRepository.getSnapshot();
      assert.ok(
        snapshotAfterConfirm.notifications.find(
          (n) => n.id === 'notification__attendance-confirmed__match-3__player-10',
        ),
        'notificação deve existir após confirmar',
      );

      // Remove a notificação ao limpar
      await mockRepository.updateAttendance(
        { matchId: 'match-3', playerId: 'player-10', status: 'pending' },
        'user-admin',
      );
      const snapshotAfterPending = await mockRepository.getSnapshot();
      assert.equal(
        snapshotAfterPending.notifications.find(
          (n) => n.id === 'notification__attendance-confirmed__match-3__player-10',
        ),
        undefined,
        'notificação deve ser removida ao limpar presença',
      );
    },
  },
  {
    name: 'confirmar presença em partida encerrada lança erro para admin',
    async run() {
      resetMockRepositoryState();
      // match-1 tem status finished
      await assert.rejects(
        () =>
          mockRepository.updateAttendance(
            { matchId: 'match-1', playerId: 'player-9', status: 'confirmed' },
            'user-admin',
          ),
        (error) =>
          error instanceof Error &&
          error.message === 'A presença desta partida não aceita mais alterações.',
      );
    },
  },
  {
    name: 'confirmar presença em partida encerrada lança erro para jogador',
    async run() {
      resetMockRepositoryState();
      // match-1 tem status finished
      await assert.rejects(
        () =>
          mockRepository.updateAttendance(
            { matchId: 'match-1', playerId: 'player-9', status: 'confirmed' },
            'user-striker',
          ),
        (error) =>
          error instanceof Error &&
          error.message === 'A presença desta partida não aceita mais alterações.',
      );
    },
  },
  {
    name: 'jogador confirma própria presença — userId do registro é do usuário que confirmou',
    async run() {
      resetMockRepositoryState();
      const record = await mockRepository.updateAttendance(
        { matchId: 'match-3', playerId: 'player-9', status: 'confirmed' },
        'user-striker',
      );
      assert.equal(record.playerId, 'player-9', 'playerId deve ser player-9');
      assert.equal(record.userId, 'user-striker', 'userId deve ser o do usuário que confirmou');
    },
  },
  {
    name: 'admin atualiza presença existente — userId preenchido com linkedUserId do jogador',
    async run() {
      resetMockRepositoryState();
      // att-3-9 existe mas sem userId; player-9 tem linkedUserId 'user-striker'
      const record = await mockRepository.updateAttendance(
        { matchId: 'match-3', playerId: 'player-9', status: 'absent' },
        'user-admin',
      );
      assert.equal(record.playerId, 'player-9', 'playerId deve ser player-9');
      assert.equal(record.status, 'absent', 'status deve ser absent');
      assert.equal(record.userId, 'user-striker', 'userId deve ser o linkedUserId do jogador');
    },
  },
  {
    name: 'admin pode limpar própria presença — status fica pending',
    async run() {
      resetMockRepositoryState();
      // att-3-7 existe para player-7 (admin) com status confirmed
      const record = await mockRepository.updateAttendance(
        { matchId: 'match-3', playerId: 'player-7', status: 'pending' },
        'user-admin',
      );
      assert.equal(record.playerId, 'player-7', 'playerId deve ser player-7');
      assert.equal(record.status, 'pending', 'status deve ser pending após limpar');
    },
  },
  {
    name: 'notificação de presença criada pelo admin tem teamId e actorUserId corretos',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });

      await mockRepository.updateAttendance(
        { matchId: 'match-3', playerId: 'player-10', status: 'confirmed' },
        'user-admin',
      );

      const snapshotAfter = await mockRepository.getSnapshot();
      const notification = snapshotAfter.notifications.find(
        (n) => n.id === 'notification__attendance-confirmed__match-3__player-10',
      );
      assert.ok(notification, 'notificação deve existir');
      assert.equal(notification?.teamId, 'team-bocaiuva', 'teamId da notificação deve ser do time');
      assert.equal(notification?.actorUserId, 'user-admin', 'actorUserId deve ser o admin que confirmou');
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
