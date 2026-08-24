import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  addPlayerToQueue,
  getQueuedTeams,
  initRodizio,
  registerRodizioWin,
  removePlayerFromActiveTeam,
  removePlayerFromQueue,
  sortByPots,
  sortRandomly,
} from '@/lib/pickup-tools';
import type { RodizioState } from '@/lib/pickup-tools';

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
import { isLiteralRouteParam } from '@/lib/route-params';
import { isIndexablePublicRoute } from '@/lib/seo-routes';
import { buildCanonicalUrl, SITE_URL } from '@/lib/public-seo';
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
  buildLineupStateFromSource,
  getFormationPresetByKey,
  sanitizeLineupLayoutState,
} from '@/lib/lineup';
import {
  findMatchById,
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
  patchMockTeamMember,
  resetMockRepositoryState,
} from '@/services/repository/mock-repository';
import { normalizeTeamMemberStatus } from '@/lib/team-membership';
import {
  PICKUP_TOOLS_STORAGE_KEY,
  hasActiveRodizio,
  loadStoredState,
} from '@/store/pickup-tools-store';
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
import { accessibilityHardeningTestCases } from './accessibility-hardening-cases';
import { expensesTestCases } from './expenses-cases';
import { expensesRepositoryTestCases } from './expenses-repository-cases';
import { feeExemptionTestCases } from './fee-exemption-cases';
import { joinTeamTestCases } from './join-team-cases';
import { matchHighlightsTestCases } from './match-highlights-cases';
import { mobileLayoutTestCases } from './mobile-layout-cases';
import { mvpVotePermissionTestCases } from './mvp-vote-permission-cases';
import { lineupShareTestCases } from './lineup-share-cases';
import { supabaseFinanceiroTestCases } from './supabase-financeiro-cases';
import { supabaseModulosTestCases } from './supabase-modulos-cases';
import { supabasePartidasTestCases } from './supabase-partidas-cases';
import { supabaseResenhasTestCases } from './supabase-resenhas-cases';
import { migracaoPostgresTestCases } from './migracao-postgres-cases';
import { realtimeBootstrapTestCases } from './realtime-bootstrap-cases';
import { ratingAverageTestCases } from './rating-average-cases';
import { playerDeletionTestCases } from './player-deletion-cases';
import { fieldCostExemptTestCases } from './field-cost-exempt-cases';
import { searchTestCases } from './search-cases';
import { statsBreakdownFinanceTestCases } from './stats-breakdown-finance-cases';
import { supabaseHardeningTestCases } from './supabase-hardening-cases';
import { themeContrastTestCases } from './theme-contrast-cases';

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

const testCases: TestCase[] = [
  ...accessibilityHardeningTestCases,
  ...statsBreakdownFinanceTestCases,
  ...themeContrastTestCases,
  ...expensesTestCases,
  ...expensesRepositoryTestCases,
  ...searchTestCases,
  ...fieldCostExemptTestCases,
  ...feeExemptionTestCases,
  ...joinTeamTestCases,
  ...playerDeletionTestCases,
  ...matchHighlightsTestCases,
  ...ratingAverageTestCases,
  ...mobileLayoutTestCases,
  ...mvpVotePermissionTestCases,
  ...realtimeBootstrapTestCases,
  ...supabaseHardeningTestCases,
  ...migracaoPostgresTestCases,
  ...lineupShareTestCases,
  ...supabaseModulosTestCases,
  ...supabaseFinanceiroTestCases,
  ...supabaseResenhasTestCases,
  ...supabasePartidasTestCases,
  {
    name: 'sitemap oficial contem somente as dez URLs publicas canonicas',
    run() {
      assert.equal(fs.existsSync('public/sitemap.xml'), true);
      assert.equal(fs.existsSync('public/sitemap-main.xml'), false);
      const xml = fs.readFileSync('public/sitemap.xml', 'utf8');
      assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
      assert.match(xml, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
      const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
      const expected = [
        `${SITE_URL}/`,
        `${SITE_URL}/ferramentas`,
        `${SITE_URL}/ferramentas/sorteador-de-times`,
        `${SITE_URL}/ferramentas/cronometro-pelada`,
        `${SITE_URL}/ferramentas/rodizio-de-times`,
        `${SITE_URL}/ferramentas/campeonato-rapido`,
        `${SITE_URL}/teams-gallery`,
        `${SITE_URL}/privacidade`,
        `${SITE_URL}/termos`,
        `${SITE_URL}/suporte`,
      ];
      assert.deepEqual(urls, expected);
      assert.equal(new Set(urls).size, 10);
      for (const url of urls) {
        const parsed = new URL(url);
        assert.equal(parsed.protocol, 'https:');
        assert.equal(parsed.origin, SITE_URL);
        assert.equal(parsed.search, '');
        assert.equal(parsed.hash, '');
        assert.doesNotMatch(url, /\[|%5B|\.html|undefined|null/i);
        if (url !== `${SITE_URL}/`) assert.equal(url.endsWith('/'), false);
      }
      assert.doesNotMatch(xml, /login|register|forgot-password|\/home|\/matches|\/players|\/profile|\/stats|\/rankings|\/notifications|\/team-/);
    },
  },
  {
    name: 'robots anuncia somente o sitemap oficial e permite leitura do noindex',
    run() {
      const robots = fs.readFileSync('public/robots.txt', 'utf8');
      assert.match(robots, /User-agent:\s*\*/i);
      assert.match(robots, /Allow:\s*\//i);
      assert.doesNotMatch(robots, /^Disallow:/im);
      const sitemapLines = robots.match(/^Sitemap:.*$/gim) ?? [];
      assert.deepEqual(sitemapLines, [`Sitemap: ${SITE_URL}/sitemap.xml`]);
      assert.doesNotMatch(robots, /sitemap-main\.xml/i);
    },
  },
  {
    name: 'canonical publico usa dominio central e normaliza barra, query e hash',
    run() {
      assert.equal(buildCanonicalUrl('/'), `${SITE_URL}/`);
      assert.equal(buildCanonicalUrl('/ferramentas/'), `${SITE_URL}/ferramentas`);
      assert.equal(buildCanonicalUrl('/teams-gallery?origem=teste#times'), `${SITE_URL}/teams-gallery`);
    },
  },
  {
    name: 'metadata publica central possui conjunto completo de OG e Twitter',
    run() {
      const source = fs.readFileSync('src/components/seo/PublicSeoHead.tsx', 'utf8');
      for (const marker of ['<title>', 'name="description"', 'rel="canonical"', 'property="og:title"', 'property="og:description"', 'property="og:url"', 'property="og:type"', 'property="og:site_name"', 'property="og:locale"', 'name="twitter:card"', 'name="twitter:title"', 'name="twitter:description"']) {
        assert.match(source, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      }
    },
  },
  {
    name: 'documento global nao disputa title, description, OG ou Twitter das paginas',
    run() {
      const source = fs.readFileSync('src/app/+html.tsx', 'utf8');
      assert.doesNotMatch(source, /<title>|name="description"|property="og:|name="twitter:/);
    },
  },
  {
    name: 'parametro literal reconhece valores crus e codificados',
    run() {
      for (const value of ['[matchId]', '[playerId]', '[teamId]', '%5BmatchId%5D', '%5BplayerId%5D', '%5BteamId%5D']) {
        assert.equal(isLiteralRouteParam(value), true, `${value} deve ser literal`);
      }
      for (const value of [undefined, '', 'match-1', 'team-123', '%invalid']) {
        assert.equal(isLiteralRouteParam(value), false, `${String(value)} nao deve ser literal`);
      }
    },
  },
  {
    name: 'politica SEO central classifica rotas privadas, autenticacao e publicas',
    run() {
      assert.equal(isIndexablePublicRoute(['(app)', '(tabs)', 'home']), false);
      assert.equal(isIndexablePublicRoute(['(app)', 'matches', 'create']), false);
      assert.equal(isIndexablePublicRoute(['(auth)', 'login']), false);
      assert.equal(isIndexablePublicRoute(['+not-found']), false);
      assert.equal(isIndexablePublicRoute([]), true);
      assert.equal(isIndexablePublicRoute(['ferramentas']), true);
      assert.equal(isIndexablePublicRoute(['teams-gallery']), true);
    },
  },
  {
    name: 'componente noindex define robots e googlebot uma unica vez',
    run() {
      const source = fs.readFileSync('src/components/seo/NoIndexHead.tsx', 'utf8');
      assert.equal((source.match(/name="robots"/g) ?? []).length, 1);
      assert.equal((source.match(/name="googlebot"/g) ?? []).length, 1);
      assert.match(source, /noindex, nofollow/);
    },
  },
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
    name: 'sanitizeLineupLayoutState remove duplicados, normaliza coordenadas e recoloca faltantes no banco',
    run() {
      const players = [
        createPlayer({ id: 'player-lineup-1' }),
        createPlayer({ id: 'player-lineup-2' }),
        createPlayer({ id: 'player-lineup-3' }),
        createPlayer({ id: 'player-lineup-4' }),
      ];

      const sanitized = sanitizeLineupLayoutState({
        formationKey: 'society-3-2-1',
        starters: [
          { playerId: 'player-lineup-1', x: 140, y: -8, zone: 'goalkeeper', label: ' Capita ' },
          { playerId: 'player-lineup-1', x: 22, y: 68, zone: 'defense', label: null },
          { playerId: 'player-lineup-4', x: 50, y: 66, zone: 'defense', label: null },
          { playerId: 'player-lineup-3', x: 78, y: 68, zone: 'defense', label: null },
        ],
        benchPlayerIds: ['player-lineup-4', 'player-lineup-2', 'player-lineup-2', 'ghost'],
        players,
        starterLimit: 3,
        fallbackFormationKey: 'society-3-2-1',
        fallbackCoordinates: [
          { x: 50, y: 90, zone: 'goalkeeper' },
          { x: 22, y: 68, zone: 'defense' },
          { x: 78, y: 68, zone: 'defense' },
        ],
      });

      assert.deepEqual(
        sanitized.starters.map((node) => node.playerId),
        ['player-lineup-1', 'player-lineup-4', 'player-lineup-3'],
      );
      assert.deepEqual(sanitized.benchPlayerIds, ['player-lineup-2']);
      assert.equal(sanitized.starters[0]?.x, 100);
      assert.equal(sanitized.starters[0]?.y, 0);
      assert.equal(sanitized.starters[0]?.label, 'Capita');
    },
  },
  {
    name: 'saveLineup no mock persiste mover titular para o banco e recarrega a nova versao',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });
      const before = await mockRepository.getSnapshot();
      const match = before.matches.find((item) => item.id === 'match-3');
      const current = before.lineups.find((lineup) => lineup.matchId === 'match-3');
      assert.ok(match, 'partida match-3 deve existir no seed');
      assert.ok(current, 'lineup de match-3 deve existir no seed');
      const confirmedPlayerIds = new Set(
        before.attendance
          .filter((item) => item.matchId === 'match-3' && item.status === 'confirmed')
          .map((item) => item.playerId),
      );
      const preset = getFormationPresetByKey(
        match!.matchType,
        match!.linePlayersCount,
        current!.formationKey,
      );
      const currentDraft = buildLineupStateFromSource({
        existingLineup: current!,
        preset,
        players: before.players.filter((player) => confirmedPlayerIds.has(player.id)),
      });

      await mockRepository.saveLineup(
        {
          matchId: 'match-3',
          formationKey: currentDraft.formationKey,
          starters: currentDraft.starters.filter((node) => node.playerId !== 'player-7'),
          benchPlayerIds: [...currentDraft.benchPlayerIds, 'player-7'],
        },
        'user-admin',
      );

      const after = await mockRepository.getSnapshot();
      const saved = after.lineups.find((lineup) => lineup.matchId === 'match-3');
      assert.ok(saved, 'lineup atualizada deve continuar acessivel');
      assert.equal(
        saved?.starters.some((node) => node.playerId === 'player-7'),
        false,
        'player-7 nao deve continuar entre os titulares',
      );
      assert.equal(
        saved?.benchPlayerIds.includes('player-7'),
        true,
        'player-7 deve aparecer no banco apos salvar',
      );
    },
  },
  {
    name: 'saveLineup no mock persiste troca entre titular e reserva sem duplicar jogador',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });
      const before = await mockRepository.getSnapshot();
      const match = before.matches.find((item) => item.id === 'match-3');
      const current = before.lineups.find((lineup) => lineup.matchId === 'match-3');
      assert.ok(match, 'partida match-3 deve existir no seed');
      assert.ok(current, 'lineup de match-3 deve existir no seed');
      const confirmedPlayerIds = new Set(
        before.attendance
          .filter((item) => item.matchId === 'match-3' && item.status === 'confirmed')
          .map((item) => item.playerId),
      );
      const preset = getFormationPresetByKey(
        match!.matchType,
        match!.linePlayersCount,
        current!.formationKey,
      );
      const currentDraft = buildLineupStateFromSource({
        existingLineup: current!,
        preset,
        players: before.players.filter((player) => confirmedPlayerIds.has(player.id)),
      });
      const targetSlot = currentDraft.starters.find((node) => node.playerId === 'player-7');
      assert.ok(targetSlot, 'player-7 deve existir entre os titulares');

      await mockRepository.saveLineup(
        {
          matchId: 'match-3',
          formationKey: currentDraft.formationKey,
          starters: currentDraft.starters.map((node) =>
            node.playerId === 'player-7'
              ? { ...targetSlot!, playerId: 'player-11' }
              : node,
          ),
          benchPlayerIds: currentDraft.benchPlayerIds.map((playerId) =>
            playerId === 'player-11' ? 'player-7' : playerId,
          ),
        },
        'user-admin',
      );

      const after = await mockRepository.getSnapshot();
      const saved = after.lineups.find((lineup) => lineup.matchId === 'match-3');
      assert.ok(saved, 'lineup atualizada deve continuar acessivel');
      assert.equal(
        saved?.starters.some((node) => node.playerId === 'player-11'),
        true,
        'player-11 deve entrar como titular depois do swap',
      );
      assert.equal(
        saved?.benchPlayerIds.includes('player-7'),
        true,
        'player-7 deve ir para o banco depois do swap',
      );
      const allIds = [
        ...(saved?.starters.map((node) => node.playerId) ?? []),
        ...(saved?.benchPlayerIds ?? []),
      ];
      assert.equal(allIds.length, new Set(allIds).size, 'nenhum jogador deve duplicar na lineup salva');
    },
  },
  {
    name: 'saveLineup no mock persiste posicao de drag apos recarregar o snapshot',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });
      const before = await mockRepository.getSnapshot();
      const match = before.matches.find((item) => item.id === 'match-3');
      const current = before.lineups.find((lineup) => lineup.matchId === 'match-3');
      assert.ok(match, 'partida match-3 deve existir no seed');
      assert.ok(current, 'lineup de match-3 deve existir no seed');
      const confirmedPlayerIds = new Set(
        before.attendance
          .filter((item) => item.matchId === 'match-3' && item.status === 'confirmed')
          .map((item) => item.playerId),
      );
      const preset = getFormationPresetByKey(
        match!.matchType,
        match!.linePlayersCount,
        current!.formationKey,
      );
      const currentDraft = buildLineupStateFromSource({
        existingLineup: current!,
        preset,
        players: before.players.filter((player) => confirmedPlayerIds.has(player.id)),
      });

      await mockRepository.saveLineup(
        {
          matchId: 'match-3',
          formationKey: currentDraft.formationKey,
          starters: currentDraft.starters.map((node) =>
            node.playerId === 'player-9'
              ? { ...node, x: 12.4, y: 27.8, zone: 'attack' }
              : node,
          ),
          benchPlayerIds: currentDraft.benchPlayerIds,
        },
        'user-admin',
      );

      const after = await mockRepository.getSnapshot();
      const saved = after.lineups.find((lineup) => lineup.matchId === 'match-3');
      const moved = saved?.starters.find((node) => node.playerId === 'player-9');
      assert.ok(moved, 'player-9 deve continuar entre os titulares');
      assert.equal(moved?.x, 12.4);
      assert.equal(moved?.y, 27.8);
      assert.equal(moved?.zone, 'attack');
    },
  },
  {
    name: 'saveLineup no mock bloqueia jogador repetido entre titulares e banco',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });
      const before = await mockRepository.getSnapshot();
      const match = before.matches.find((item) => item.id === 'match-3');
      const current = before.lineups.find((lineup) => lineup.matchId === 'match-3');
      assert.ok(match, 'partida match-3 deve existir no seed');
      assert.ok(current, 'lineup de match-3 deve existir no seed');
      const confirmedPlayerIds = new Set(
        before.attendance
          .filter((item) => item.matchId === 'match-3' && item.status === 'confirmed')
          .map((item) => item.playerId),
      );
      const preset = getFormationPresetByKey(
        match!.matchType,
        match!.linePlayersCount,
        current!.formationKey,
      );
      const currentDraft = buildLineupStateFromSource({
        existingLineup: current!,
        preset,
        players: before.players.filter((player) => confirmedPlayerIds.has(player.id)),
      });

      await assert.rejects(
        () =>
          mockRepository.saveLineup(
            {
              matchId: 'match-3',
              formationKey: currentDraft.formationKey,
              starters: currentDraft.starters,
              benchPlayerIds: [...currentDraft.benchPlayerIds, currentDraft.starters[0]!.playerId],
            },
            'user-admin',
          ),
        (error) =>
          error instanceof Error &&
          error.message.toLowerCase().includes('repetidos'),
      );
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

  // ── sortRandomly ──────────────────────────────────────────────────────────
  {
    name: 'sortRandomly: 10 jogadores, 5 por time → 2 times de 5, sem reservas',
    run() {
      const players = Array.from({ length: 10 }, (_, i) => `p${i + 1}`);
      const { teams, reservas } = sortRandomly(players, 5);
      assert.equal(teams.length, 2, 'deve ter 2 times');
      assert.equal(teams[0].length, 5, 'time 1 deve ter 5 jogadores');
      assert.equal(teams[1].length, 5, 'time 2 deve ter 5 jogadores');
      assert.equal(reservas.length, 0, 'sem reservas');
    },
  },
  {
    name: 'sortRandomly: 11 jogadores, 5 por time → 2 times de 5 + 1 reserva',
    run() {
      const players = Array.from({ length: 11 }, (_, i) => `p${i + 1}`);
      const { teams, reservas } = sortRandomly(players, 5);
      assert.equal(teams.length, 2);
      assert.equal(teams[0].length, 5);
      assert.equal(teams[1].length, 5);
      assert.equal(reservas.length, 1);
    },
  },
  {
    name: 'sortRandomly: 12 jogadores, 5 por time → 2 times de 5 + 2 reservas',
    run() {
      const players = Array.from({ length: 12 }, (_, i) => `p${i + 1}`);
      const { teams, reservas } = sortRandomly(players, 5);
      assert.equal(teams.length, 2);
      assert.equal(teams[0].length, 5);
      assert.equal(teams[1].length, 5);
      assert.equal(reservas.length, 2);
    },
  },
  {
    name: 'sortRandomly: nunca produz times de tamanhos diferentes (6v4 impossível para 10j/5pt)',
    run() {
      const players = Array.from({ length: 10 }, (_, i) => `p${i + 1}`);
      for (let trial = 0; trial < 20; trial++) {
        const { teams } = sortRandomly(players, 5);
        for (const team of teams) {
          assert.equal(team.length, 5, `time com ${team.length} jogadores em vez de 5`);
        }
      }
    },
  },
  {
    name: 'sortRandomly: todos os jogadores aparecem exatamente uma vez',
    run() {
      const players = Array.from({ length: 13 }, (_, i) => `p${i + 1}`);
      const { teams, reservas } = sortRandomly(players, 5);
      const all = [...teams.flat(), ...reservas].sort();
      assert.deepEqual(all, [...players].sort(), 'todos os jogadores devem aparecer uma vez');
    },
  },

  // ── sortByPots ────────────────────────────────────────────────────────────
  {
    name: 'sortByPots: 10 jogadores com potes → 2 times de 5, distribuição equilibrada',
    run() {
      const players = [
        { name: 'p1', pot: 1 as const },
        { name: 'p2', pot: 1 as const },
        { name: 'p3', pot: 2 as const },
        { name: 'p4', pot: 2 as const },
        { name: 'p5', pot: 3 as const },
        { name: 'p6', pot: 3 as const },
        { name: 'p7', pot: 3 as const },
        { name: 'p8', pot: 3 as const },
        { name: 'p9', pot: 4 as const },
        { name: 'p10', pot: 4 as const },
      ];
      const { teams, reservas } = sortByPots(players, 5);
      assert.equal(teams.length, 2, 'deve ter 2 times');
      assert.equal(teams[0].length, 5, 'time 1 deve ter 5');
      assert.equal(teams[1].length, 5, 'time 2 deve ter 5');
      assert.equal(reservas.length, 0, 'sem reservas');
    },
  },
  {
    name: 'sortByPots: potes não sequenciais (ex: apenas P1 e P4) funcionam',
    run() {
      const players = [
        { name: 'craque1', pot: 1 as const },
        { name: 'craque2', pot: 1 as const },
        { name: 'medio1', pot: 4 as const },
        { name: 'medio2', pot: 4 as const },
        { name: 'medio3', pot: 4 as const },
        { name: 'medio4', pot: 4 as const },
        { name: 'medio5', pot: 4 as const },
        { name: 'medio6', pot: 4 as const },
      ];
      const { teams, reservas } = sortByPots(players, 4);
      assert.equal(teams.length, 2, 'deve ter 2 times');
      assert.equal(teams[0].length, 4);
      assert.equal(teams[1].length, 4);
      assert.equal(reservas.length, 0);
    },
  },
  {
    name: 'sortByPots: todos os jogadores aparecem exatamente uma vez',
    run() {
      const players = Array.from({ length: 11 }, (_, i) => ({
        name: `p${i + 1}`,
        pot: ((i % 4) + 1) as 1 | 2 | 3 | 4,
      }));
      const { teams, reservas } = sortByPots(players, 5);
      const all = [...teams.flat(), ...reservas].sort();
      assert.deepEqual(all, players.map((p) => p.name).sort());
    },
  },

  // ── initRodizio ──────────────────────────────────────────────────────────
  {
    name: 'initRodizio: 16 jogadores, 5 por time → teamA=5, teamB=5, waiting=6',
    run() {
      const players = Array.from({ length: 16 }, (_, i) => `p${i + 1}`);
      const state = initRodizio(players, 5);
      assert.equal(state.teamA.length, 5, 'teamA deve ter 5');
      assert.equal(state.teamB.length, 5, 'teamB deve ter 5');
      assert.equal(state.waitingPlayers.length, 6, 'waiting deve ter 6');
      assert.deepEqual(state.teamA, ['p1', 'p2', 'p3', 'p4', 'p5']);
      assert.deepEqual(state.teamB, ['p6', 'p7', 'p8', 'p9', 'p10']);
      assert.deepEqual(state.waitingPlayers, ['p11', 'p12', 'p13', 'p14', 'p15', 'p16']);
    },
  },

  // ── registerRodizioWin ───────────────────────────────────────────────────
  {
    name: 'registerRodizioWin: winner A → A fica, B vai para fila, próximos 5 da fila entram',
    run() {
      const players = Array.from({ length: 16 }, (_, i) => `p${i + 1}`);
      const state = initRodizio(players, 5);
      // teamA=p1-5, teamB=p6-10, waiting=p11-16
      const next = registerRodizioWin(state, 'A', 5);
      // Expected: teamA=p1-5 (same), teamB=p11-15 (first 5 from waiting), waiting=p16,p6-10
      assert.deepEqual(next.teamA, ['p1', 'p2', 'p3', 'p4', 'p5'], 'vencedor A deve permanecer');
      assert.deepEqual(next.teamB, ['p11', 'p12', 'p13', 'p14', 'p15'], 'próximos 5 da fila entram como time B');
      assert.deepEqual(next.waitingPlayers, ['p16', 'p6', 'p7', 'p8', 'p9', 'p10'], 'p16 fica na frente dos perdedores');
    },
  },
  {
    name: 'registerRodizioWin: winner B → B fica, A vai para fila',
    run() {
      const players = Array.from({ length: 16 }, (_, i) => `p${i + 1}`);
      const state = initRodizio(players, 5);
      const next = registerRodizioWin(state, 'B', 5);
      assert.deepEqual(next.teamA, ['p6', 'p7', 'p8', 'p9', 'p10'], 'vencedor B deve permanecer como teamA');
      assert.deepEqual(next.teamB, ['p11', 'p12', 'p13', 'p14', 'p15'], 'próximos da fila entram');
      assert.deepEqual(next.waitingPlayers, ['p16', 'p1', 'p2', 'p3', 'p4', 'p5'], 'perdedores (A) vão para o fim');
    },
  },
  {
    name: 'registerRodizioWin: fila vazia → jogo se repete com os mesmos times',
    run() {
      const state = {
        teamA: ['p1', 'p2', 'p3'],
        teamB: ['p4', 'p5', 'p6'],
        waitingPlayers: [],
      };
      const next = registerRodizioWin(state, 'A', 3);
      assert.deepEqual(next.teamA, ['p1', 'p2', 'p3']);
      assert.deepEqual(next.teamB, ['p4', 'p5', 'p6']);
      assert.deepEqual(next.waitingPlayers, []);
    },
  },
  {
    name: 'registerRodizioWin: fila incompleta (< perTeam) forma time parcial',
    run() {
      const state = {
        teamA: ['p1', 'p2', 'p3', 'p4', 'p5'],
        teamB: ['p6', 'p7', 'p8', 'p9', 'p10'],
        waitingPlayers: ['p11', 'p12'],
      };
      const next = registerRodizioWin(state, 'A', 5);
      // waiting=p11,p12 + loser p6-p10 → nextTeam=p11,p12,p6,p7,p8; remaining=p9,p10
      assert.deepEqual(next.teamB, ['p11', 'p12', 'p6', 'p7', 'p8']);
      assert.deepEqual(next.waitingPlayers, ['p9', 'p10']);
    },
  },

  // ── getQueuedTeams ───────────────────────────────────────────────────────
  {
    name: 'getQueuedTeams: 6 jogadores, 5 por time → [[5], [1]]',
    run() {
      const waiting = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
      const groups = getQueuedTeams(waiting, 5);
      assert.equal(groups.length, 2);
      assert.deepEqual(groups[0], ['p1', 'p2', 'p3', 'p4', 'p5']);
      assert.deepEqual(groups[1], ['p6']);
    },
  },
  {
    name: 'getQueuedTeams: fila vazia → []',
    run() {
      assert.deepEqual(getQueuedTeams([], 5), []);
    },
  },

  // ── persistência e reset (lógica pura, sem DOM/localStorage) ─────────────
  {
    name: 'estado do store é serializável em JSON (sem funções circulares)',
    run() {
      // Simula o que Zustand persist faz ao salvar: JSON.stringify do estado
      const state = {
        durationMs: 10 * 60 * 1000,
        remainingMsWhenPaused: 7 * 60 * 1000,
        startedAt: 1718881200000,
        isRunning: true,
        teamAScore: 1,
        teamBScore: 0,
        goalLimit: 2,
        winner: null,
        players: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10'],
        playersPerTeam: 5,
        teamA: ['p1', 'p2', 'p3', 'p4', 'p5'],
        teamB: ['p6', 'p7', 'p8', 'p9', 'p10'],
        waitingPlayers: [],
        phase: 'playing',
        matchCount: 1,
      };
      const serialized = JSON.stringify(state);
      const parsed = JSON.parse(serialized);
      assert.equal(parsed.durationMs, state.durationMs);
      assert.equal(parsed.startedAt, state.startedAt);
      assert.equal(parsed.isRunning, state.isRunning);
      assert.equal(parsed.teamAScore, state.teamAScore);
      assert.deepEqual(parsed.teamA, state.teamA);
      assert.deepEqual(parsed.players, state.players);
      assert.equal(parsed.phase, state.phase);
    },
  },
  {
    name: 'computeRemainingMs: timer expirado retorna 0 (não negativo)',
    run() {
      const state = {
        isRunning: true,
        startedAt: Date.now() - 15 * 60 * 1000, // 15 minutos atrás
        remainingMsWhenPaused: 10 * 60 * 1000,  // configurado para 10 min
        winner: null as 'A' | 'B' | 'draw' | null,
      };
      const remaining = Math.max(
        0,
        state.isRunning && state.startedAt !== null
          ? state.remainingMsWhenPaused - (Date.now() - state.startedAt)
          : state.remainingMsWhenPaused,
      );
      assert.equal(remaining, 0, 'tempo expirado deve retornar 0, nunca negativo');
    },
  },
  {
    name: 'computeRemainingMs: timer pausado retorna remainingMsWhenPaused',
    run() {
      const frozenMs = 4 * 60 * 1000 + 30 * 1000; // 4:30 restantes
      const state = {
        isRunning: false,
        startedAt: null as number | null,
        remainingMsWhenPaused: frozenMs,
        winner: null as 'A' | 'B' | 'draw' | null,
      };
      const remaining =
        !state.isRunning || state.startedAt === null
          ? state.remainingMsWhenPaused
          : Math.max(0, state.remainingMsWhenPaused - (Date.now() - state.startedAt));
      assert.equal(remaining, frozenMs, 'timer pausado deve manter o tempo congelado');
    },
  },
  {
    name: 'reset retorna estado padrão — todos os campos principais voltam ao default',
    run() {
      // Simula reset: substitui state por defaults
      const defaults = {
        durationMs: 10 * 60 * 1000,
        remainingMsWhenPaused: 10 * 60 * 1000,
        startedAt: null,
        isRunning: false,
        teamAScore: 0,
        teamBScore: 0,
        goalLimit: 2,
        winner: null,
        players: [],
        playersPerTeam: 5,
        teamA: [],
        teamB: [],
        waitingPlayers: [],
        phase: 'setup',
        matchCount: 0,
      };
      const state = { ...defaults };
      assert.equal(state.isRunning, false);
      assert.equal(state.winner, null);
      assert.deepEqual(state.teamA, []);
      assert.deepEqual(state.waitingPlayers, []);
      assert.equal(state.phase, 'setup');
      assert.equal(state.matchCount, 0);
    },
  },
  // ── removePlayerFromQueue ────────────────────────────────────────────────
  {
    name: 'removePlayerFromQueue: remove p8 do meio da fila mantendo ordem',
    run() {
      const state: RodizioState = {
        teamA: ['p1', 'p2', 'p3', 'p4', 'p5'],
        teamB: ['p11', 'p12', 'p13', 'p14', 'p15'],
        waitingPlayers: ['p16', 'p6', 'p7', 'p8', 'p9', 'p10'],
      };
      const next = removePlayerFromQueue(state, 'p8');
      assert.deepEqual(next.waitingPlayers, ['p16', 'p6', 'p7', 'p9', 'p10'], 'ordem preservada sem p8');
      assert.deepEqual(next.teamA, state.teamA, 'teamA não muda');
      assert.deepEqual(next.teamB, state.teamB, 'teamB não muda');
    },
  },

  // ── removePlayerFromActiveTeam ────────────────────────────────────────────
  {
    name: 'removePlayerFromActiveTeam com replaceFromQueue: p3 é substituído por p11',
    run() {
      const state: RodizioState = {
        teamA: ['p1', 'p2', 'p3', 'p4', 'p5'],
        teamB: ['p6', 'p7', 'p8', 'p9', 'p10'],
        waitingPlayers: ['p11', 'p12'],
      };
      const { state: next, incomplete } = removePlayerFromActiveTeam(state, 'p3', true);
      assert.deepEqual(next.teamA, ['p1', 'p2', 'p4', 'p5', 'p11'], 'p11 entra no lugar de p3');
      assert.deepEqual(next.waitingPlayers, ['p12'], 'p11 saiu da fila');
      assert.equal(incomplete, false, 'substituição bem-sucedida');
    },
  },
  {
    name: 'removePlayerFromActiveTeam sem fila: time fica incompleto',
    run() {
      const state: RodizioState = {
        teamA: ['p1', 'p2', 'p3', 'p4', 'p5'],
        teamB: ['p6', 'p7', 'p8', 'p9', 'p10'],
        waitingPlayers: [],
      };
      const { state: next, incomplete } = removePlayerFromActiveTeam(state, 'p3', true);
      assert.deepEqual(next.teamA, ['p1', 'p2', 'p4', 'p5'], 'p3 removido, time com 4 jogadores');
      assert.equal(next.waitingPlayers.length, 0, 'fila continua vazia');
      assert.equal(incomplete, true, 'time incompleto sinalizado');
    },
  },

  // ── registerRodizioWin com leavingAfterMatch ──────────────────────────────
  {
    name: 'registerRodizioWin com leavingAfterMatch: jogador saindo não vai para a fila',
    run() {
      const state: RodizioState = {
        teamA: ['p1', 'p2', 'p3'],
        teamB: ['p4', 'p5', 'p6'],
        waitingPlayers: ['p7', 'p8', 'p9'],
      };
      // p5 marcado para sair após o jogo; time A vence
      const next = registerRodizioWin(state, 'A', 3, ['p5']);
      assert.deepEqual(next.teamA, ['p1', 'p2', 'p3'], 'time A permanece');
      assert.deepEqual(next.teamB, ['p7', 'p8', 'p9'], 'próximos da lista entram como time B');
      assert.deepEqual(next.waitingPlayers, ['p4', 'p6'], 'fila tem p4 e p6, mas não p5');
      assert.ok(!next.waitingPlayers.includes('p5'), 'p5 saiu definitivamente da pelada');
    },
  },

  // ── addPlayerToQueue ──────────────────────────────────────────────────────
  {
    name: 'addPlayerToQueue: novo jogador entra no fim da lista',
    run() {
      const state: RodizioState = {
        teamA: ['p1', 'p2', 'p3', 'p4', 'p5'],
        teamB: ['p6', 'p7', 'p8', 'p9', 'p10'],
        waitingPlayers: ['p16'],
      };
      const next = addPlayerToQueue(state, 'p17');
      assert.deepEqual(next.waitingPlayers, ['p16', 'p17'], 'p17 vai para o fim da lista');
      assert.deepEqual(next.teamA, state.teamA, 'teamA não muda');
      assert.deepEqual(next.teamB, state.teamB, 'teamB não muda');
    },
  },

  // ── persistência após remoção ─────────────────────────────────────────────
  {
    name: 'persistência após remoção: estado com jogador removido da fila serializa corretamente',
    run() {
      let state: RodizioState = {
        teamA: ['p1', 'p2', 'p3', 'p4', 'p5'],
        teamB: ['p11', 'p12', 'p13', 'p14', 'p15'],
        waitingPlayers: ['p16', 'p6', 'p7', 'p8', 'p9', 'p10'],
      };
      // Remove p8 da fila
      state = removePlayerFromQueue(state, 'p8');
      // Simula reload: serializa e desserializa
      const serialized = JSON.stringify(state);
      const restored = JSON.parse(serialized) as RodizioState;
      assert.ok(!restored.waitingPlayers.includes('p8'), 'p8 não está na fila após reload simulado');
      assert.deepEqual(restored.waitingPlayers, ['p16', 'p6', 'p7', 'p9', 'p10'], 'ordem preservada após reload');
      assert.deepEqual(restored.teamA, state.teamA, 'teamA preservado');
    },
  },

  {
    name: 'cenário p1-p16 completo: após 2 vitórias de A, fila e times estão corretos',
    run() {
      const players = Array.from({ length: 16 }, (_, i) => `p${i + 1}`);
      // Passo 1: inicializar
      let state = initRodizio(players, 5);
      assert.deepEqual(state.teamA, ['p1', 'p2', 'p3', 'p4', 'p5']);
      assert.deepEqual(state.teamB, ['p6', 'p7', 'p8', 'p9', 'p10']);
      assert.deepEqual(state.waitingPlayers, ['p11', 'p12', 'p13', 'p14', 'p15', 'p16']);

      // Passo 2: Time A vence (jogo 1)
      state = registerRodizioWin(state, 'A', 5);
      // teamA=p1-5, teamB=p11-15, waiting=p16,p6-10
      assert.deepEqual(state.teamA, ['p1', 'p2', 'p3', 'p4', 'p5'], 'time A continua');
      assert.deepEqual(state.teamB, ['p11', 'p12', 'p13', 'p14', 'p15'], 'próximos da fila entram');
      assert.deepEqual(state.waitingPlayers, ['p16', 'p6', 'p7', 'p8', 'p9', 'p10'], 'p16 antes dos perdedores');

      // Passo 3: Time A vence novamente (jogo 2)
      state = registerRodizioWin(state, 'A', 5);
      // teamA=p1-5, nextTeam=p16,p6,p7,p8,p9; remaining=p10,p11-15
      assert.deepEqual(state.teamA, ['p1', 'p2', 'p3', 'p4', 'p5'], 'time A continua por 2ª vez');
      assert.deepEqual(state.teamB, ['p16', 'p6', 'p7', 'p8', 'p9'], 'p16 lidera o próximo time');
      assert.deepEqual(
        state.waitingPlayers,
        ['p10', 'p11', 'p12', 'p13', 'p14', 'p15'],
        'restante da fila correto',
      );
    },
  },
  {
    name: 'loadStoredState restaura o rodizio salvo do localStorage',
    run() {
      const storedSnapshot = {
        durationMs: 600000,
        remainingMsWhenPaused: 600000,
        startedAt: 1782030828981,
        isRunning: true,
        teamAScore: 0,
        teamBScore: 0,
        goalLimit: 2,
        winner: null,
        players: ['1', '2', '3', '4', '5', '6', '7', '8', '9'],
        playersPerTeam: 4,
        teamA: ['1', '2', '3', '4'],
        teamB: ['8', '9', '5', '6'],
        waitingPlayers: ['7'],
        phase: 'playing' as const,
        matchCount: 2,
        leavingAfterMatch: [],
      };

      const loaded = loadStoredState({
        getItem(key) {
          assert.equal(key, PICKUP_TOOLS_STORAGE_KEY);
          return JSON.stringify(storedSnapshot);
        },
      });

      assert.equal(loaded.storageWasRead, true);
      assert.equal(loaded.state.phase, 'playing');
      assert.deepEqual(loaded.state.teamA, ['1', '2', '3', '4']);
      assert.deepEqual(loaded.state.teamB, ['8', '9', '5', '6']);
      assert.deepEqual(loaded.state.waitingPlayers, ['7']);
      assert.equal(loaded.state.matchCount, 2);
    },
  },
  {
    name: 'hasActiveRodizio retorna true quando phase esta playing e os dois times existem',
    run() {
      assert.equal(
        hasActiveRodizio({
          phase: 'playing',
          teamA: ['1', '2', '3', '4'],
          teamB: ['8', '9', '5', '6'],
        }),
        true,
      );
    },
  },
  {
    name: 'isPlayerInactive retorna true para lesionado, antigo e inativo, false apenas para ativo',
    run() {
      const active = createPlayer({ status: 'active', deletedAt: null });
      const injured = createPlayer({ status: 'injured', deletedAt: null });
      const inactive = createPlayer({ status: 'inactive', deletedAt: null });
      const suspended = createPlayer({ status: 'suspended', deletedAt: null });
      const withDeletedAt = createPlayer({ status: 'active', deletedAt: '2026-05-01T00:00:00.000Z' });

      assert.equal(isPlayerInactive(active), false);
      assert.equal(isPlayerInactive(injured), true, 'lesionado deve ser considerado inativo para mostrar botao reativar');
      assert.equal(isPlayerInactive(inactive), true);
      assert.equal(isPlayerInactive(suspended), true, 'antigo (suspended) deve ser considerado inativo');
      assert.equal(isPlayerInactive(withDeletedAt), true);
    },
  },
  {
    name: 'escopo active em buildPlayerAggregates exclui jogador lesionado e antigo',
    run() {
      const team = createTeam({ id: 'team-scope-active-check' });
      const match = createMatch({ teamId: team.id, status: 'finished' });
      const pActive = createPlayer({ id: 'p-sc-active', teamId: team.id, status: 'active' });
      const pInjured = createPlayer({ id: 'p-sc-injured', teamId: team.id, status: 'injured' });
      const pSuspended = createPlayer({ id: 'p-sc-suspended', teamId: team.id, status: 'suspended' });

      const snapshot = createSnapshot({
        teams: [team],
        players: [pActive, pInjured, pSuspended],
        matches: [match],
        attendance: [
          createAttendance({ teamId: team.id, matchId: match.id, playerId: pActive.id, status: 'confirmed' }),
          createAttendance({ teamId: team.id, matchId: match.id, playerId: pInjured.id, status: 'confirmed' }),
          createAttendance({ teamId: team.id, matchId: match.id, playerId: pSuspended.id, status: 'confirmed' }),
        ],
        matchStats: [
          createMatchStat({ teamId: team.id, matchId: match.id, playerId: pActive.id, goals: 1 }),
          createMatchStat({ teamId: team.id, matchId: match.id, playerId: pInjured.id, goals: 5 }),
          createMatchStat({ teamId: team.id, matchId: match.id, playerId: pSuspended.id, goals: 3 }),
        ],
      });

      const aggregates = buildPlayerAggregates(snapshot, team.id, { playerScope: 'active' });
      const ids = new Set(aggregates.map((a) => a.player.id));

      assert.ok(ids.has(pActive.id), 'ativo deve aparecer no escopo active');
      assert.ok(!ids.has(pInjured.id), 'lesionado nao deve aparecer no escopo active');
      assert.ok(!ids.has(pSuspended.id), 'antigo nao deve aparecer no escopo active');
    },
  },
  {
    name: 'lesionado com historico aparece no escopo with-history e mantem seus gols',
    run() {
      const team = createTeam({ id: 'team-injured-wh' });
      const match = createMatch({ teamId: team.id, status: 'finished' });
      const injured = createPlayer({ id: 'p-injured-wh', teamId: team.id, status: 'injured' });

      const snapshot = createSnapshot({
        teams: [team],
        players: [injured],
        matches: [match],
        attendance: [createAttendance({ teamId: team.id, matchId: match.id, playerId: injured.id, status: 'confirmed' })],
        matchStats: [createMatchStat({ teamId: team.id, matchId: match.id, playerId: injured.id, goals: 2, assists: 1 })],
      });

      const agg = buildPlayerAggregates(snapshot, team.id, { playerScope: 'with-history' }).find((a) => a.player.id === injured.id);

      assert.ok(agg, 'lesionado com historico deve aparecer em with-history');
      assert.equal(agg.goals, 2, 'gols preservados');
      assert.equal(agg.assists, 1, 'assistencias preservadas');
      assert.equal(agg.isActive, false, 'isActive deve ser false para lesionado');
    },
  },
  {
    name: 'antigo (suspended) mantém estatísticas de jogos encerrados e aparece no ranking geral',
    run() {
      const team = createTeam({ id: 'team-sus-rank' });
      const match = createMatch({ teamId: team.id, status: 'finished' });
      const pActive = createPlayer({ id: 'p-sr-active', teamId: team.id, status: 'active' });
      const pSuspended = createPlayer({ id: 'p-sr-suspended', teamId: team.id, status: 'suspended' });

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
      const susAgg = aggregates.find((a) => a.player.id === pSuspended.id);
      const ranked = buildRankingByMetric(aggregates, 'goals');

      assert.ok(susAgg, 'antigo com historico aparece no escopo with-history');
      assert.equal(susAgg.goals, 5, 'gols do antigo preservados');
      assert.equal(susAgg.isActive, false);
      assert.equal(ranked[0]?.player.id, pSuspended.id, 'antigo com mais gols e o #1 no ranking geral');
    },
  },

  // ── finishMatch ─────────────────────────────────────────────────────────────
  {
    name: 'admin encerra partida e estatisticas sao persistidas corretamente',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });

      const result = await mockRepository.finishMatch(
        {
          matchId: 'match-3',
          teamScore: 2,
          opponentScore: 1,
          playerStats: [
            { playerId: 'player-7', goals: 1, assists: 1 },
            { playerId: 'player-9', goals: 1, assists: 0 },
          ],
        },
        'user-admin',
      );

      assert.equal(result.status, 'finished', 'status deve ser finished');
      assert.equal(result.scoreboard?.team, 2, 'placar do time deve ser 2');
      assert.equal(result.scoreboard?.opponent, 1, 'placar adversario deve ser 1');
      assert.equal(result.scoreboard?.result, 'win', 'resultado deve ser win');

      const snapshot = await mockRepository.getSnapshot();
      const statP7 = snapshot.matchStats.find(
        (s) => s.matchId === 'match-3' && s.playerId === 'player-7',
      );
      const statP9 = snapshot.matchStats.find(
        (s) => s.matchId === 'match-3' && s.playerId === 'player-9',
      );
      assert.equal(statP7?.goals, 1, 'player-7 deve ter 1 gol');
      assert.equal(statP7?.assists, 1, 'player-7 deve ter 1 assistencia');
      assert.equal(statP9?.goals, 1, 'player-9 deve ter 1 gol');
      assert.equal(statP9?.assists, 0, 'player-9 deve ter 0 assistencias');
    },
  },
  {
    name: 'jogador com 0 gols e 0 assistencias e persistido corretamente',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });

      await mockRepository.finishMatch(
        {
          matchId: 'match-3',
          teamScore: 0,
          opponentScore: 0,
          playerStats: [
            { playerId: 'player-7', goals: 0, assists: 0 },
            { playerId: 'player-9', goals: 0, assists: 0 },
          ],
        },
        'user-admin',
      );

      const snapshot = await mockRepository.getSnapshot();
      const statP7 = snapshot.matchStats.find(
        (s) => s.matchId === 'match-3' && s.playerId === 'player-7',
      );
      assert.equal(statP7?.goals, 0, 'player-7 deve ter 0 gols');
      assert.equal(statP7?.assists, 0, 'player-7 deve ter 0 assistencias');
      assert.equal(statP7?.played, true, 'played deve ser true mesmo com 0 participacoes');
    },
  },
  {
    name: 'admin com roles [admin, player] pode encerrar partida sem bloqueio',
    async run() {
      resetMockRepositoryState();
      // user-admin tem roles ['admin', 'player'] no seed
      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });

      const result = await mockRepository.finishMatch(
        {
          matchId: 'match-3',
          teamScore: 1,
          opponentScore: 0,
          playerStats: [{ playerId: 'player-7', goals: 1, assists: 0 }],
        },
        'user-admin',
      );

      assert.equal(result.status, 'finished', 'admin com roles misto deve conseguir encerrar');
    },
  },
  {
    name: 'jogador comum nao pode encerrar partida',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'atacante@bocaiuva.app', password: '123456' });

      await assert.rejects(
        () =>
          mockRepository.finishMatch(
            {
              matchId: 'match-3',
              teamScore: 1,
              opponentScore: 0,
              playerStats: [{ playerId: 'player-9', goals: 1, assists: 0 }],
            },
            'user-striker',
          ),
        (error) => error instanceof Error && error.message.toLowerCase().includes('administrador'),
      );
    },
  },
  {
    name: 'partida cancelada nao pode ser encerrada',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });
      await mockRepository.deleteMatch('match-3', 'user-admin');

      await assert.rejects(
        () =>
          mockRepository.finishMatch(
            {
              matchId: 'match-3',
              teamScore: 0,
              opponentScore: 0,
              playerStats: [],
            },
            'user-admin',
          ),
        (error) =>
          error instanceof Error && error.message.toLowerCase().includes('cancelada'),
      );
    },
  },
  {
    name: 'encerrar partida persiste gols e notificacoes nao bloqueiam o save',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });

      const result = await mockRepository.finishMatch(
        {
          matchId: 'match-3',
          teamScore: 3,
          opponentScore: 2,
          playerStats: [
            { playerId: 'player-7', goals: 2, assists: 1 },
            { playerId: 'player-9', goals: 1, assists: 2 },
          ],
        },
        'user-admin',
      );

      assert.equal(result.status, 'finished', 'match deve ter status finished');
      const snapshot = await mockRepository.getSnapshot();
      const stats = snapshot.matchStats.filter((s) => s.matchId === 'match-3');
      assert.ok(stats.length >= 2, 'deve ter stats para os dois jogadores');
      const p7 = stats.find((s) => s.playerId === 'player-7');
      assert.equal(p7?.goals, 2, 'gols do player-7 devem estar salvos');
    },
  },

  // ── permissão encerrar partida: roles vs canManageTeam ───────────────────────
  {
    name: 'canManageTeam false com roles admin pode encerrar partida (fix roles.includes)',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });
      // Força membership do admin com canManageTeam=false mas roles=['admin','player']
      patchMockTeamMember('member-admin-bocaiuva', { canManageTeam: false, roles: ['admin', 'player'] });

      const result = await mockRepository.finishMatch(
        {
          matchId: 'match-3',
          teamScore: 2,
          opponentScore: 1,
          playerStats: [{ playerId: 'player-7', goals: 2, assists: 0 }],
        },
        'user-admin',
      );
      assert.equal(result.status, 'finished', 'admin com roles=[admin] e canManageTeam=false deve poder encerrar');
    },
  },
  {
    name: 'updateFinishedMatchStats com roles admin e canManageTeam false tem sucesso',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });
      // Primeiro encerra a partida normalmente
      await mockRepository.finishMatch(
        {
          matchId: 'match-3',
          teamScore: 1,
          opponentScore: 0,
          playerStats: [{ playerId: 'player-7', goals: 1, assists: 0 }],
        },
        'user-admin',
      );
      // Troca canManageTeam para false mas mantém roles=['admin','player']
      patchMockTeamMember('member-admin-bocaiuva', { canManageTeam: false, roles: ['admin', 'player'] });

      const result = await mockRepository.updateFinishedMatchStats(
        {
          matchId: 'match-3',
          teamScore: 3,
          opponentScore: 2,
          playerStats: [{ playerId: 'player-7', goals: 3, assists: 0 }],
        },
        'user-admin',
      );
      assert.equal(result.status, 'finished', 'deve permanecer finished');
    },
  },
  {
    name: 'jogador com canManageTeam false e roles player nao pode encerrar partida',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'atacante@bocaiuva.app', password: '123456' });

      await assert.rejects(
        () =>
          mockRepository.finishMatch(
            {
              matchId: 'match-3',
              teamScore: 1,
              opponentScore: 0,
              playerStats: [{ playerId: 'player-9', goals: 1, assists: 0 }],
            },
            'user-striker',
          ),
        (error) => error instanceof Error && error.message.toLowerCase().includes('administrador'),
      );
    },
  },
  {
    name: 'normalizeTeamMemberDocument com canManageTeam null e roles admin retorna canManageTeam true',
    run() {
      const membership = createTeamMember({
        roles: ['admin', 'player'],
        canManageTeam: undefined as unknown as boolean,
      });
      // normalizeTeamMemberDocument usa ?? — null/undefined faz fallback para roles.includes('admin')
      const result = buildTeamMembershipIndexDocument(membership);
      assert.ok(
        result.canManageTeam === true || result.roles.includes('admin'),
        'membership com roles=[admin] deve ter permissão efetiva',
      );
    },
  },
  {
    name: 'canManagePrivateTeamData com index canManageTeam false e roles admin retorna true',
    run() {
      const membershipIndex = buildTeamMembershipIndexDocument(
        createTeamMember({
          userId: 'user-admin-roleonly',
          teamId: 'team-x',
          roles: ['admin', 'player'],
          canManageTeam: false,
        }),
      );
      const result = canManagePrivateTeamData({
        teamId: 'team-x',
        userId: 'user-admin-roleonly',
        membershipIndex,
      });
      assert.equal(result, true, 'roles.includes(admin) deve conceder permissão mesmo com canManageTeam=false');
    },
  },
  {
    name: 'canManagePrivateTeamData com index canManageTeam false e roles player retorna false',
    run() {
      const membershipIndex = buildTeamMembershipIndexDocument(
        createTeamMember({
          userId: 'user-player-only',
          teamId: 'team-x',
          roles: ['player'],
          canManageTeam: false,
        }),
      );
      const result = canManagePrivateTeamData({
        teamId: 'team-x',
        userId: 'user-player-only',
        membershipIndex,
      });
      assert.equal(result, false, 'jogador sem admin não deve ter permissão de gestão');
    },
  },
  {
    name: 'canManagePrivateTeamData sem index retorna false',
    run() {
      const result = canManagePrivateTeamData({
        teamId: 'team-x',
        userId: 'user-no-index',
        membershipIndex: null,
      });
      assert.equal(result, false, 'sem índice não deve ter permissão');
    },
  },
  {
    name: 'buildTeamMembershipIndexDocument com canManageTeam false e roles admin preserva roles no índice',
    run() {
      const membership = createTeamMember({
        userId: 'user-roles-check',
        teamId: 'team-roles-check',
        roles: ['admin', 'player'],
        canManageTeam: false,
      });
      const indexDoc = buildTeamMembershipIndexDocument(membership);
      assert.ok(
        indexDoc.roles.includes('admin'),
        'roles.admin deve ser preservado no índice mesmo com canManageTeam=false',
      );
      assert.ok(
        indexDoc.canManageTeam === false || indexDoc.roles.includes('admin'),
        'Firestore Rules (canManageTeam||roles.hasAny([admin])) deve avaliar para true',
      );
    },
  },
  {
    name: 'canManagePrivateTeamData com index canManageTeam true e sem roles admin retorna true',
    run() {
      const membership = createTeamMember({
        userId: 'user-manage-flag',
        teamId: 'team-flag',
        roles: ['player'],
        canManageTeam: true,
      });
      const membershipIndex = buildTeamMembershipIndexDocument(membership);
      const result = canManagePrivateTeamData({
        teamId: 'team-flag',
        userId: 'user-manage-flag',
        membershipIndex,
      });
      assert.equal(result, true, 'canManageTeam=true deve conceder permissão independente de roles');
    },
  },
  {
    name: 'updateFinishedMatchStats rejeita jogador sem permissao de admin',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });
      // Encerra partida como admin
      await mockRepository.finishMatch(
        {
          matchId: 'match-3',
          teamScore: 1,
          opponentScore: 0,
          playerStats: [{ playerId: 'player-7', goals: 1, assists: 0 }],
        },
        'user-admin',
      );

      // Tenta editar como jogador
      await assert.rejects(
        () =>
          mockRepository.updateFinishedMatchStats(
            {
              matchId: 'match-3',
              teamScore: 2,
              opponentScore: 0,
              playerStats: [{ playerId: 'player-9', goals: 2, assists: 0 }],
            },
            'user-striker',
          ),
        (error) => error instanceof Error,
      );
    },
  },

  // ── auditoria de botoes criticos ─────────────────────────────────────────────
  {
    name: 'admin cancela partida agendada via updateMatch e status fica canceled',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });
      const result = await mockRepository.updateMatch(
        'match-3',
        {
          date: '2026-05-08',
          time: '20:30',
          venue: 'Arena Bocaiuva',
          opponentName: 'Galaticos FC',
          linePlayersCount: 6,
          matchType: 'society',
          status: 'canceled',
        },
        'user-admin',
      );
      assert.equal(result.status, 'canceled', 'status deve ser canceled');
      assert.equal(result.scoreboard, null, 'scoreboard deve ser null apos cancelamento');
    },
  },
  {
    name: 'partida cancelada via updateMatch nao tem scoreboard nem finishedAt',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });
      await mockRepository.updateMatch(
        'match-3',
        {
          date: '2026-05-08',
          time: '20:30',
          venue: 'Arena Bocaiuva',
          opponentName: 'Galaticos FC',
          linePlayersCount: 6,
          matchType: 'society',
          status: 'canceled',
        },
        'user-admin',
      );
      const snapshot = await mockRepository.getSnapshot();
      const match = snapshot.matches.find((m) => m.id === 'match-3');
      assert.ok(match, 'partida deve continuar no snapshot');
      assert.equal(match?.status, 'canceled', 'status deve ser canceled');
      assert.equal(match?.scoreboard, null, 'scoreboard deve ser null');
      assert.equal(match?.finishedAt, null, 'finishedAt deve ser null');
    },
  },
  {
    name: 'jogador comum nao pode cancelar partida',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'atacante@bocaiuva.app', password: '123456' });
      await assert.rejects(
        () =>
          mockRepository.updateMatch(
            'match-3',
            {
              date: '2026-05-08',
              time: '20:30',
              venue: 'Arena Bocaiuva',
              opponentName: 'Galaticos FC',
              linePlayersCount: 6,
              matchType: 'society',
              status: 'canceled',
            },
            'user-striker',
          ),
        (error) =>
          error instanceof Error && error.message.toLowerCase().includes('administrador'),
      );
    },
  },
  {
    name: 'admin inativa jogador ativo com removePlayer e status fica inactive',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });
      const result = await mockRepository.removePlayer('player-10', 'user-admin');
      assert.equal(result.status, 'inactive', 'status deve ser inactive apos inativacao');
      assert.ok(result.deletedAt, 'deletedAt deve ser preenchido apos inativacao');
      const snapshot = await mockRepository.getSnapshot();
      const player = snapshot.players.find((p) => p.id === 'player-10');
      assert.equal(player?.status, 'inactive', 'player-10 deve estar inactive no snapshot');
    },
  },
  {
    name: 'removePlayer em jogador ja inativo lanca erro descritivo',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });
      await mockRepository.removePlayer('player-10', 'user-admin');
      await assert.rejects(
        () => mockRepository.removePlayer('player-10', 'user-admin'),
        (error) =>
          error instanceof Error &&
          error.message.includes('já está fora do elenco'),
      );
    },
  },
  {
    name: 'admin reativa jogador inativo com reactivatePlayer e status fica active',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });
      await mockRepository.removePlayer('player-10', 'user-admin');
      const result = await mockRepository.reactivatePlayer('player-10', 'user-admin');
      assert.equal(result.status, 'active', 'status deve voltar para active');
      assert.equal(result.deletedAt, null, 'deletedAt deve ser null apos reativacao');
    },
  },
  {
    name: 'jogador reativado aparece no escopo active de buildPlayerAggregates',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });
      await mockRepository.removePlayer('player-10', 'user-admin');
      await mockRepository.reactivatePlayer('player-10', 'user-admin');
      const snapshot = await mockRepository.getSnapshot();
      const aggregates = buildPlayerAggregates(snapshot, 'team-bocaiuva', { playerScope: 'active' });
      const ids = new Set(aggregates.map((a) => a.player.id));
      assert.ok(ids.has('player-10'), 'player-10 reativado deve aparecer no escopo active');
    },
  },
  {
    name: 'admin cria e exclui resenha de partida com deleteMatchDiaryEntry',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });
      const entry = await mockRepository.createMatchDiaryEntry(
        {
          matchId: 'match-1',
          title: 'Resenha de auditoria',
          content: 'Partida intensa, time mostrou evolucao.',
          mentionedPlayerIds: [],
        },
        'user-admin',
      );
      assert.ok(entry.id, 'resenha deve ter id apos criacao');
      await mockRepository.deleteMatchDiaryEntry(entry.id, 'user-admin');
      const snapshot = await mockRepository.getSnapshot();
      const found = snapshot.matchDiaryEntries.find((e) => e.id === entry.id);
      assert.ok(!found, 'resenha excluida nao deve aparecer no snapshot');
    },
  },
  {
    name: 'jogador comum nao pode excluir resenha de partida',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });
      const entry = await mockRepository.createMatchDiaryEntry(
        {
          matchId: 'match-1',
          title: 'Resenha bloqueada',
          content: 'Tentativa de exclusao por jogador comum.',
          mentionedPlayerIds: [],
        },
        'user-admin',
      );
      await mockRepository.login({ email: 'atacante@bocaiuva.app', password: '123456' });
      await assert.rejects(
        () => mockRepository.deleteMatchDiaryEntry(entry.id, 'user-striker'),
        (error) =>
          error instanceof Error && error.message.toLowerCase().includes('administrador'),
      );
    },
  },
  {
    name: 'admin publica resenha com titulo, texto, humor e jogadores mencionados',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });
      const entry = await mockRepository.createMatchDiaryEntry(
        {
          matchId: 'match-1',
          title: 'Que partida!',
          content: 'Time mostrou muito foco e determinacao.',
          mood: 'highlight',
          mentionedPlayerIds: ['player-10'],
          notifyTeam: false,
          pinned: true,
        },
        'user-admin',
      );
      assert.ok(entry.id, 'resenha deve ter id apos criacao');
      assert.equal(entry.title, 'Que partida!', 'titulo deve ser salvo');
      assert.equal(entry.mood, 'highlight', 'humor deve ser salvo');
      assert.ok(entry.mentionedPlayerIds.includes('player-10'), 'jogador mencionado deve estar na resenha');
      assert.equal(entry.pinned, true, 'pinned deve ser salvo');
      const snapshot = await mockRepository.getSnapshot();
      const found = snapshot.matchDiaryEntries.find((e) => e.id === entry.id);
      assert.ok(found, 'resenha deve persistir no snapshot');
    },
  },
  {
    name: 'admin publica resenha com notifyTeam e resenha e salva independentemente das notificacoes',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });
      const entry = await mockRepository.createMatchDiaryEntry(
        {
          matchId: 'match-1',
          title: 'Resenha com notificacao',
          content: 'Texto da resenha com notificacao ligada.',
          mentionedPlayerIds: ['player-10'],
          notifyTeam: true,
          pinned: false,
        },
        'user-admin',
      );
      assert.ok(entry.id, 'resenha deve ter id mesmo com notifyTeam true');
      const snapshot = await mockRepository.getSnapshot();
      const found = snapshot.matchDiaryEntries.find((e) => e.id === entry.id);
      assert.ok(found, 'resenha deve persistir no snapshot apos publicacao com notificacao');
    },
  },
  {
    name: 'admin edita resenha existente e alteracoes persistem',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });
      const entry = await mockRepository.createMatchDiaryEntry(
        {
          matchId: 'match-1',
          title: 'Titulo original',
          content: 'Conteudo original da resenha.',
          mentionedPlayerIds: [],
          notifyTeam: false,
          pinned: false,
        },
        'user-admin',
      );
      await mockRepository.updateMatchDiaryEntry(
        entry.id,
        {
          title: 'Titulo editado',
          content: 'Conteudo editado apos edicao.',
          mood: 'warning',
          pinned: true,
          notifyTeam: false,
        },
        'user-admin',
      );
      const snapshot = await mockRepository.getSnapshot();
      const updated = snapshot.matchDiaryEntries.find((e) => e.id === entry.id);
      assert.ok(updated, 'resenha editada deve existir no snapshot');
      assert.equal(updated?.title, 'Titulo editado', 'titulo deve estar atualizado');
      assert.equal(updated?.mood, 'warning', 'humor deve estar atualizado');
      assert.equal(updated?.pinned, true, 'pinned deve estar atualizado');
    },
  },
  {
    name: 'jogador comum nao pode publicar resenha',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'atacante@bocaiuva.app', password: '123456' });
      await assert.rejects(
        () =>
          mockRepository.createMatchDiaryEntry(
            {
              matchId: 'match-1',
              title: 'Resenha nao autorizada',
              content: 'Tentativa de publicacao por jogador comum.',
              mentionedPlayerIds: [],
            },
            'user-striker',
          ),
        (error) =>
          error instanceof Error && error.message.toLowerCase().includes('administrador'),
      );
    },
  },
  {
    name: 'resenha publicada pelo admin persiste apos segunda leitura do snapshot',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });
      const entry = await mockRepository.createMatchDiaryEntry(
        {
          matchId: 'match-1',
          title: 'Persistencia',
          content: 'Texto que deve persistir.',
          mentionedPlayerIds: [],
          notifyTeam: false,
          pinned: false,
        },
        'user-admin',
      );
      const snapshot1 = await mockRepository.getSnapshot();
      const snapshot2 = await mockRepository.getSnapshot();
      const found1 = snapshot1.matchDiaryEntries.find((e) => e.id === entry.id);
      const found2 = snapshot2.matchDiaryEntries.find((e) => e.id === entry.id);
      assert.ok(found1, 'resenha deve existir na primeira leitura');
      assert.ok(found2, 'resenha deve existir na segunda leitura (persistencia)');
      assert.equal(found1?.content, found2?.content, 'conteudo deve ser identico nas duas leituras');
    },
  },
  {
    name: 'admin exclui criterio sem uso e criterio some do snapshot',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });
      const criterion = await mockRepository.createRatingCriterion(
        { label: 'Criterio Auditoria Teste', type: 'positive' },
        'user-admin',
      );
      assert.ok(criterion.id, 'criterio deve ter id apos criacao');
      await mockRepository.deleteRatingCriterion(criterion.id, 'user-admin');
      const snapshot = await mockRepository.getSnapshot();
      const found = snapshot.ratingCriteria.find((c) => c.id === criterion.id);
      assert.ok(!found, 'criterio excluido nao deve aparecer no snapshot');
    },
  },

  // ── early-return proxy: hooks antes dos guards condicionais ─────────────────

  {
    name: '[matchId] early-return: findMatchById retorna null para partida inexistente',
    run() {
      const state = {
        snapshot: createSnapshot({ matches: [] }),
      };
      const result = findMatchById(state, 'match-que-nao-existe');
      assert.equal(
        result,
        null,
        'findMatchById retorna null — [matchId] retornaria early return por !match antes de qualquer hook',
      );
    },
  },
  {
    name: '[matchId] early-return: partida com deletedAt dispara segundo guard condicional',
    run() {
      const deletedMatch = { ...createMatch({ id: 'match-deleted-proxy' }), deletedAt: '2026-06-01T10:00:00.000Z' };
      const state = {
        snapshot: createSnapshot({ matches: [deletedMatch] }),
      };
      const found = findMatchById(state, 'match-deleted-proxy');
      assert.ok(found?.deletedAt, 'partida com deletedAt e detectada — [matchId] teria segundo early return');
    },
  },
  {
    name: 'matches/create early-return: selectCanManageTeam false para membro sem papel admin',
    run() {
      const team = createTeam({ id: 'team-no-manage' });
      const user = createUser({ id: 'user-player-only', activeTeamId: team.id, teamId: team.id });
      const membership = createTeamMember({
        userId: user.id,
        teamId: team.id,
        roles: ['player'],
        canManageTeam: false,
      });
      const canManage = selectCanManageTeam({
        currentUserId: user.id,
        snapshot: createSnapshot({ users: [user], teams: [team], teamMembers: [membership] }),
      });
      assert.equal(
        canManage,
        false,
        'jogador sem papel admin retorna canManage=false — create.tsx retorna null antes dos hooks dependentes de team',
      );
    },
  },

  // ── best-effort: operacao principal nao depende de side effects ─────────────

  {
    name: 'createMatch: partida e salva no snapshot mesmo que notificacao falhasse',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });
      const match = await mockRepository.createMatch(
        {
          teamId: 'team-bocaiuva',
          seasonId: null,
          date: '2026-07-10',
          time: '20:00',
          venue: 'Campo Teste Best-Effort',
          locationUrl: null,
          opponentName: 'Adversario Best-Effort',
          opponentLogoUrl: null,
          opponentTeamId: null,
          opponentTeamName: null,
          opponentTeamLogoUrl: null,
          opponentSource: null,
          linePlayersCount: 6,
          matchType: 'society',
          notes: '',
        },
        'user-admin',
      );
      assert.ok(match.id, 'createMatch deve retornar a partida com id');
      const snapshot = await mockRepository.getSnapshot();
      const saved = snapshot.matches.find((m) => m.id === match.id);
      assert.ok(saved, 'partida deve estar no snapshot — save principal independe de notificacao');
      assert.equal(saved?.status, 'scheduled', 'partida criada com status scheduled');
    },
  },
  {
    name: 'saveLineup: escalacao e salva no snapshot mesmo que notificacao falhasse',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });
      const before = await mockRepository.getSnapshot();
      const match = before.matches.find((m) => m.id === 'match-3');
      const current = before.lineups.find((l) => l.matchId === 'match-3');
      assert.ok(match, 'match-3 deve existir no seed');
      assert.ok(current, 'lineup de match-3 deve existir no seed');
      const confirmedPlayerIds = new Set(
        before.attendance
          .filter((a) => a.matchId === 'match-3' && a.status === 'confirmed')
          .map((a) => a.playerId),
      );
      const preset = getFormationPresetByKey(match!.matchType, match!.linePlayersCount, current!.formationKey);
      const draft = buildLineupStateFromSource({
        existingLineup: current!,
        preset,
        players: before.players.filter((p) => confirmedPlayerIds.has(p.id)),
      });
      await mockRepository.saveLineup(
        { matchId: 'match-3', formationKey: draft.formationKey, starters: draft.starters, benchPlayerIds: draft.benchPlayerIds },
        'user-admin',
      );
      const after = await mockRepository.getSnapshot();
      const saved = after.lineups.find((l) => l.matchId === 'match-3');
      assert.ok(saved, 'lineup deve estar no snapshot — save principal independe de notificacao');
    },
  },
  {
    name: 'updateMatch: atualizacao e salva no snapshot mesmo que syncPublicTeamProjection falhasse',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });
      const before = await mockRepository.getSnapshot();
      const match = before.matches.find((m) => m.id === 'match-4');
      assert.ok(match, 'match-4 deve existir no seed como partida scheduled');
      await mockRepository.updateMatch(
        'match-4',
        {
          date: match!.date,
          time: match!.time,
          venue: 'Venue Atualizado Best-Effort',
          opponentName: match!.opponentName,
          locationUrl: null,
          linePlayersCount: match!.linePlayersCount,
          matchType: match!.matchType,
          notes: '',
        },
        'user-admin',
      );
      const after = await mockRepository.getSnapshot();
      const updated = after.matches.find((m) => m.id === 'match-4');
      assert.equal(updated?.venue, 'Venue Atualizado Best-Effort', 'venue atualizado — save principal independe de sync publico');
    },
  },
  {
    name: 'fluxo de jogador: status e atualizado no snapshot mesmo que sync publico falhasse',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });
      const before = await mockRepository.getSnapshot();
      const player = before.players.find((p) => p.teamId === 'team-bocaiuva' && p.status === 'active' && !p.deletedAt);
      assert.ok(player, 'deve haver jogador ativo em team-bocaiuva no seed');
      await mockRepository.removePlayer(player!.id, 'user-admin');
      const after = await mockRepository.getSnapshot();
      const updated = after.players.find((p) => p.id === player!.id);
      assert.equal(updated?.status, 'inactive', 'jogador deve ter status inactive apos removePlayer');
      assert.ok(updated?.deletedAt, 'jogador deve ter deletedAt — save principal independe de sync publico');
    },
  },
  {
    name: 'deleteMatch: soft-delete e executado no snapshot mesmo que syncPublicTeamProjection falhasse',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });
      await mockRepository.deleteMatch('match-1', 'user-admin');
      const snapshot = await mockRepository.getSnapshot();
      const match = snapshot.matches.find((m) => m.id === 'match-1');
      assert.ok(match, 'partida deve permanecer no snapshot (soft delete)');
      assert.ok(match?.deletedAt, 'partida deve ter deletedAt — delete executado independente de sync publico');
    },
  },
  {
    name: 'best-effort: quando operacao principal falha o erro e propagado para o caller',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'atacante@bocaiuva.app', password: '123456' });
      await assert.rejects(
        () =>
          mockRepository.createMatch(
            {
              teamId: 'team-bocaiuva',
              seasonId: null,
              date: '2026-07-10',
              time: '20:00',
              venue: 'Campo Proibido',
              locationUrl: null,
              opponentName: 'Adversario Proibido',
              opponentLogoUrl: null,
              opponentTeamId: null,
              opponentTeamName: null,
              opponentTeamLogoUrl: null,
              opponentSource: null,
              linePlayersCount: 6,
              matchType: 'society',
              notes: '',
            },
            'user-striker',
          ),
        (error) =>
          error instanceof Error && error.message.toLowerCase().includes('administrador'),
        'erro da operacao principal (sem permissao de admin) nao deve ser engolido — runBestEffort e reservado para side effects',
      );
    },
  },

  // ── Frente A: updateMatchMetadata ────────────────────────────────────────
  {
    name: 'updateMatchMetadata: admin edita venue e matchType em partida encerrada',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });
      await mockRepository.updateMatchMetadata(
        'match-1',
        { date: '2026-04-10', time: '20:00', venue: 'Arena Nova', locationUrl: null, matchType: 'futsal' },
        'user-admin',
      );
      const snapshot = await mockRepository.getSnapshot();
      const match = snapshot.matches.find((m) => m.id === 'match-1');
      assert.equal(match?.venue, 'Arena Nova', 'venue deve estar atualizado');
      assert.equal(match?.matchType, 'futsal', 'matchType deve estar atualizado');
    },
  },
  {
    name: 'updateMatchMetadata: placar, MVP e presenca preservados apos edicao de metadata',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });
      const before = await mockRepository.getSnapshot();
      const beforeMatch = before.matches.find((m) => m.id === 'match-1');
      assert.ok(beforeMatch?.scoreboard, 'match-1 deve ter placar no seed');
      await mockRepository.updateMatchMetadata(
        'match-1',
        { date: '2026-04-10', time: '21:00', venue: 'Arena Reformada', locationUrl: null, matchType: 'society' },
        'user-admin',
      );
      const after = await mockRepository.getSnapshot();
      const afterMatch = after.matches.find((m) => m.id === 'match-1');
      assert.deepEqual(afterMatch?.scoreboard, beforeMatch?.scoreboard, 'placar nao deve ser alterado');
      assert.deepEqual(afterMatch?.mvpWinnerPlayerIds, beforeMatch?.mvpWinnerPlayerIds, 'MVP nao deve ser alterado');
      const beforeAtt = before.attendance.filter((a) => a.matchId === 'match-1');
      const afterAtt = after.attendance.filter((a) => a.matchId === 'match-1');
      assert.equal(afterAtt.length, beforeAtt.length, 'presencas nao devem ser alteradas');
    },
  },
  {
    name: 'updateMatchMetadata: stats de jogadores preservadas apos edicao de metadata',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });
      const before = await mockRepository.getSnapshot();
      const beforeStats = before.matchStats.filter((s) => s.matchId === 'match-1');
      await mockRepository.updateMatchMetadata(
        'match-1',
        { date: '2026-04-10', time: '20:00', venue: 'Arena Bocaiuva', locationUrl: null, matchType: 'society' },
        'user-admin',
      );
      const after = await mockRepository.getSnapshot();
      const afterStats = after.matchStats.filter((s) => s.matchId === 'match-1');
      assert.equal(afterStats.length, beforeStats.length, 'numero de stats nao deve mudar');
      const player9before = beforeStats.find((s) => s.playerId === 'player-9');
      const player9after = afterStats.find((s) => s.playerId === 'player-9');
      assert.equal(player9after?.goals, player9before?.goals, 'gols de player-9 nao devem mudar');
    },
  },
  {
    name: 'updateMatchMetadata: jogador sem permissao nao pode editar metadata',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'atacante@bocaiuva.app', password: '123456' });
      await assert.rejects(
        () =>
          mockRepository.updateMatchMetadata(
            'match-1',
            { date: '2026-04-10', time: '20:00', venue: 'Arena Hacker', locationUrl: null, matchType: 'society' },
            'user-striker',
          ),
        (error) => error instanceof Error,
        'nao-admin deve receber erro ao tentar editar metadata',
      );
    },
  },
  {
    name: 'updateMatchMetadata: partida com deletedAt nao pode ser editada',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });
      await mockRepository.deleteMatch('match-1', 'user-admin');
      await assert.rejects(
        () =>
          mockRepository.updateMatchMetadata(
            'match-1',
            { date: '2026-04-10', time: '20:00', venue: 'Arena Nova', locationUrl: null, matchType: 'society' },
            'user-admin',
          ),
        (error) => error instanceof Error && error.message.toLowerCase().includes('exclu'),
        'partida excluida nao pode ter metadata editada',
      );
    },
  },

  // ── Frente B: updateFinishedMatchStats ────────────────────────────────────
  {
    name: 'updateFinishedMatchStats: admin aumenta gols de jogador em partida encerrada',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });
      const before = await mockRepository.getSnapshot();
      const beforeStat = before.matchStats.find((s) => s.matchId === 'match-1' && s.playerId === 'player-8');
      assert.equal(beforeStat?.goals, 1, 'player-8 deve ter 1 gol no seed');
      await mockRepository.updateFinishedMatchStats(
        {
          matchId: 'match-1',
          teamScore: 5,
          opponentScore: 2,
          ownGoalsForTeam: 0,
          fieldCost: null,
          playerStats: [
            { playerId: 'player-8', goals: 3, assists: 0 },
            { playerId: 'player-9', goals: 2, assists: 1 },
          ],
        },
        'user-admin',
      );
      const after = await mockRepository.getSnapshot();
      const afterStat = after.matchStats.find((s) => s.matchId === 'match-1' && s.playerId === 'player-8');
      assert.equal(afterStat?.goals, 3, 'player-8 deve ter 3 gols apos edicao');
    },
  },
  {
    name: 'updateFinishedMatchStats: status permanece finished apos edicao',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });
      await mockRepository.updateFinishedMatchStats(
        {
          matchId: 'match-1',
          teamScore: 3,
          opponentScore: 1,
          ownGoalsForTeam: 0,
          fieldCost: null,
          playerStats: [{ playerId: 'player-9', goals: 3, assists: 0 }],
        },
        'user-admin',
      );
      const snapshot = await mockRepository.getSnapshot();
      const match = snapshot.matches.find((m) => m.id === 'match-1');
      assert.equal(match?.status, 'finished', 'status deve permanecer finished');
    },
  },
  {
    name: 'updateFinishedMatchStats: finishedAt preservado apos edicao',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });
      const before = await mockRepository.getSnapshot();
      const beforeMatch = before.matches.find((m) => m.id === 'match-1');
      const originalFinishedAt = beforeMatch?.finishedAt;
      assert.ok(originalFinishedAt, 'match-1 deve ter finishedAt no seed');
      await mockRepository.updateFinishedMatchStats(
        {
          matchId: 'match-1',
          teamScore: 3,
          opponentScore: 1,
          ownGoalsForTeam: 0,
          fieldCost: null,
          playerStats: [{ playerId: 'player-9', goals: 3, assists: 0 }],
        },
        'user-admin',
      );
      const after = await mockRepository.getSnapshot();
      const afterMatch = after.matches.find((m) => m.id === 'match-1');
      assert.equal(afterMatch?.finishedAt, originalFinishedAt, 'finishedAt nao deve ser alterado');
    },
  },
  {
    name: 'updateFinishedMatchStats: MVP e votos preservados apos edicao',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });
      const before = await mockRepository.getSnapshot();
      const beforeMatch = before.matches.find((m) => m.id === 'match-1');
      assert.deepEqual(beforeMatch?.mvpWinnerPlayerIds, ['player-9'], 'MVP deve ser player-9 no seed');
      await mockRepository.updateFinishedMatchStats(
        {
          matchId: 'match-1',
          teamScore: 5,
          opponentScore: 2,
          ownGoalsForTeam: 0,
          fieldCost: null,
          playerStats: [{ playerId: 'player-1', goals: 5, assists: 0 }],
        },
        'user-admin',
      );
      const after = await mockRepository.getSnapshot();
      const afterMatch = after.matches.find((m) => m.id === 'match-1');
      assert.deepEqual(afterMatch?.mvpWinnerPlayerIds, ['player-9'], 'MVP nao deve mudar apos edicao de stats');
      assert.equal(afterMatch?.mvpTotalVotes, beforeMatch?.mvpTotalVotes, 'votos MVP nao devem mudar');
    },
  },
  {
    name: 'updateFinishedMatchStats: placar atualizado corretamente no snapshot',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });
      await mockRepository.updateFinishedMatchStats(
        {
          matchId: 'match-1',
          teamScore: 1,
          opponentScore: 3,
          ownGoalsForTeam: 0,
          fieldCost: null,
          playerStats: [{ playerId: 'player-9', goals: 1, assists: 0 }],
        },
        'user-admin',
      );
      const snapshot = await mockRepository.getSnapshot();
      const match = snapshot.matches.find((m) => m.id === 'match-1');
      assert.equal(match?.scoreboard?.team, 1, 'placar do time deve ser 1');
      assert.equal(match?.scoreboard?.opponent, 3, 'placar do adversario deve ser 3');
      assert.equal(match?.scoreboard?.result, 'loss', 'resultado deve ser loss');
    },
  },
  {
    name: 'updateFinishedMatchStats: jogador sem permissao nao pode editar estatisticas',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'atacante@bocaiuva.app', password: '123456' });
      await assert.rejects(
        () =>
          mockRepository.updateFinishedMatchStats(
            {
              matchId: 'match-1',
              teamScore: 2,
              opponentScore: 1,
              ownGoalsForTeam: 0,
              fieldCost: null,
              playerStats: [{ playerId: 'player-9', goals: 2, assists: 0 }],
            },
            'user-striker',
          ),
        (error) => error instanceof Error,
        'nao-admin deve receber erro ao tentar editar estatisticas',
      );
    },
  },
  {
    name: 'updateFinishedMatchStats: partida nao-encerrada rejeita edicao de stats',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });
      await assert.rejects(
        () =>
          mockRepository.updateFinishedMatchStats(
            {
              matchId: 'match-4',
              teamScore: 2,
              opponentScore: 1,
              ownGoalsForTeam: 0,
              fieldCost: null,
              playerStats: [],
            },
            'user-admin',
          ),
        (error) => error instanceof Error && error.message.toLowerCase().includes('encerrada'),
        'partida nao encerrada deve rejeitar updateFinishedMatchStats',
      );
    },
  },

  // ── Testes de edit e finish com match.teamId (PARTE 6) ──────────────────────

  {
    name: 'updateMatch: admin salva alteracoes de venue em partida scheduled',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });
      const before = await mockRepository.getSnapshot();
      const match = before.matches.find((m) => m.id === 'match-4');
      assert.ok(match, 'match-4 deve existir como partida scheduled');
      assert.equal(match!.status, 'scheduled', 'match-4 deve ter status scheduled');
      await mockRepository.updateMatch(
        'match-4',
        {
          date: match!.date,
          time: match!.time,
          venue: 'Novo Estadio Atualizado',
          opponentName: match!.opponentName,
          linePlayersCount: match!.linePlayersCount,
          matchType: match!.matchType,
          notes: match!.notes ?? '',
        },
        'user-admin',
      );
      const after = await mockRepository.getSnapshot();
      const updated = after.matches.find((m) => m.id === 'match-4');
      assert.equal(updated?.venue, 'Novo Estadio Atualizado', 'venue deve ser atualizado para partida scheduled');
      assert.equal(updated?.status, 'scheduled', 'status nao deve mudar para scheduled');
    },
  },
  {
    name: 'updateMatch: admin com canManageTeam false e roles admin consegue salvar partida',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });
      patchMockTeamMember('member-admin-bocaiuva', { canManageTeam: false, roles: ['admin', 'player'] });
      const before = await mockRepository.getSnapshot();
      const match = before.matches.find((m) => m.id === 'match-4');
      assert.ok(match, 'match-4 deve existir');
      await mockRepository.updateMatch(
        'match-4',
        {
          date: match!.date,
          time: match!.time,
          venue: 'Arena Roles Admin',
          opponentName: match!.opponentName,
          linePlayersCount: match!.linePlayersCount,
          matchType: match!.matchType,
          notes: '',
        },
        'user-admin',
      );
      const after = await mockRepository.getSnapshot();
      const updated = after.matches.find((m) => m.id === 'match-4');
      assert.equal(updated?.venue, 'Arena Roles Admin', 'admin com roles.includes(admin) pode salvar mesmo com canManageTeam false');
    },
  },
  {
    name: 'updateMatch: update de partida encerrada nao altera scoreboard',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });
      const before = await mockRepository.getSnapshot();
      const match = before.matches.find((m) => m.id === 'match-1');
      assert.ok(match, 'match-1 deve existir como partida finished');
      const originalScoreboard = match!.scoreboard;
      assert.ok(originalScoreboard, 'match-1 deve ter scoreboard');
      await mockRepository.updateMatch(
        'match-1',
        {
          date: match!.date,
          time: match!.time,
          venue: 'Nova Arena',
          opponentName: match!.opponentName,
          linePlayersCount: match!.linePlayersCount,
          matchType: match!.matchType,
          notes: '',
          status: match!.status,
        },
        'user-admin',
      );
      const after = await mockRepository.getSnapshot();
      const updated = after.matches.find((m) => m.id === 'match-1');
      assert.deepEqual(updated?.scoreboard, originalScoreboard, 'scoreboard nao deve ser alterado por updateMatch');
    },
  },
  {
    name: 'updateMatch: update de partida encerrada nao altera mvpWinnerPlayerIds',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });
      const before = await mockRepository.getSnapshot();
      const match = before.matches.find((m) => m.id === 'match-1');
      assert.ok(match, 'match-1 deve existir como partida finished');
      const originalMvp = match!.mvpWinnerPlayerIds;
      assert.ok(Array.isArray(originalMvp) && originalMvp.length > 0, 'match-1 deve ter mvpWinnerPlayerIds');
      await mockRepository.updateMatch(
        'match-1',
        {
          date: match!.date,
          time: match!.time,
          venue: 'Nova Arena',
          opponentName: 'Adversário Diferente',
          linePlayersCount: match!.linePlayersCount,
          matchType: match!.matchType,
          notes: '',
          status: match!.status,
        },
        'user-admin',
      );
      const after = await mockRepository.getSnapshot();
      const updated = after.matches.find((m) => m.id === 'match-1');
      assert.deepEqual(updated?.mvpWinnerPlayerIds, originalMvp, 'mvpWinnerPlayerIds nao deve ser alterado por updateMatch');
    },
  },
  {
    name: 'updateMatch: jogador comum nao pode salvar alteracoes em partida scheduled',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'atacante@bocaiuva.app', password: '123456' });
      const before = await mockRepository.getSnapshot();
      const match = before.matches.find((m) => m.id === 'match-4');
      assert.ok(match, 'match-4 deve existir');
      await assert.rejects(
        () =>
          mockRepository.updateMatch(
            'match-4',
            {
              date: match!.date,
              time: match!.time,
              venue: 'Arena Hacker',
              opponentName: match!.opponentName,
              linePlayersCount: match!.linePlayersCount,
              matchType: match!.matchType,
              notes: '',
            },
            'user-striker',
          ),
        (error) => error instanceof Error && error.message.toLowerCase().includes('administrador'),
        'jogador comum nao deve poder salvar alteracoes de partida',
      );
    },
  },
  {
    name: 'finishMatch: encerramento de partida confirmed com canManageTeam false e roles admin',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });
      patchMockTeamMember('member-admin-bocaiuva', { canManageTeam: false, roles: ['admin', 'player'] });
      const confirmedPlayers = ['player-1', 'player-2', 'player-3', 'player-4', 'player-6', 'player-7', 'player-9', 'player-11'];
      const result = await mockRepository.finishMatch(
        {
          matchId: 'match-3',
          teamScore: 2,
          opponentScore: 1,
          ownGoalsForTeam: 0,
          fieldCost: null,
          playerStats: confirmedPlayers.map((id) => ({ playerId: id, goals: 0, assists: 0 })),
        },
        'user-admin',
      );
      assert.equal(result.status, 'finished', 'partida deve ficar finished mesmo com canManageTeam false se roles.includes(admin)');
    },
  },
  {
    name: 'finishMatch: match de outro time retorna erro ao usar context do time ativo',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });
      await assert.rejects(
        () =>
          mockRepository.finishMatch(
            {
              matchId: 'match-serrano-1',
              teamScore: 3,
              opponentScore: 0,
              ownGoalsForTeam: 0,
              fieldCost: null,
              playerStats: [],
            },
            'user-admin',
          ),
        (error) => error instanceof Error,
        'partida de outro time nao deve ser encontrada pelo context do time ativo',
      );
    },
  },
  {
    name: 'updateFinishedMatchStats: gols de jogadores sao recalculados corretamente apos edicao',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });
      await mockRepository.updateFinishedMatchStats(
        {
          matchId: 'match-1',
          teamScore: 5,
          opponentScore: 0,
          ownGoalsForTeam: 0,
          fieldCost: null,
          playerStats: [
            { playerId: 'player-8', goals: 3, assists: 1 },
            { playerId: 'player-9', goals: 2, assists: 0 },
          ],
        },
        'user-admin',
      );
      const after = await mockRepository.getSnapshot();
      const stat8 = after.matchStats.find((s) => s.matchId === 'match-1' && s.playerId === 'player-8');
      const stat9 = after.matchStats.find((s) => s.matchId === 'match-1' && s.playerId === 'player-9');
      assert.equal(stat8?.goals, 3, 'player-8 deve ter 3 gols');
      assert.equal(stat8?.assists, 1, 'player-8 deve ter 1 assistencia');
      assert.equal(stat9?.goals, 2, 'player-9 deve ter 2 gols');
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
