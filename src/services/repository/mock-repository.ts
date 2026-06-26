import { calculateMatchResult, getConfirmedPlayerIds, getMvpSummary } from '@/lib/match';
import {
  buildMatchFieldCost,
  buildMatchFieldPayment,
  getMatchFieldPaymentSummary,
} from '@/lib/field-cost';
import {
  normalizeDiaryTitle,
  resolveDiaryEmoji,
  sortMatchDiaryEntries,
  validateDiaryFields,
} from '@/lib/match-diary';
import { buildLegacyMatchImportPreview } from '@/lib/match-import';
import {
  buildInactivatedPlayerState,
  buildReactivatedPlayerState,
  buildUnlinkedPlayerState,
  touchesRestrictedPlayerAdminFields,
} from '@/lib/player-management';
import {
  buildRatingCriteriaSnapshot,
  calculateOverallFromCriteriaScores,
  countRatingCriterionUsage,
  createDefaultTeamRatingCriteria,
  getActiveRatingCriteria,
  normalizeRatingCriteriaOrder,
  normalizeTeamRatingCriterion,
  validateActiveRatingCriteria,
  validateRatingCriteriaSubmission,
} from '@/lib/rating-criteria';
import {
  buildJoinTeamPlayerLinkResolution,
  isPlayerAvailableForLinking,
  normalizeEmail,
  resolvePlayerForUser,
  resolvePlayerForUserWithDiagnostics,
  suggestPlayerLinksForUser,
} from '@/lib/player-linking';
import {
  getInvalidSelfPlayerProfileUpdateFields,
  logOwnPlayerProfileAccess,
  resolveOwnPlayerProfileAccess,
} from '@/lib/player-profile-access';
import {
  buildNotificationId,
  createAttendanceNotification,
  createLineupPublishedNotification,
  createMatchCreatedNotification,
  createMatchFinishedNotification,
  createMatchDiaryPublishedNotification,
  createMatchUpdatedNotification,
  createMvpVotingOpenedNotification,
  createMvpWinnerNotification,
  createRatingsOpenedNotification,
} from '@/lib/notifications';
import {
  getFormationPresetByKey,
  sanitizeLineupLayoutState,
} from '@/lib/lineup';
import {
  canCreateTeamFromOwnedTeamsCount,
  createEmptyManualStats,
  createInviteCode,
  deriveNickname,
  displayNameFromEmail,
  getOwnedTeamsCount as getOwnedTeamsCountFromTeams,
  normalizeInviteCode,
  normalizeManualStats,
  OWNED_TEAMS_LIMIT_REACHED_MESSAGE,
  slugifyTeamName,
} from '@/lib/team';
import {
  buildPublicTeamDocument,
  buildTeamInviteDocument,
  normalizeTeamPublicProfileFields,
  validateTeamPublicProfileFields,
} from '@/lib/public-team';
import {
  buildTeamMembershipIndexDocument,
} from '@/lib/team-membership-index';
import type {
  FirestorePublicTeamDocument,
  FirestoreTeamInviteDocument,
} from '@/types/firestore';
import type {
  AppNotification,
  AttendanceRecord,
  AttendanceStatus,
  Match,
  MatchDiaryEntry,
  MatchType,
  MatchStat,
  MvpVote,
  Player,
  PlayerRating,
  PublicTeamProfile,
  PublicTeamSummary,
  Team,
  TeamMember,
  TeamRatingCriterion,
  User,
} from '@/types/domain';
import { createSeedDatabase } from '@/mocks/seed';
import { emptySnapshot } from '@/services/repository/types';
import type {
  AppRepository,
  AppSnapshot,
  CreateMatchInput,
  CreateMatchDiaryEntryInput,
  CreatePlayerInput,
  CreateRatingCriterionInput,
  CreateTeamInput,
  FinishMatchInput,
  GoogleLoginInput,
  RegisterFinishedMatchInput,
  LoginInput,
  MockDatabase,
  RegisterInput,
  SaveLineupInput,
  SubmitMvpVoteInput,
  SubmitPlayerRatingInput,
  UpdateMatchInput,
  UpdateMatchMetadataInput,
  UpdateMatchFieldPaymentInput,
  UpdateMatchDiaryEntryInput,
  UpdateRatingCriterionInput,
  UpdateTeamInput,
  UpdateAttendanceInput,
  UpdatePlayerInput,
} from '@/services/repository/types';
import type {
  ImportLegacyMatchesResult,
  ImportedMatchPayloadItem,
  LegacyMatchImportPreview,
  RegisterFinishedMatchPlayerInput,
} from '@/types/match-import';

let database = createSeedDatabase();
let mockSessionUserId: string | null = null;
const repairingMockUsers = new Set<string>();

export function resetMockRepositorySession() {
  mockSessionUserId = null;
}

export function resetMockRepositoryState() {
  database = createSeedDatabase();
  mockSessionUserId = null;
  repairingMockUsers.clear();
}

export function patchMockTeamMember(memberId: string, patch: Partial<TeamMember>) {
  const member = database.teamMembers.find((m) => m.id === memberId);
  if (member) {
    Object.assign(member, patch);
    syncTeamMembershipIndexDocument(member);
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function canAccessNotification(
  notification: AppNotification,
  userId: string | null | undefined,
) {
  return notification.targetUserId == null || notification.targetUserId === userId;
}

function toPublicTeamSummary(document: FirestorePublicTeamDocument): PublicTeamSummary {
  const {
    presentationVideoUrl: _presentationVideoUrl,
    publicRosterEnabled: _publicRosterEnabled,
    roster: _roster,
    adminUserId: _adminUserId,
    sourceTeamUpdatedAt: _sourceTeamUpdatedAt,
    syncedAt: _syncedAt,
    ...summary
  } = document;

  return summary;
}

function toPublicTeamProfile(document: FirestorePublicTeamDocument): PublicTeamProfile {
  const {
    adminUserId: _adminUserId,
    sourceTeamUpdatedAt: _sourceTeamUpdatedAt,
    syncedAt: _syncedAt,
    ...profile
  } = document;

  return profile;
}

function findPublicTeamDocument(teamId: string) {
  return database.publicTeams.find((team) => team.id === teamId) ?? null;
}

function findTeamInviteDocument(inviteCode: string) {
  const normalizedInviteCode = normalizeInviteCode(inviteCode);
  return (
    database.teamInvites.find((invite) => invite.code === normalizedInviteCode) ?? null
  );
}

function findTeamMembershipIndexDocument(teamId: string, userId: string) {
  return (
    database.teamMembershipIndex.find(
      (membership) => membership.teamId === teamId && membership.userId === userId,
    ) ?? null
  );
}

function syncTeamMembershipIndexDocument(membership: TeamMember) {
  database.teamMembershipIndex = database.teamMembershipIndex.filter(
    (item) => !(item.teamId === membership.teamId && item.userId === membership.userId),
  );

  if (membership.status !== 'active') {
    return null;
  }

  const indexDocument = buildTeamMembershipIndexDocument(membership);
  database.teamMembershipIndex.push(indexDocument);
  return indexDocument;
}

function removeTeamMembershipIndexDocument(teamId: string, userId: string) {
  database.teamMembershipIndex = database.teamMembershipIndex.filter(
    (item) => !(item.teamId === teamId && item.userId === userId),
  );
}

function syncPublicTeamProjection(teamId: string, syncedAt = nowIso()) {
  database.publicTeams = database.publicTeams.filter((team) => team.id !== teamId);
  const team = database.teams.find((item) => item.id === teamId) ?? null;

  if (!team) {
    return null;
  }

  const publicTeam = buildPublicTeamDocument({
    team,
    matches: database.matches.filter((match) => match.teamId === teamId),
    players: database.players.filter((player) => player.teamId === teamId),
    syncedAt,
  });

  if (publicTeam) {
    database.publicTeams.push(publicTeam);
  }

  return publicTeam;
}

function syncTeamInviteProjection(team: Team, updatedAt = nowIso()) {
  database.teamInvites = database.teamInvites.filter((invite) => invite.teamId !== team.id);
  const invite = buildTeamInviteDocument(team, updatedAt);
  database.teamInvites.push(invite);
  return invite;
}

function removeTeamInviteProjection(teamId: string) {
  database.teamInvites = database.teamInvites.filter((invite) => invite.teamId !== teamId);
}

function snapshotFromDatabase(source: MockDatabase, currentUserId: string | null): AppSnapshot {
  if (!currentUserId) {
    return clone(emptySnapshot);
  }

  const currentUser = source.users.find((user) => user.id === currentUserId) ?? null;
  if (!currentUser) {
    return clone(emptySnapshot);
  }

  ensureCurrentUserPlayerForActiveTeam(currentUser.id);
  syncUserActiveContext(currentUser);
  const memberships = findUserMemberships(currentUser.id);
  const activeMembership =
    memberships.find((membership) => membership.teamId === currentUser.activeTeamId) ?? null;
  const activeTeamId = activeMembership?.teamId ?? null;
  const teams = memberships
    .map((membership) => source.teams.find((team) => team.id === membership.teamId) ?? null)
    .filter((team): team is Team => Boolean(team));

  return clone({
    users: [currentUser],
    teams,
    teamMembers: memberships,
    ratingCriteria: activeTeamId
      ? source.ratingCriteria.filter((criterion) => criterion.teamId === activeTeamId)
      : [],
    players: activeTeamId
      ? source.players.filter((player) => player.teamId === activeTeamId)
      : [],
    matches: activeTeamId
      ? source.matches.filter((match) => match.teamId === activeTeamId)
      : [],
    lineups: activeTeamId
      ? source.lineups.filter((lineup) => lineup.teamId === activeTeamId)
      : [],
    attendance: activeTeamId
      ? source.attendance.filter((record) => record.teamId === activeTeamId)
      : [],
    matchStats: activeTeamId
      ? source.matchStats.filter((stat) => stat.teamId === activeTeamId)
      : [],
    matchDiaryEntries: activeTeamId
      ? sortMatchDiaryEntries(
          source.matchDiaryEntries.filter((entry) => entry.teamId === activeTeamId),
        )
      : [],
    mvpVotes: activeTeamId
      ? source.mvpVotes.filter((vote) => vote.teamId === activeTeamId)
      : [],
    playerRatings: activeTeamId
      ? source.playerRatings.filter((rating) => rating.teamId === activeTeamId)
      : [],
    notifications: activeTeamId
      ? source.notifications.filter(
          (notification) =>
            notification.teamId === activeTeamId &&
            canAccessNotification(notification, currentUser.id),
        )
      : [],
    seasons: activeTeamId
      ? source.seasons.filter((season) => season.teamId === activeTeamId)
      : [],
    accessNotice: null,
  });
}

function snapshotForTeam(teamId: string): AppSnapshot {
  return clone({
    ...emptySnapshot,
    ratingCriteria: database.ratingCriteria.filter((criterion) => criterion.teamId === teamId),
    players: database.players.filter((player) => player.teamId === teamId),
    matches: database.matches.filter((match) => match.teamId === teamId),
    lineups: database.lineups.filter((lineup) => lineup.teamId === teamId),
    attendance: database.attendance.filter((record) => record.teamId === teamId),
    matchStats: database.matchStats.filter((stat) => stat.teamId === teamId),
    matchDiaryEntries: sortMatchDiaryEntries(
      database.matchDiaryEntries.filter((entry) => entry.teamId === teamId),
    ),
    mvpVotes: database.mvpVotes.filter((vote) => vote.teamId === teamId),
    playerRatings: database.playerRatings.filter((rating) => rating.teamId === teamId),
    notifications: database.notifications.filter((notification) => notification.teamId === teamId),
    seasons: database.seasons.filter((season) => season.teamId === teamId),
  });
}

function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function buildStableDocumentId(...parts: string[]) {
  return parts.join('__');
}

function normalizeMatchTime(time?: string | null) {
  return time?.trim() ?? '';
}

function normalizeOptionalString(value?: string | null) {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeMatchVenue(venue?: string | null) {
  return venue?.trim() || 'Não informado';
}

function defaultLinePlayersCount(matchType: MatchType) {
  switch (matchType) {
    case 'futsal':
      return 4;
    case 'field':
      return 10;
    case 'society':
    case 'training':
    default:
      return 6;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function average(numbers: number[]) {
  if (numbers.length === 0) {
    return 0;
  }

  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function findUser(userId: string) {
  const user = database.users.find((item) => item.id === userId);
  if (!user) {
    throw new Error('Usuário não encontrado.');
  }
  return user;
}

function getOwnedTeamsCount(userId: string) {
  return getOwnedTeamsCountFromTeams(database.teams, userId);
}

function findUserByEmail(email: string) {
  const normalizedEmail = normalizeEmail(email);
  return (
    database.users.find((user) => normalizeEmail(user.email) === normalizedEmail) ?? null
  );
}

function findTeam(teamId: string) {
  const team = database.teams.find((item) => item.id === teamId);
  if (!team) {
    throw new Error('Time não encontrado.');
  }
  return team;
}

function findPlayer(playerId: string) {
  const player = database.players.find((item) => item.id === playerId);
  if (!player) {
    throw new Error('Jogador não encontrado.');
  }
  return player;
}

function findMatch(matchId: string) {
  const match = database.matches.find((item) => item.id === matchId);
  if (!match) {
    throw new Error('Partida não encontrada.');
  }
  return match;
}

function findMatchForTeam(teamId: string, matchId: string) {
  const match = database.matches.find(
    (item) => item.id === matchId && item.teamId === teamId,
  );

  if (!match) {
    throw new Error('Partida não encontrada.');
  }

  return match;
}

function findLineup(matchId: string) {
  return database.lineups.find((item) => item.matchId === matchId) ?? null;
}

function findLineupForTeam(teamId: string, matchId: string) {
  return (
    database.lineups.find(
      (item) => item.teamId === teamId && item.matchId === matchId,
    ) ?? null
  );
}

function findTeamPlayers(teamId: string) {
  return database.players.filter((player) => player.teamId === teamId);
}

function findRatingCriteriaForTeam(teamId: string) {
  return database.ratingCriteria.filter((criterion) => criterion.teamId === teamId);
}

function replaceTeamRatingCriteria(teamId: string, nextCriteria: TeamRatingCriterion[]) {
  database.ratingCriteria = [
    ...database.ratingCriteria.filter((criterion) => criterion.teamId !== teamId),
    ...nextCriteria,
  ];
}

function syncRatingCriteriaOrder(teamId: string) {
  const normalized = normalizeRatingCriteriaOrder(
    findRatingCriteriaForTeam(teamId).map((criterion) => normalizeTeamRatingCriterion(criterion)),
  );
  replaceTeamRatingCriteria(teamId, normalized);
  return normalized;
}

function findRatingCriterionForTeam(teamId: string, criterionId: string) {
  return (
    findRatingCriteriaForTeam(teamId).find((criterion) => criterion.id === criterionId) ?? null
  );
}

function isMatchOpenForAttendance(match: Match) {
  return match.status !== 'finished' && match.status !== 'canceled';
}

function ensureOpenMatchAttendanceForPlayer(player: Player) {
  if (!isActivePlayer(player)) {
    return;
  }

  const updatedAt = nowIso();
  const desiredUserId = player.linkedUserId ?? null;
  const openMatchIds = new Set(
    database.matches
      .filter((match) => match.teamId === player.teamId && isMatchOpenForAttendance(match))
      .map((match) => match.id),
  );

  for (const match of database.matches.filter(
    (item) => item.teamId === player.teamId && openMatchIds.has(item.id),
  )) {
    const existingRecord =
      database.attendance.find(
        (attendance) =>
          attendance.teamId === player.teamId &&
          attendance.matchId === match.id &&
          attendance.playerId === player.id,
      ) ?? null;

    if (existingRecord) {
      if (existingRecord.userId !== desiredUserId) {
        existingRecord.userId = desiredUserId;
        existingRecord.updatedAt = updatedAt;
      }

      continue;
    }

    database.attendance.push({
      id: buildStableDocumentId(match.id, player.id),
      teamId: player.teamId,
      matchId: match.id,
      playerId: player.id,
      userId: desiredUserId,
      status: 'pending',
      respondedAt: null,
      createdAt: updatedAt,
      updatedAt,
    });
  }
}

interface ResolvedFinishedMatchPlayerInput extends RegisterFinishedMatchPlayerInput {
  player: Player;
  started: boolean;
}

function resolveFinishedMatchPlayersInput(input: {
  players: RegisterFinishedMatchPlayerInput[];
  teamPlayers: Player[];
  teamScore: number;
}) {
  if (input.players.length === 0) {
    throw new Error('Informe pelo menos um jogador para registrar a partida.');
  }

  const playersById = new Map(input.teamPlayers.map((player) => [player.id, player]));
  const usedPlayerIds = new Set<string>();
  const resolvedPlayers = input.players.map<ResolvedFinishedMatchPlayerInput>((item) => {
    const player = playersById.get(item.playerId);
    if (!player) {
      throw new Error('Todos os jogadores precisam pertencer ao time atual.');
    }

    if (usedPlayerIds.has(item.playerId)) {
      throw new Error('Não repita o mesmo jogador mais de uma vez na partida.');
    }

    if (item.goals < 0 || item.assists < 0) {
      throw new Error('Gols e assistências não podem ser negativos.');
    }

    if (!item.played && (item.goals > 0 || item.assists > 0)) {
      throw new Error('Um jogador marcado como ausente não pode receber estatísticas.');
    }

    usedPlayerIds.add(item.playerId);

    return {
      ...item,
      player,
      started: item.started ?? item.played,
    };
  });

  const playedPlayers = resolvedPlayers.filter((item) => item.played);
  if (playedPlayers.length === 0) {
    throw new Error('A partida precisa ter pelo menos um jogador participante.');
  }

  const totalGoals = playedPlayers.reduce((sum, item) => sum + item.goals, 0);
  if (totalGoals > input.teamScore) {
    throw new Error('A soma de gols dos jogadores não pode ultrapassar o placar do time.');
  }

  return resolvedPlayers;
}

function createFinishedMatchRecord(input: {
  actorUserId: string;
  team: Team;
  values: RegisterFinishedMatchInput;
  teamPlayers?: Player[];
}) {
  const opponentName = input.values.opponentName.trim();
  if (!opponentName) {
    throw new Error('Informe o adversario da partida.');
  }

  if (input.values.teamScore < 0 || input.values.opponentScore < 0) {
    throw new Error('O placar não pode ter números negativos.');
  }

  if (
    input.values.linePlayersCount != null &&
    (input.values.linePlayersCount < 1 || input.values.linePlayersCount > 15)
  ) {
    throw new Error('A quantidade de jogadores de linha precisa ficar entre 1 e 15.');
  }

  const updatedAt = nowIso();
  const teamPlayers = input.teamPlayers ?? findTeamPlayers(input.team.id);
  const resolvedPlayers = resolveFinishedMatchPlayersInput({
    players: input.values.players,
    teamPlayers,
    teamScore: input.values.teamScore,
  });
  const match: Match = {
    id: createId('match'),
    teamId: input.team.id,
    seasonId: input.values.seasonId ?? input.team.activeSeasonId ?? null,
    date: input.values.date,
    time: normalizeMatchTime(input.values.time),
    venue: normalizeMatchVenue(input.values.venue),
    locationUrl: normalizeOptionalString(input.values.locationUrl),
    opponentName,
    opponentLogoUrl: input.values.opponentLogoUrl ?? null,
    linePlayersCount:
      input.values.linePlayersCount ?? defaultLinePlayersCount(input.values.matchType),
    matchType: input.values.matchType,
    notes: input.values.notes?.trim() ?? '',
    status: 'finished',
    createdBy: input.actorUserId,
    scoreboard: {
      team: input.values.teamScore,
      opponent: input.values.opponentScore,
      result: calculateMatchResult(input.values.teamScore, input.values.opponentScore),
    },
    finishedAt: updatedAt,
    mvpWinnerPlayerIds: [],
    mvpTotalVotes: 0,
    createdAt: updatedAt,
    updatedAt,
  };

  database.matches.push(match);

  for (const item of resolvedPlayers) {
    database.attendance.push({
      id: buildStableDocumentId(match.id, item.player.id),
      teamId: input.team.id,
      matchId: match.id,
      playerId: item.player.id,
      userId: item.player.linkedUserId ?? null,
      status: item.played ? 'confirmed' : 'absent',
      respondedAt: updatedAt,
      createdAt: updatedAt,
      updatedAt,
    });

    if (!item.played) {
      continue;
    }

    database.matchStats.push({
      id: buildStableDocumentId(match.id, item.player.id),
      teamId: input.team.id,
      matchId: match.id,
      playerId: item.player.id,
      played: true,
      started: item.started,
      goals: item.goals,
      assists: item.assists,
      yellowCards: 0,
      redCards: 0,
      notes: '',
      createdAt: updatedAt,
      updatedAt,
    });
  }

  return clone(match);
}

function findAttendanceForMatch(teamId: string, matchId: string) {
  return database.attendance.filter(
    (item) => item.teamId === teamId && item.matchId === matchId,
  );
}

function findMatchStatsForMatch(teamId: string, matchId: string) {
  return database.matchStats.filter(
    (item) => item.teamId === teamId && item.matchId === matchId,
  );
}

function findMvpVotesForMatch(teamId: string, matchId: string) {
  return database.mvpVotes.filter(
    (item) => item.teamId === teamId && item.matchId === matchId,
  );
}

function findRatingsForMatch(teamId: string, matchId: string) {
  return database.playerRatings.filter(
    (item) => item.teamId === teamId && item.matchId === matchId,
  );
}

function findMatchDiaryEntriesForTeam(teamId: string) {
  return sortMatchDiaryEntries(
    database.matchDiaryEntries.filter((item) => item.teamId === teamId),
  );
}

function findMatchDiaryEntriesForMatch(teamId: string, matchId: string) {
  return findMatchDiaryEntriesForTeam(teamId).filter((item) => item.matchId === matchId);
}

function findMatchDiaryEntryForTeam(teamId: string, entryId: string) {
  return (
    database.matchDiaryEntries.find(
      (item) => item.teamId === teamId && item.id === entryId,
    ) ?? null
  );
}

function findNotificationsForTeam(teamId: string) {
  return database.notifications.filter((item) => item.teamId === teamId);
}

function findNotificationByIdForTeam(teamId: string, notificationId: string) {
  return (
    database.notifications.find(
      (item) => item.teamId === teamId && item.id === notificationId,
    ) ?? null
  );
}

function upsertNotification(notification: AppNotification) {
  const existingIndex = database.notifications.findIndex(
    (item) => item.id === notification.id,
  );

  if (existingIndex >= 0) {
    database.notifications[existingIndex] = notification;
    return;
  }

  database.notifications.push(notification);
}

function removeNotification(notificationId: string) {
  database.notifications = database.notifications.filter(
    (item) => item.id !== notificationId,
  );
}

function createDiaryNotificationId(
  entryId: string,
  targetUserId?: string | null,
) {
  return buildNotificationId(
    'match-diary-published',
    entryId,
    targetUserId ? `target-${targetUserId}` : 'team',
  );
}

function publishMatchDiaryNotifications(input: {
  entry: MatchDiaryEntry;
  match: Match;
  actorUserId: string;
  teamMembers: TeamMember[];
  mentionedPlayerIds: string[];
}) {
  const teamMembers = input.teamMembers.filter((member) => member.status === 'active');
  const mentionedPlayerIds = new Set(input.mentionedPlayerIds);
  const mentionedUserIds = new Set(
    teamMembers
      .filter((member) => member.playerId && mentionedPlayerIds.has(member.playerId))
      .map((member) => member.userId),
  );

  if (mentionedUserIds.size === 0) {
    const notificationId = createDiaryNotificationId(input.entry.id);
    const existing = findNotificationByIdForTeam(input.entry.teamId, notificationId);
    upsertNotification(
      createMatchDiaryPublishedNotification({
        id: notificationId,
        teamId: input.entry.teamId,
        match: input.match,
        entryId: input.entry.id,
        authorName: input.entry.authorName,
        actorUserId: input.actorUserId,
        createdAt: existing?.createdAt,
        updatedAt: input.entry.updatedAt,
        variant: 'published',
      }),
    );
    return;
  }

  const recipientUserIds = [...new Set(teamMembers.map((member) => member.userId))];

  for (const userId of recipientUserIds) {
    const notificationId = createDiaryNotificationId(input.entry.id, userId);
    const existing = findNotificationByIdForTeam(input.entry.teamId, notificationId);
    upsertNotification(
      createMatchDiaryPublishedNotification({
        id: notificationId,
        teamId: input.entry.teamId,
        match: input.match,
        entryId: input.entry.id,
        authorName: input.entry.authorName,
        actorUserId: input.actorUserId,
        createdAt: existing?.createdAt,
        updatedAt: input.entry.updatedAt,
        targetUserId: userId,
        variant: mentionedUserIds.has(userId) ? 'mentioned' : 'team',
      }),
    );
  }
}

function removeDiaryNotifications(entryId: string) {
  database.notifications = database.notifications.filter(
    (item) =>
      item.type !== 'match-diary-published' ||
      item.entryId !== entryId,
  );
}

function isActivePlayer(player: Player) {
  return player.status === 'active' && !player.deletedAt;
}

function findSelectableTeamPlayers(teamId: string) {
  return findTeamPlayers(teamId).filter(isActivePlayer);
}

function findMembership(membershipId: string) {
  const membership = database.teamMembers.find((item) => item.id === membershipId);
  if (!membership) {
    throw new Error('Participação no time não encontrada.');
  }
  return membership;
}

function findUserMemberships(userId: string) {
  const memberships = database.teamMembers.filter(
    (membership) => membership.userId === userId && membership.status === 'active',
  );
  const byTeamId = new Map<string, TeamMember>();

  for (const membership of memberships) {
    const current = byTeamId.get(membership.teamId);

    if (!current) {
      byTeamId.set(membership.teamId, membership);
      continue;
    }

    const currentScore =
      current.roles.length * 1000 +
      (current.canManageTeam ? 100 : 0) +
      (current.canManagePlayers ? 50 : 0) +
      (current.playerId ? 25 : 0) +
      new Date(current.updatedAt).getTime() / 1_000_000_000_000;
    const nextScore =
      membership.roles.length * 1000 +
      (membership.canManageTeam ? 100 : 0) +
      (membership.canManagePlayers ? 50 : 0) +
      (membership.playerId ? 25 : 0) +
      new Date(membership.updatedAt).getTime() / 1_000_000_000_000;

    byTeamId.set(membership.teamId, nextScore >= currentScore ? membership : current);
  }

  return [...byTeamId.values()];
}

function findMembershipByUserAndTeam(userId: string, teamId: string) {
  return findUserMemberships(userId).find((membership) => membership.teamId === teamId) ?? null;
}

function findAnyMembershipByUserAndTeam(userId: string, teamId: string) {
  return (
    database.teamMembers.find(
      (membership) => membership.userId === userId && membership.teamId === teamId,
    ) ?? null
  );
}

function repairCurrentUserMembershipsByLinkedPlayers(user: User) {
  if (repairingMockUsers.has(user.id)) {
    return;
  }

  repairingMockUsers.add(user.id);

  try {
    const normalizedUserEmail = normalizeEmail(user.email);
    const playersByTeam = database.players.reduce<Map<string, Player[]>>((acc, player) => {
      if (
        !isPlayerAvailableForLinking(player) ||
        !(
          player.linkedUserId === user.id ||
          (!player.linkedUserId &&
            normalizeEmail(player.linkedEmail ?? '') === normalizedUserEmail)
        )
      ) {
        return acc;
      }

      const current = acc.get(player.teamId) ?? [];
      acc.set(player.teamId, [...current, player]);
      return acc;
    }, new Map());

    for (const [teamId, candidates] of playersByTeam.entries()) {
      const player = resolvePlayerForUser({
        teamPlayers: candidates,
        teamId,
        user,
      });

      if (!player) {
        continue;
      }

      player.linkedUserId = user.id;
      player.linkedEmail = normalizedUserEmail;
      player.updatedAt = nowIso();
      syncLinkedUser(player, { syncContext: false });
      ensureOpenMatchAttendanceForPlayer(player);
    }
  } finally {
    repairingMockUsers.delete(user.id);
  }
}

function syncUserActiveContext(user: User) {
  repairCurrentUserMembershipsByLinkedPlayers(user);
  const memberships = findUserMemberships(user.id);
  const activeMembership =
    memberships.find((membership) => membership.teamId === user.activeTeamId) ??
    memberships[0] ??
    null;

  user.activeTeamId = activeMembership?.teamId ?? null;
  user.teamId = activeMembership?.teamId ?? null;
  user.playerId = activeMembership?.playerId ?? null;

  return activeMembership;
}

function findTeamByInviteCode(inviteCode: string) {
  const invite = findTeamInviteDocument(inviteCode);

  if (!invite) {
    return null;
  }

  return database.teams.find((team) => team.id === invite.teamId) ?? null;
}

function requireTeamAdmin(actorUserId: string, teamId: string) {
  const { actor, membership } = ensureMembershipContext(actorUserId, teamId);
  const hasManagePermission =
    membership.canManageTeam || membership.roles.includes('admin');

  if (!hasManagePermission) {
    throw new Error('Apenas o administrador do time pode fazer essa acao.');
  }

  return actor;
}

function requireTeamOwner(actorUserId: string, teamId: string) {
  const { actor } = ensureMembershipContext(actorUserId, teamId);
  const team = findTeam(teamId);

  if (team.adminUserId !== actor.id) {
    throw new Error('Apenas quem criou o time pode excluir definitivamente.');
  }

  return { actor, team };
}

function requirePlayerManager(actorUserId: string, teamId: string) {
  const { actor, membership } = ensureMembershipContext(actorUserId, teamId);

  if (!membership.canManagePlayers) {
    throw new Error('Apenas quem gerencia o elenco pode fazer essa acao.');
  }

  return actor;
}

function ensureActiveTeamContext(actorUserId: string) {
  const actor = findUser(actorUserId);
  syncUserActiveContext(actor);

  if (!actor.activeTeamId) {
    throw new Error('Escolha um time antes de continuar.');
  }

  const membership = findMembershipByUserAndTeam(actor.id, actor.activeTeamId);
  if (!membership) {
    throw new Error('Seu acesso ao time atual não está disponível.');
  }

  const preRepairMembershipPlayerId = membership.playerId ?? null;

  if (membership.roles.includes('player')) {
    ensureMembershipPlayerLink({
      user: actor,
      membership,
      team: findTeam(actor.activeTeamId),
    });
    syncUserActiveContext(actor);
  }

  return {
    actor,
    membership,
    activeTeamId: actor.activeTeamId,
    preRepairMembershipPlayerId,
  };
}

function ensureMembershipContext(actorUserId: string, teamId: string) {
  const context = ensureActiveTeamContext(actorUserId);

  if (context.activeTeamId !== teamId) {
    throw new Error('Troque para o time atual antes de continuar.');
  }

  return context;
}

function resolveTeamAppRole(user: User, team: Team | null) {
  if (user.appRole === 'owner') {
    return 'owner';
  }

  if (team && team.adminUserId === user.id) {
    return 'team_admin';
  }

  return 'player';
}

function ensureMembershipPlayerLink(input: {
  user: User;
  membership: TeamMember;
  team: Team;
  teamPlayers?: Player[];
}) {
  if (!input.membership.roles.includes('player')) {
    return null;
  }

  const normalizedUserEmail = normalizeEmail(input.user.email);
  const teamPlayers = input.teamPlayers ?? findTeamPlayers(input.team.id);
  let player = resolvePlayerForUser({
    teamPlayers,
    teamId: input.team.id,
    user: input.user,
    membership: input.membership,
  });

  if (!player) {
    return null;
  }

  const canUpdateLinkedEmail = !teamPlayers.some(
    (candidate) =>
      candidate.id !== player.id &&
      normalizeEmail(candidate.linkedEmail ?? '') === normalizedUserEmail,
  );

  player.linkedUserId = input.user.id;
  player.linkedEmail = canUpdateLinkedEmail
    ? normalizedUserEmail
    : normalizeEmail(player.linkedEmail) || null;
  player.updatedAt = nowIso();

  input.membership.playerId = player.id;
  input.membership.status = 'active';
  input.membership.canManageTeam = input.membership.roles.includes('admin');
  input.membership.canManagePlayers = input.membership.roles.includes('admin');
  input.membership.updatedAt = nowIso();
  syncTeamMembershipIndexDocument(input.membership);

  if (input.user.activeTeamId === input.team.id || input.user.activeTeamId == null) {
    input.user.activeTeamId = input.team.id;
    input.user.teamId = input.team.id;
    input.user.playerId = player.id;
  }

  input.user.appRole = resolveTeamAppRole(input.user, input.team);
  input.user.updatedAt = nowIso();
  ensureOpenMatchAttendanceForPlayer(player);

  return player;
}

function ensureCurrentUserPlayerForActiveTeam(userId: string) {
  const actor = findUser(userId);
  syncUserActiveContext(actor);

  if (!actor.activeTeamId) {
    return null;
  }

  const membership = findMembershipByUserAndTeam(actor.id, actor.activeTeamId);
  if (!membership || !membership.roles.includes('player')) {
    return null;
  }

  const player = ensureMembershipPlayerLink({
    user: actor,
    membership,
    team: findTeam(actor.activeTeamId),
  });

  syncUserActiveContext(actor);

  return player?.id ?? membership.playerId ?? null;
}

function requireLinkedPlayer(actorUserId: string) {
  const { actor, membership, activeTeamId } = ensureActiveTeamContext(actorUserId);
  const currentPlayerId = membership.roles.includes('player')
    ? ensureCurrentUserPlayerForActiveTeam(actorUserId)
    : null;

  if (!currentPlayerId) {
    throw new Error('Esta conta ainda não está vinculada a um jogador.');
  }

  const player = findPlayer(currentPlayerId);
  if (player.teamId !== activeTeamId) {
    throw new Error('Esta conta não está vinculada ao time atual.');
  }

  return { actor, player, membership, activeTeamId };
}

function assertJerseyAvailable(teamId: string, jerseyNumber: number, excludedPlayerId?: string) {
  const duplicate = database.players.find(
    (player) =>
      player.teamId === teamId &&
      player.jerseyNumber === jerseyNumber &&
      player.id !== excludedPlayerId,
  );

  if (duplicate) {
    throw new Error(`A camisa ${jerseyNumber} ja esta em uso no time.`);
  }
}

function nextJerseyNumber(teamId: string) {
  return (
    findTeamPlayers(teamId).reduce(
      (highestNumber, player) => Math.max(highestNumber, player.jerseyNumber),
      0,
    ) + 1
  );
}

function createUniqueInviteCode(excludedTeamId?: string) {
  let inviteCode = createInviteCode();

  while (
    database.teamInvites.some(
      (invite) => invite.teamId !== excludedTeamId && invite.code === inviteCode,
    )
  ) {
    inviteCode = createInviteCode();
  }

  return inviteCode;
}

function sanitizeSecondaryPositions(
  primaryPosition: Player['primaryPosition'],
  secondaryPositions: Player['secondaryPositions'],
) {
  return [...new Set(secondaryPositions)].filter((position) => position !== primaryPosition);
}

function ensurePlayerBelongsToTeam(playerId: string, teamId: string) {
  const player = findPlayer(playerId);

  if (player.teamId !== teamId) {
    throw new Error('Jogador não pertence ao time informado.');
  }

  return player;
}

function sanitizeMentionedPlayerIds(teamId: string, mentionedPlayerIds: string[] = []) {
  const uniquePlayerIds = [...new Set(mentionedPlayerIds.filter(Boolean))];

  for (const playerId of uniquePlayerIds) {
    ensurePlayerBelongsToTeam(playerId, teamId);
  }

  return uniquePlayerIds;
}

function validateLinkedEmailAvailability(
  teamId: string,
  linkedEmail?: string | null,
  excludedPlayerId?: string,
) {
  if (!linkedEmail?.trim()) {
    return null;
  }

  const normalizedLinkedEmail = normalizeEmail(linkedEmail);
  const duplicate = database.players.find(
    (player) =>
      player.teamId === teamId &&
      normalizeEmail(player.linkedEmail ?? '') === normalizedLinkedEmail &&
      player.id !== excludedPlayerId,
  );

  if (duplicate) {
    throw new Error('Esse e-mail ja esta reservado para outro jogador do time.');
  }

  return normalizedLinkedEmail;
}

function validateLinkedUserAssignment(
  linkedUserId: string,
  teamId: string,
  currentPlayerId?: string,
) {
  const linkedUser = findUser(linkedUserId);
  const duplicatePlayer = database.players.find(
    (player) =>
      player.teamId === teamId &&
      player.linkedUserId === linkedUser.id &&
      player.id !== currentPlayerId,
  );

  if (duplicatePlayer) {
    throw new Error('Esse usuario ja esta vinculado a outro jogador.');
  }

  return linkedUser;
}

function linkPlayerToUserIfEmailMatches(input: {
  teamId: string;
  player: Pick<Player, 'linkedUserId' | 'linkedEmail'>;
  linkedUserId?: string | null;
  linkedEmail?: string | null;
  currentPlayerId?: string;
  preferredUser?: User | null;
}) {
  const normalizedLinkedEmail = normalizeEmail(
    input.linkedEmail ?? input.player.linkedEmail,
  );
  let linkedUser =
    typeof input.linkedUserId === 'string' && input.linkedUserId
      ? validateLinkedUserAssignment(
          input.linkedUserId,
          input.teamId,
          input.currentPlayerId,
        )
      : null;

  if (
    !linkedUser &&
    input.preferredUser &&
    normalizedLinkedEmail &&
    normalizeEmail(input.preferredUser.email) === normalizedLinkedEmail
  ) {
    linkedUser = validateLinkedUserAssignment(
      input.preferredUser.id,
      input.teamId,
      input.currentPlayerId,
    );
  }

  if (!linkedUser && normalizedLinkedEmail) {
    const matchedUser = findUserByEmail(normalizedLinkedEmail);
    if (matchedUser) {
      linkedUser = validateLinkedUserAssignment(
        matchedUser.id,
        input.teamId,
        input.currentPlayerId,
      );
    }
  }

  return {
    linkedUser,
    linkedUserId: linkedUser?.id ?? null,
    linkedEmail: linkedUser
      ? normalizeEmail(linkedUser.email)
      : normalizedLinkedEmail || null,
  };
}

function createMembership(input: {
  userId: string;
  teamId: string;
  playerId: string | null;
  roles: TeamMember['roles'];
  canManageTeam: boolean;
  canManagePlayers: boolean;
}) {
  const createdAt = nowIso();

  return {
    id: createId('member'),
    userId: input.userId,
    teamId: input.teamId,
    playerId: input.playerId,
    inviteCodeUsed: null,
    roles: [...new Set(input.roles)],
    canManageTeam: input.canManageTeam,
    canManagePlayers: input.canManagePlayers,
    joinedAt: createdAt,
    status: 'active' as const,
    createdAt,
    updatedAt: createdAt,
  } satisfies TeamMember;
}

function createBasicPlayer(teamId: string, user: User) {
  const createdAt = nowIso();

  return {
    id: createId('player'),
    teamId,
    linkedUserId: user.id,
    linkedEmail: normalizeEmail(user.email),
    fullName: user.displayName.trim() || displayNameFromEmail(user.email),
    nickname: deriveNickname(user.displayName, user.email),
    photoUrl: null,
    presentationVideoUrl: null,
    jerseyNumber: nextJerseyNumber(teamId),
    primaryPosition: 'midfielder' as const,
    secondaryPositions: [],
    dominantFoot: 'right' as const,
    status: 'active' as const,
    bio: 'Conta conectada ao time.',
    preferredPosition: 'midfielder' as const,
    introVideoUrl: null,
    celebrationVideoUrl: null,
    manualStats: createEmptyManualStats(),
    createdAt,
    updatedAt: createdAt,
  } satisfies Player;
}

function buildDemoPlayers(teamId: string, owner: User): Player[] {
  const createdAt = nowIso();
  const captainId = createId('player');

  return [
    {
      id: captainId,
      teamId,
      linkedUserId: owner.id,
      linkedEmail: normalizeEmail(owner.email),
      fullName: owner.displayName,
      nickname: 'Capita',
      jerseyNumber: 8,
      primaryPosition: 'midfielder',
      secondaryPositions: ['attacking-midfielder'],
      dominantFoot: 'right',
      status: 'active',
      bio: 'Conta criada no onboarding do time.',
      preferredPosition: 'midfielder',
      manualStats: createEmptyManualStats(),
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: createId('player'),
      teamId,
      fullName: 'Leo Parede',
      nickname: 'Parede',
      jerseyNumber: 1,
      primaryPosition: 'goalkeeper',
      secondaryPositions: [],
      dominantFoot: 'right',
      status: 'active',
      preferredPosition: 'goalkeeper',
      manualStats: createEmptyManualStats(),
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: createId('player'),
      teamId,
      fullName: 'Breno Rocha',
      nickname: 'Rocha',
      jerseyNumber: 2,
      primaryPosition: 'right-back',
      secondaryPositions: ['wing-back'],
      dominantFoot: 'right',
      status: 'active',
      preferredPosition: 'right-back',
      manualStats: createEmptyManualStats(),
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: createId('player'),
      teamId,
      fullName: 'Igor Torres',
      nickname: 'Torres',
      jerseyNumber: 3,
      primaryPosition: 'center-back',
      secondaryPositions: ['left-back'],
      dominantFoot: 'left',
      status: 'active',
      preferredPosition: 'center-back',
      manualStats: createEmptyManualStats(),
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: createId('player'),
      teamId,
      fullName: 'Ruan Lima',
      nickname: 'Ruan',
      jerseyNumber: 5,
      primaryPosition: 'defensive-midfielder',
      secondaryPositions: ['midfielder'],
      dominantFoot: 'right',
      status: 'active',
      preferredPosition: 'defensive-midfielder',
      manualStats: createEmptyManualStats(),
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: createId('player'),
      teamId,
      fullName: 'Paulo Maestro',
      nickname: 'Maestro',
      jerseyNumber: 10,
      primaryPosition: 'attacking-midfielder',
      secondaryPositions: ['midfielder'],
      dominantFoot: 'both',
      status: 'active',
      preferredPosition: 'attacking-midfielder',
      manualStats: createEmptyManualStats(),
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: createId('player'),
      teamId,
      fullName: 'Guga Bolt',
      nickname: 'Bolt',
      jerseyNumber: 11,
      primaryPosition: 'winger',
      secondaryPositions: ['forward'],
      dominantFoot: 'right',
      status: 'active',
      preferredPosition: 'winger',
      manualStats: createEmptyManualStats(),
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: createId('player'),
      teamId,
      fullName: 'Caue Killer',
      nickname: 'Killer',
      jerseyNumber: 9,
      primaryPosition: 'striker',
      secondaryPositions: ['forward'],
      dominantFoot: 'right',
      status: 'active',
      preferredPosition: 'striker',
      manualStats: createEmptyManualStats(),
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: createId('player'),
      teamId,
      fullName: 'Neto Giro',
      nickname: 'Giro',
      jerseyNumber: 7,
      primaryPosition: 'midfielder',
      secondaryPositions: ['winger'],
      dominantFoot: 'left',
      status: 'active',
      preferredPosition: 'midfielder',
      manualStats: createEmptyManualStats(),
      createdAt,
      updatedAt: createdAt,
    },
  ];
}

function buildInitialMatch(team: Team, creator: User): Match {
  const createdAt = nowIso();

  return {
    id: createId('match'),
    teamId: team.id,
    seasonId: team.activeSeasonId ?? null,
    date: '2026-05-20',
    time: '20:00',
    venue: 'Arena do Bairro',
    opponentName: 'Time Convidado',
    linePlayersCount: 6,
    matchType: 'society',
    notes: 'Primeira partida criada no onboarding.',
    status: 'scheduled',
    createdBy: creator.id,
    createdAt,
    updatedAt: createdAt,
  };
}

function syncLinkedUser(
  player: Player,
  options?: { syncContext?: boolean },
) {
  if (!player.linkedUserId) {
    return;
  }

  const linkedUser = database.users.find((user) => user.id === player.linkedUserId);
  if (!linkedUser) {
    return;
  }

  const team = findTeam(player.teamId);
  const membership =
    findAnyMembershipByUserAndTeam(linkedUser.id, player.teamId) ??
    createMembership({
      userId: linkedUser.id,
      teamId: player.teamId,
      playerId: player.id,
      roles: team.adminUserId === linkedUser.id ? ['admin', 'player'] : ['player'],
      canManageTeam: team.adminUserId === linkedUser.id,
      canManagePlayers: team.adminUserId === linkedUser.id,
    });

  if (!database.teamMembers.some((item) => item.id === membership.id)) {
    database.teamMembers.push(membership);
  }

  membership.playerId = player.id;
  membership.status = 'active';
  if (!membership.roles.includes('player')) {
    membership.roles = [...membership.roles, 'player'];
  }
  membership.canManageTeam = membership.roles.includes('admin');
  membership.canManagePlayers = membership.roles.includes('admin');
  membership.updatedAt = nowIso();
  syncTeamMembershipIndexDocument(membership);
  linkedUser.teamId = player.teamId;
  linkedUser.playerId = player.id;
  linkedUser.activeTeamId = linkedUser.activeTeamId ?? player.teamId;
  linkedUser.appRole = resolveTeamAppRole(linkedUser, team);
  linkedUser.updatedAt = nowIso();
  player.linkedEmail = normalizeEmail(linkedUser.email);
  player.deletedAt = null;

  if (options?.syncContext !== false) {
    syncUserActiveContext(linkedUser);
  }
}

function unlinkPlayerFromUser(player: Player) {
  if (!player.linkedUserId) {
    return;
  }

  const linkedUser = database.users.find((user) => user.id === player.linkedUserId);
  if (!linkedUser) {
    player.linkedUserId = null;
    return;
  }

  if (linkedUser.playerId === player.id) {
    linkedUser.playerId = null;
  }

  const team = player.teamId ? findTeam(player.teamId) : null;
  const membership = team ? findMembershipByUserAndTeam(linkedUser.id, team.id) : null;
  if (membership?.playerId === player.id) {
    membership.playerId = null;
    membership.updatedAt = nowIso();
    syncTeamMembershipIndexDocument(membership);
  }
  linkedUser.appRole = resolveTeamAppRole(linkedUser, team);
  linkedUser.updatedAt = nowIso();
  player.linkedUserId = null;
  syncUserActiveContext(linkedUser);
}

function syncMvpMatchFields(matchId: string) {
  const match = findMatch(matchId);
  const summary = getMvpSummary(snapshotForTeam(match.teamId), matchId);
  const updatedAt = nowIso();

  match.mvpWinnerPlayerIds = summary.winnerPlayerIds;
  match.mvpTotalVotes = summary.totalVotes;
  match.updatedAt = updatedAt;

  return {
    match,
    summary,
    updatedAt,
  };
}

function syncMvpWinnerNotification(
  match: Match,
  actorUserId?: string | null,
  updatedAt = nowIso(),
) {
  const notificationId = buildNotificationId('mvp-winner', match.id);

  if (!match.mvpWinnerPlayerIds || match.mvpWinnerPlayerIds.length !== 1) {
    removeNotification(notificationId);
    return;
  }

  const winner = findPlayer(match.mvpWinnerPlayerIds[0]);
  const existing = findNotificationByIdForTeam(match.teamId, notificationId);

  upsertNotification(
    createMvpWinnerNotification({
      id: notificationId,
      teamId: match.teamId,
      match,
      winner,
      actorUserId,
      createdAt: existing?.createdAt,
      updatedAt,
    }),
  );
}

function allowedSelfUpdateFields(input: UpdatePlayerInput) {
  const invalid = getInvalidSelfPlayerProfileUpdateFields(
    input as Record<string, unknown>,
  );
  if (invalid.length > 0) {
    throw new Error(
      'Seu perfil permite editar apenas foto, apelido, bio, camisa quando liberada, posições, pé dominante e links de vídeo do jogador.',
    );
  }
}

function validateRatingCriteriaInput(
  criteria: TeamRatingCriterion[],
  input: SubmitPlayerRatingInput,
) {
  validateRatingCriteriaSubmission({
    activeCriteria: getActiveRatingCriteria(criteria),
    criteriaScores: input.criteriaScores,
  });
}

export const mockRepository: AppRepository = {
  getMode() {
    return 'mock';
  },

  async getInitialSnapshot() {
    for (const user of database.users) {
      syncUserActiveContext(user);
    }
    return snapshotFromDatabase(database, mockSessionUserId);
  },

  async getSnapshot() {
    for (const user of database.users) {
      syncUserActiveContext(user);
    }
    return snapshotFromDatabase(database, mockSessionUserId);
  },

  async listPublicTeams(actorUserId?: string | null) {
    void actorUserId;

    const publicTeams = database.publicTeams
      .map((team) => toPublicTeamSummary(team))
      .sort((left, right) => {
        const stateOrder = left.state.localeCompare(right.state);

        if (stateOrder !== 0) {
          return stateOrder;
        }

        const cityOrder = left.city.localeCompare(right.city);

        if (cityOrder !== 0) {
          return cityOrder;
        }

        return left.name.localeCompare(right.name);
      });

    return clone(publicTeams);
  },

  async getPublicTeamProfile(teamId: string, actorUserId?: string | null) {
    void actorUserId;
    const profile = findPublicTeamDocument(teamId);

    return clone(profile ? toPublicTeamProfile(profile) : null);
  },

  async login(input: LoginInput) {
    const email = normalizeEmail(input.email);
    const credential = database.credentials.find(
      (item) => normalizeEmail(item.email) === email && item.password === input.password,
    );

    if (!credential) {
      throw new Error('E-mail ou senha invalidos.');
    }

    const user = findUser(credential.userId);
    mockSessionUserId = user.id;
    syncUserActiveContext(user);
    return clone(user);
  },

  async loginWithGoogle(_input: GoogleLoginInput) {
    throw new Error('Esse acesso não está disponível nesta demonstração.');
  },

  async register(input: RegisterInput) {
    const email = normalizeEmail(input.email);

    if (database.credentials.some((item) => normalizeEmail(item.email) === email)) {
      throw new Error('Ja existe uma conta com este e-mail.');
    }

    const id = createId('user');
    const createdAt = nowIso();

    const user: User = {
      id,
      email,
      displayName: input.displayName.trim(),
      appRole: 'player',
      canCreateTeam: false,
      activeTeamId: null,
      teamId: null,
      playerId: null,
      avatarUrl: null,
      createdAt,
      updatedAt: createdAt,
    };

    database.users.push(user);
    database.credentials.push({ userId: id, email, password: input.password });
    mockSessionUserId = user.id;

    return clone(user);
  },

  async resetPassword() {
    return;
  },

  async createTeam(input: CreateTeamInput, adminUserId: string) {
    const owner = findUser(adminUserId);
    const ownedTeamsCount = getOwnedTeamsCount(adminUserId);

    if (!canCreateTeamFromOwnedTeamsCount(ownedTeamsCount)) {
      throw new Error(OWNED_TEAMS_LIMIT_REACHED_MESSAGE);
    }

    const createdAt = nowIso();
    const teamId = createId('team');
    const seasonId = createId('season');
    const inviteCode = createUniqueInviteCode();
    const ratingCriteria = createDefaultTeamRatingCriteria(teamId, createdAt);

    const team: Team = {
      id: teamId,
      name: input.name.trim(),
      slug: slugifyTeamName(input.name),
      logoUrl: input.logoUrl?.trim() || null,
      bannerUrl: input.bannerUrl?.trim() || null,
      presentationVideoUrl: input.presentationVideoUrl?.trim() || null,
      isPublic: false,
      city: null,
      state: null,
      neighborhood: null,
      homeFieldName: null,
      contactName: null,
      contactPhone: null,
      contactWhatsapp: null,
      publicDescription: null,
      allowFriendlyContact: false,
      publicRosterEnabled: false,
      primaryColor: input.primaryColor,
      secondaryColor: input.secondaryColor,
      accentColor: input.accentColor ?? null,
      description: input.description?.trim() ?? '',
      inviteCode,
      inviteCodeUpdatedAt: createdAt,
      coachName: input.coachName.trim(),
      adminUserId,
      activeSeasonId: seasonId,
      createdAt,
      updatedAt: createdAt,
    };

    const season = {
      id: seasonId,
      teamId,
      name: `Temporada ${new Date().getFullYear()}`,
      year: new Date().getFullYear(),
      startDate: `${new Date().getFullYear()}-01-01`,
      endDate: `${new Date().getFullYear()}-12-31`,
      status: 'active' as const,
      createdAt,
      updatedAt: createdAt,
    };

    const players = buildDemoPlayers(teamId, owner);
    const match = buildInitialMatch(team, owner);
    const attendance = players.map<AttendanceRecord>((player) => ({
      id: createId('attendance'),
      teamId,
      matchId: match.id,
      playerId: player.id,
      userId: player.linkedUserId ?? null,
      status: 'pending',
      createdAt,
      updatedAt: createdAt,
    }));
    const ownerMembership = createMembership({
      userId: owner.id,
      teamId,
      playerId: players[0]?.id ?? null,
      roles: ['admin', 'player'],
      canManageTeam: true,
      canManagePlayers: true,
    });
    ownerMembership.joinedAt = createdAt;
    ownerMembership.createdAt = createdAt;
    ownerMembership.updatedAt = createdAt;

    owner.activeTeamId = teamId;
    owner.teamId = teamId;
    owner.playerId = players[0]?.id ?? null;
    owner.appRole = owner.appRole === 'owner' ? 'owner' : 'team_admin';
    owner.updatedAt = createdAt;

    database.teams.push(team);
    syncTeamInviteProjection(team, createdAt);
    database.teamMembers.push(ownerMembership);
    syncTeamMembershipIndexDocument(ownerMembership);
    database.seasons.push(season);
    database.ratingCriteria.push(...ratingCriteria);
    database.players.push(...players);
    database.matches.push(match);
    database.attendance.push(...attendance);

    for (const player of players) {
      syncLinkedUser(player);
    }

    return clone(team);
  },

  async updateTeam(teamId: string, input: UpdateTeamInput, actorUserId: string) {
    requireTeamAdmin(actorUserId, teamId);
    const team = findTeam(teamId);
    const updatedAt = nowIso();
    const publicProfile = normalizeTeamPublicProfileFields({
      isPublic: input.isPublic ?? team.isPublic,
      city: input.city !== undefined ? input.city : team.city,
      state: input.state !== undefined ? input.state : team.state,
      neighborhood:
        input.neighborhood !== undefined ? input.neighborhood : team.neighborhood,
      homeFieldName:
        input.homeFieldName !== undefined ? input.homeFieldName : team.homeFieldName,
      contactName: input.contactName !== undefined ? input.contactName : team.contactName,
      contactPhone: input.contactPhone !== undefined ? input.contactPhone : team.contactPhone,
      contactWhatsapp:
        input.contactWhatsapp !== undefined ? input.contactWhatsapp : team.contactWhatsapp,
      publicDescription:
        input.publicDescription !== undefined
          ? input.publicDescription
          : team.publicDescription,
      allowFriendlyContact:
        input.allowFriendlyContact !== undefined
          ? input.allowFriendlyContact
          : team.allowFriendlyContact,
      publicRosterEnabled:
        input.publicRosterEnabled !== undefined
          ? input.publicRosterEnabled
          : team.publicRosterEnabled,
    });

    validateTeamPublicProfileFields(publicProfile);

    team.name = input.name.trim();
    team.coachName = input.coachName.trim();
    team.slug = slugifyTeamName(input.slug.trim() || input.name);
    team.logoUrl = input.logoUrl?.trim() || null;
    team.bannerUrl =
      input.bannerUrl !== undefined ? input.bannerUrl?.trim() || null : team.bannerUrl ?? null;
    team.presentationVideoUrl =
      input.presentationVideoUrl !== undefined
        ? input.presentationVideoUrl?.trim() || null
        : team.presentationVideoUrl ?? null;
    team.primaryColor = input.primaryColor;
    team.secondaryColor = input.secondaryColor;
    team.accentColor = input.accentColor ?? null;
    team.description = input.description?.trim() ?? '';
    team.isPublic = publicProfile.isPublic;
    team.city = publicProfile.city;
    team.state = publicProfile.state;
    team.neighborhood = publicProfile.neighborhood;
    team.homeFieldName = publicProfile.homeFieldName;
    team.contactName = publicProfile.contactName;
    team.contactPhone = publicProfile.contactPhone;
    team.contactWhatsapp = publicProfile.contactWhatsapp;
    team.publicDescription = publicProfile.publicDescription;
    team.allowFriendlyContact = publicProfile.allowFriendlyContact;
    team.publicRosterEnabled = publicProfile.publicRosterEnabled;
    team.updatedAt = updatedAt;
    syncPublicTeamProjection(team.id, updatedAt);

    return clone(team);
  },

  async deleteTeamPermanently(teamId: string, actorUserId: string) {
    requireTeamOwner(actorUserId, teamId);

    const updatedAt = nowIso();
    const deletedPlayerIds = new Set(
      database.players
        .filter((player) => player.teamId === teamId)
        .map((player) => player.id),
    );
    const affectedUserIds = new Set([
      ...database.teamMembers
        .filter((membership) => membership.teamId === teamId)
        .map((membership) => membership.userId),
      ...database.users
        .filter(
          (user) =>
            user.activeTeamId === teamId ||
            user.teamId === teamId ||
            (user.playerId ? deletedPlayerIds.has(user.playerId) : false),
        )
        .map((user) => user.id),
    ]);

    database.teams = database.teams.filter((team) => team.id !== teamId);
    database.publicTeams = database.publicTeams.filter((team) => team.id !== teamId);
    removeTeamInviteProjection(teamId);
    database.teamMembers = database.teamMembers.filter((membership) => membership.teamId !== teamId);
    database.teamMembershipIndex = database.teamMembershipIndex.filter(
      (membership) => membership.teamId !== teamId,
    );
    database.players = database.players.filter((player) => player.teamId !== teamId);
    database.matches = database.matches.filter((match) => match.teamId !== teamId);
    database.lineups = database.lineups.filter((lineup) => lineup.teamId !== teamId);
    database.attendance = database.attendance.filter((record) => record.teamId !== teamId);
    database.matchStats = database.matchStats.filter((stat) => stat.teamId !== teamId);
    database.matchDiaryEntries = database.matchDiaryEntries.filter((entry) => entry.teamId !== teamId);
    database.mvpVotes = database.mvpVotes.filter((vote) => vote.teamId !== teamId);
    database.playerRatings = database.playerRatings.filter((rating) => rating.teamId !== teamId);
    database.ratingCriteria = database.ratingCriteria.filter((criterion) => criterion.teamId !== teamId);
    database.notifications = database.notifications.filter((notification) => notification.teamId !== teamId);
    database.seasons = database.seasons.filter((season) => season.teamId !== teamId);

    for (const userId of affectedUserIds) {
      const user = database.users.find((item) => item.id === userId);

      if (!user) {
        continue;
      }

      const nextMembership = syncUserActiveContext(user);
      user.appRole = resolveTeamAppRole(user, nextMembership ? findTeam(nextMembership.teamId) : null);
      user.updatedAt = updatedAt;
    }
  },

  async regenerateTeamInviteCode(teamId: string, actorUserId: string) {
    requireTeamAdmin(actorUserId, teamId);
    const team = findTeam(teamId);
    const updatedAt = nowIso();

    team.inviteCode = createUniqueInviteCode(team.id);
    team.inviteCodeUpdatedAt = updatedAt;
    team.updatedAt = updatedAt;
    syncTeamInviteProjection(team, updatedAt);

    return clone(team);
  },

  async createRatingCriterion(input: CreateRatingCriterionInput, actorUserId: string) {
    const { activeTeamId } = ensureActiveTeamContext(actorUserId);
    requireTeamAdmin(actorUserId, activeTeamId);
    const now = nowIso();
    const existingCriteria = syncRatingCriteriaOrder(activeTeamId);
    const activeCount = getActiveRatingCriteria(existingCriteria).length;
    const shouldActivate = input.active !== false;

    if (shouldActivate && activeCount >= 12) {
      throw new Error('Use no máximo 12 critérios ativos por time.');
    }

    const nextCriterion = normalizeTeamRatingCriterion({
      id: createId('criterion'),
      teamId: activeTeamId,
      label: input.label,
      description: input.description ?? null,
      type: input.type,
      weight: input.weight ?? 1,
      active: shouldActivate,
      order: existingCriteria.length,
      createdAt: now,
      updatedAt: now,
    });

    replaceTeamRatingCriteria(activeTeamId, [...existingCriteria, nextCriterion]);
    validateActiveRatingCriteria(syncRatingCriteriaOrder(activeTeamId));
    return clone(findRatingCriterionForTeam(activeTeamId, nextCriterion.id)!);
  },

  async updateRatingCriterion(
    criterionId: string,
    input: UpdateRatingCriterionInput,
    actorUserId: string,
  ) {
    const { activeTeamId } = ensureActiveTeamContext(actorUserId);
    requireTeamAdmin(actorUserId, activeTeamId);
    const criterion = findRatingCriterionForTeam(activeTeamId, criterionId);

    if (!criterion) {
      throw new Error('Critério de avaliação não encontrado.');
    }

    const updatedCriterion = normalizeTeamRatingCriterion({
      ...criterion,
      label: input.label ?? criterion.label,
      description:
        input.description !== undefined ? input.description : criterion.description ?? null,
      type: input.type ?? criterion.type,
      weight: input.weight ?? criterion.weight,
      active: input.active ?? criterion.active,
      order: input.order ?? criterion.order,
      updatedAt: nowIso(),
    });
    const currentCriteria = findRatingCriteriaForTeam(activeTeamId).map((item) =>
      item.id === criterion.id ? updatedCriterion : item,
    );
    const normalizedCriteria = normalizeRatingCriteriaOrder(currentCriteria);
    const activeCount = getActiveRatingCriteria(normalizedCriteria).length;

    if (updatedCriterion.active && activeCount > 12) {
      throw new Error('Use no máximo 12 critérios ativos por time.');
    }

    validateActiveRatingCriteria(normalizedCriteria);
    replaceTeamRatingCriteria(activeTeamId, normalizedCriteria);

    return clone(findRatingCriterionForTeam(activeTeamId, criterion.id)!);
  },

  async deleteRatingCriterion(criterionId: string, actorUserId: string) {
    const { activeTeamId } = ensureActiveTeamContext(actorUserId);
    requireTeamAdmin(actorUserId, activeTeamId);
    const criterion = findRatingCriterionForTeam(activeTeamId, criterionId);

    if (!criterion) {
      throw new Error('Critério de avaliação não encontrado.');
    }

    const usedCount = countRatingCriterionUsage(
      database.playerRatings.filter((rating) => rating.teamId === activeTeamId),
      criterion.id,
    );

    if (usedCount > 0) {
      const nextCriteria = findRatingCriteriaForTeam(activeTeamId).map((item) =>
        item.id === criterion.id
          ? normalizeTeamRatingCriterion({
              ...item,
              active: false,
              updatedAt: nowIso(),
            })
          : item,
      );
      validateActiveRatingCriteria(nextCriteria);
      replaceTeamRatingCriteria(activeTeamId, normalizeRatingCriteriaOrder(nextCriteria));
      return;
    }

    const nextCriteria = findRatingCriteriaForTeam(activeTeamId).filter(
      (item) => item.id !== criterion.id,
    );
    validateActiveRatingCriteria(nextCriteria);
    replaceTeamRatingCriteria(activeTeamId, normalizeRatingCriteriaOrder(nextCriteria));
  },

  async setActiveTeam(teamId: string, userId: string) {
    const user = findUser(userId);
    const membership = findMembershipByUserAndTeam(user.id, teamId);

    if (!membership) {
      throw new Error('Você ainda não participa desse time.');
    }

    user.activeTeamId = membership.teamId;
    user.teamId = membership.teamId;
    user.playerId = membership.playerId;
    user.appRole = resolveTeamAppRole(user, findTeam(membership.teamId));
    user.updatedAt = nowIso();
    mockSessionUserId = user.id;

    return clone(user);
  },

  async joinTeamWithInviteCode(inviteCode: string, userId: string) {
    const actor = findUser(userId);
    const invite = findTeamInviteDocument(inviteCode);
    if (!invite) {
      throw new Error('Não encontramos um time com esse código.');
    }

    const team = findTeam(invite.teamId);
    const teamPlayers = findTeamPlayers(team.id);
    const existingMembership = findAnyMembershipByUserAndTeam(actor.id, team.id);
    if (existingMembership?.status === 'active') {
      existingMembership.updatedAt = nowIso();
      actor.activeTeamId = team.id;
      actor.teamId = team.id;
      actor.playerId = existingMembership.playerId;
      actor.appRole = resolveTeamAppRole(actor, team);
      actor.updatedAt = nowIso();
      const initialResolution = resolvePlayerForUserWithDiagnostics({
        teamPlayers,
        teamId: team.id,
        user: actor,
        membership: existingMembership,
      });
      const linkedPlayer = existingMembership.roles.includes('player')
        ? ensureMembershipPlayerLink({
            user: actor,
            membership: existingMembership,
            team,
            teamPlayers,
          })
        : null;

      return {
        team: clone(team),
        alreadyMember: true,
        playerLink: buildJoinTeamPlayerLinkResolution({
          linkedPlayer,
          source:
            initialResolution.player && initialResolution.source !== 'unresolved'
              ? initialResolution.source
              : null,
          suggestions: linkedPlayer
            ? []
            : suggestPlayerLinksForUser({
                teamPlayers,
                teamId: team.id,
                user: actor,
              }),
        }),
      };
    }

    const updatedAt = nowIso();
    const membership =
      existingMembership ??
      createMembership({
        userId: actor.id,
        teamId: team.id,
        playerId: null,
        roles: ['player'],
        canManageTeam: false,
        canManagePlayers: false,
      });

    membership.playerId = existingMembership?.playerId ?? null;
    membership.inviteCodeUsed = invite.code;
    membership.roles = existingMembership?.roles.includes('admin')
      ? ['admin', 'player']
      : ['player'];
    membership.canManageTeam = existingMembership?.canManageTeam ?? false;
    membership.canManagePlayers = existingMembership?.canManagePlayers ?? false;
    membership.status = 'active';
    membership.joinedAt = existingMembership?.joinedAt ?? updatedAt;
    membership.createdAt = existingMembership?.createdAt ?? updatedAt;
    membership.updatedAt = updatedAt;

    if (!existingMembership) {
      database.teamMembers.push(membership);
    }
    syncTeamMembershipIndexDocument(membership);

    actor.activeTeamId = team.id;
    actor.teamId = team.id;
    actor.playerId = membership.playerId ?? null;
    actor.appRole =
      actor.appRole === 'owner'
        ? 'owner'
        : membership.canManageTeam
          ? 'team_admin'
          : 'player';
    actor.updatedAt = updatedAt;
    const initialResolution = resolvePlayerForUserWithDiagnostics({
      teamPlayers,
      teamId: team.id,
      user: actor,
      membership,
    });
    const linkedPlayer = ensureMembershipPlayerLink({
      user: actor,
      membership,
      team,
      teamPlayers,
    });

    return {
      team: clone(team),
      alreadyMember: false,
      playerLink: buildJoinTeamPlayerLinkResolution({
        linkedPlayer,
        source:
          initialResolution.player && initialResolution.source !== 'unresolved'
            ? initialResolution.source
            : null,
        suggestions: linkedPlayer
          ? []
          : suggestPlayerLinksForUser({
              teamPlayers,
              teamId: team.id,
              user: actor,
            }),
      }),
    };
  },

  async createPlayer(input: CreatePlayerInput, actorUserId: string) {
    const actor = requirePlayerManager(actorUserId, input.teamId);
    assertJerseyAvailable(input.teamId, input.jerseyNumber);
    const explicitLinkedUser = input.linkedUserId
      ? validateLinkedUserAssignment(input.linkedUserId, input.teamId)
      : null;
    const linkedEmail = validateLinkedEmailAvailability(
      input.teamId,
      explicitLinkedUser?.email ?? input.linkedEmail,
    );
    const linkResult = linkPlayerToUserIfEmailMatches({
      teamId: input.teamId,
      player: {
        linkedUserId: null,
        linkedEmail,
      },
      linkedUserId: input.linkedUserId ?? null,
      linkedEmail,
      preferredUser: explicitLinkedUser ?? actor,
    });

    const createdAt = nowIso();
    const player: Player = {
      id: createId('player'),
      teamId: input.teamId,
      linkedUserId: linkResult.linkedUserId,
      linkedEmail: linkResult.linkedEmail,
      fullName: input.fullName.trim(),
      nickname: input.nickname.trim(),
      photoUrl: input.photoUrl ?? null,
      presentationVideoUrl: input.presentationVideoUrl ?? null,
      jerseyNumber: input.jerseyNumber,
      primaryPosition: input.primaryPosition,
      secondaryPositions: sanitizeSecondaryPositions(
        input.primaryPosition,
        input.secondaryPositions,
      ),
      dominantFoot: input.dominantFoot,
      status: input.status,
      bio: input.bio?.trim() ?? '',
      preferredPosition: input.preferredPosition ?? input.primaryPosition,
      introVideoUrl: input.introVideoUrl ?? null,
      celebrationVideoUrl: input.celebrationVideoUrl ?? null,
      allowSelfEditJerseyNumber: input.allowSelfEditJerseyNumber ?? false,
      manualStats: normalizeManualStats(input.manualStats),
      deletedAt: null,
      createdAt,
      updatedAt: createdAt,
    };

    database.players.push(player);
    syncLinkedUser(player);
    ensureOpenMatchAttendanceForPlayer(player);

    return clone(player);
  },

  async updatePlayer(playerId: string, input: UpdatePlayerInput, actorUserId: string) {
    const player = findPlayer(playerId);
    const actor = findUser(actorUserId);
    const createdAt = nowIso();
    syncUserActiveContext(actor);
    const membership = findMembershipByUserAndTeam(actor.id, player.teamId);

    if (actor.teamId === player.teamId && membership?.canManagePlayers) {
      if (
        !membership.canManageTeam &&
        touchesRestrictedPlayerAdminFields(player, {
          status: input.status,
          linkedUserId: input.linkedUserId,
          linkedEmail: input.linkedEmail,
        })
      ) {
        throw new Error(
          'Apenas o administrador do time pode alterar o status ou o vinculo da conta do jogador.',
        );
      }

      const previousLinkedUserId = player.linkedUserId ?? null;

      if (typeof input.jerseyNumber === 'number') {
        assertJerseyAvailable(player.teamId, input.jerseyNumber, player.id);
      }

      const explicitLinkedUser =
        typeof input.linkedUserId === 'string'
          ? validateLinkedUserAssignment(input.linkedUserId, player.teamId, player.id)
          : null;

      const nextLinkedEmail = validateLinkedEmailAvailability(
        player.teamId,
        explicitLinkedUser?.email ??
          (input.linkedEmail !== undefined ? input.linkedEmail : player.linkedEmail),
        player.id,
      );

      if (input.linkedUserId === null && player.linkedUserId) {
        unlinkPlayerFromUser(player);
      }

      if (
        typeof input.linkedUserId === 'string' &&
        previousLinkedUserId &&
        previousLinkedUserId !== input.linkedUserId
      ) {
        unlinkPlayerFromUser(player);
      }

      const linkResult = linkPlayerToUserIfEmailMatches({
        teamId: player.teamId,
        player,
        linkedUserId:
          input.linkedUserId !== undefined
            ? input.linkedUserId
            : player.linkedUserId ?? null,
        linkedEmail:
          input.linkedEmail !== undefined
            ? nextLinkedEmail
            : player.linkedEmail ?? nextLinkedEmail,
        currentPlayerId: player.id,
        preferredUser: explicitLinkedUser ?? actor,
      });

      if (typeof input.fullName === 'string') {
        player.fullName = input.fullName.trim();
      }
      if (typeof input.nickname === 'string') {
        player.nickname = input.nickname.trim();
      }
      if (input.photoUrl !== undefined) {
        player.photoUrl = input.photoUrl;
      }
      if (input.presentationVideoUrl !== undefined) {
        player.presentationVideoUrl = input.presentationVideoUrl;
      }
      if (typeof input.jerseyNumber === 'number') {
        player.jerseyNumber = input.jerseyNumber;
      }
      if (input.primaryPosition) {
        player.primaryPosition = input.primaryPosition;
      }
      if (input.secondaryPositions) {
        player.secondaryPositions = sanitizeSecondaryPositions(
          input.primaryPosition ?? player.primaryPosition,
          input.secondaryPositions,
        );
      }
      if (input.dominantFoot) {
        player.dominantFoot = input.dominantFoot;
      }
      if (input.status) {
        player.status = input.status;
        if (input.status !== 'inactive') {
          player.deletedAt = null;
        }
      }
      if (input.bio !== undefined) {
        player.bio = input.bio?.trim() ?? '';
      }
      if (input.preferredPosition !== undefined) {
        player.preferredPosition = input.preferredPosition;
      }
      if (input.introVideoUrl !== undefined) {
        player.introVideoUrl = input.introVideoUrl;
      }
      if (input.celebrationVideoUrl !== undefined) {
        player.celebrationVideoUrl = input.celebrationVideoUrl;
      }
      if (input.allowSelfEditJerseyNumber !== undefined) {
        player.allowSelfEditJerseyNumber = input.allowSelfEditJerseyNumber;
      }
      player.linkedUserId = linkResult.linkedUserId;
      player.linkedEmail = linkResult.linkedEmail;
      if (input.manualStats !== undefined) {
        player.manualStats = normalizeManualStats(input.manualStats);
      }
    } else {
      const accessResult = resolveOwnPlayerProfileAccess({
        teamId: player.teamId,
        user: actor,
        membership,
        player,
        teamPlayers: findTeamPlayers(player.teamId),
      });

      if (!accessResult.allowed) {
        logOwnPlayerProfileAccess(
          'mock-repository.updatePlayer',
          {
            teamId: player.teamId,
            user: actor,
            membership,
            player,
          },
          accessResult,
        );
        throw new Error('Você não tem permissão para editar esse jogador.');
      }

      allowedSelfUpdateFields(input);

      if (typeof input.nickname === 'string') {
        player.nickname = input.nickname.trim();
      }
      if (input.photoUrl !== undefined) {
        player.photoUrl = input.photoUrl;
      }
      if (input.bio !== undefined) {
        player.bio = input.bio?.trim() ?? '';
      }
      if (
        typeof input.jerseyNumber === 'number' &&
        (player.allowSelfEditJerseyNumber || !player.jerseyNumber)
      ) {
        assertJerseyAvailable(player.teamId, input.jerseyNumber, player.id);
        player.jerseyNumber = input.jerseyNumber;
      }
      if (input.secondaryPositions) {
        player.secondaryPositions = sanitizeSecondaryPositions(
          player.primaryPosition,
          input.secondaryPositions,
        );
      }
      if (input.dominantFoot) {
        player.dominantFoot = input.dominantFoot;
      }
      if (input.preferredPosition !== undefined) {
        player.preferredPosition = input.preferredPosition;
      }
      if (input.introVideoUrl !== undefined) {
        player.introVideoUrl = input.introVideoUrl;
      }
      if (input.celebrationVideoUrl !== undefined) {
        player.celebrationVideoUrl = input.celebrationVideoUrl;
      }
    }

    player.updatedAt = createdAt;
    syncLinkedUser(player);
    ensureOpenMatchAttendanceForPlayer(player);

    return clone(player);
  },

  async unlinkPlayerAccount(playerId: string, actorUserId: string) {
    const player = findPlayer(playerId);
    requireTeamAdmin(actorUserId, player.teamId);

    if (!player.linkedUserId && !player.linkedEmail) {
      return clone(player);
    }

    const updatedAt = nowIso();
    unlinkPlayerFromUser(player);
    const updatedPlayer = buildUnlinkedPlayerState(player, updatedAt);

    player.linkedUserId = updatedPlayer.linkedUserId;
    player.linkedEmail = updatedPlayer.linkedEmail;
    player.updatedAt = updatedPlayer.updatedAt;

    return clone(player);
  },

  async removePlayer(playerId: string, actorUserId: string) {
    const player = findPlayer(playerId);
    requireTeamAdmin(actorUserId, player.teamId);

    if (player.deletedAt || player.status === 'inactive') {
      throw new Error('Esse jogador já está fora do elenco ativo.');
    }

    const updatedAt = nowIso();
    const linkedUserId = player.linkedUserId ?? null;
    const team = findTeam(player.teamId);

    Object.assign(player, buildInactivatedPlayerState(player, updatedAt));

    if (linkedUserId) {
      const linkedUser = findUser(linkedUserId);
      const membership = findAnyMembershipByUserAndTeam(linkedUser.id, team.id);

      if (membership) {
        const keepAdminAccess = membership.roles.includes('admin');
        membership.playerId = null;
        membership.roles = keepAdminAccess
          ? membership.roles.filter((role) => role !== 'player')
          : [];
        membership.canManageTeam = keepAdminAccess;
        membership.canManagePlayers = keepAdminAccess;
        membership.status = keepAdminAccess ? 'active' : 'inactive';
        membership.updatedAt = updatedAt;
        syncTeamMembershipIndexDocument(membership);
      }

      syncUserActiveContext(linkedUser);
      linkedUser.appRole = resolveTeamAppRole(
        linkedUser,
        linkedUser.activeTeamId ? findTeam(linkedUser.activeTeamId) : null,
      );
      linkedUser.updatedAt = updatedAt;
    }

    const futureMatchIds = new Set(
      database.matches
        .filter(
          (match) =>
            match.teamId === player.teamId &&
            match.status !== 'finished' &&
            match.status !== 'canceled',
        )
        .map((match) => match.id),
    );

    database.attendance = database.attendance.filter(
      (item) => !(item.playerId === player.id && futureMatchIds.has(item.matchId)),
    );

    for (const lineup of database.lineups.filter((item) => futureMatchIds.has(item.matchId))) {
      lineup.starters = lineup.starters.filter((starter) => starter.playerId !== player.id);
      lineup.benchPlayerIds = lineup.benchPlayerIds.filter((benchPlayerId) => benchPlayerId !== player.id);
      lineup.updatedAt = updatedAt;
    }

    return clone(player);
  },

  async reactivatePlayer(playerId: string, actorUserId: string) {
    const player = findPlayer(playerId);
    requireTeamAdmin(actorUserId, player.teamId);

    if (player.status !== 'inactive' && !player.deletedAt) {
      throw new Error('Esse jogador ja esta ativo no elenco.');
    }

    const explicitLinkedUser = player.linkedUserId
      ? validateLinkedUserAssignment(player.linkedUserId, player.teamId, player.id)
      : null;
    const nextLinkedEmail = validateLinkedEmailAvailability(
      player.teamId,
      explicitLinkedUser?.email ?? player.linkedEmail,
      player.id,
    );
    const linkResult = linkPlayerToUserIfEmailMatches({
      teamId: player.teamId,
      player,
      linkedUserId: player.linkedUserId ?? null,
      linkedEmail: nextLinkedEmail,
      currentPlayerId: player.id,
      preferredUser: explicitLinkedUser,
    });
    const updatedAt = nowIso();

    player.linkedUserId = linkResult.linkedUserId;
    player.linkedEmail = linkResult.linkedEmail;
    Object.assign(player, buildReactivatedPlayerState(player, updatedAt));

    syncLinkedUser(player);
    ensureOpenMatchAttendanceForPlayer(player);

    return clone(player);
  },

  async createMatch(input: CreateMatchInput, creatorUserId: string) {
    const createdAt = nowIso();
    const creator = requireTeamAdmin(creatorUserId, input.teamId);

    const match: Match = {
      id: createId('match'),
      teamId: input.teamId,
      seasonId: input.seasonId ?? null,
      date: input.date,
      time: input.time,
      venue: input.venue.trim(),
      locationUrl: input.locationUrl?.trim() || null,
      opponentName: input.opponentName.trim(),
      opponentLogoUrl: input.opponentLogoUrl ?? null,
      opponentTeamId: input.opponentTeamId ?? null,
      opponentTeamName: input.opponentTeamName ?? null,
      opponentTeamLogoUrl: input.opponentTeamLogoUrl ?? null,
      opponentSource: input.opponentSource ?? null,
      linePlayersCount: input.linePlayersCount,
      matchType: input.matchType,
      notes: input.notes?.trim() ?? '',
      status: 'scheduled',
      createdBy: creator.id,
      createdAt,
      updatedAt: createdAt,
      finishedAt: null,
      mvpWinnerPlayerIds: [],
      mvpTotalVotes: 0,
    };

    const attendance = findSelectableTeamPlayers(input.teamId).map<AttendanceRecord>((player) => ({
      id: buildStableDocumentId(match.id, player.id),
      teamId: input.teamId,
      matchId: match.id,
      playerId: player.id,
      userId: player.linkedUserId ?? null,
      status: 'pending',
      createdAt,
      updatedAt: createdAt,
    }));

    database.matches.push(match);
    database.attendance.push(...attendance);
    upsertNotification(
      createMatchCreatedNotification({
        id: buildNotificationId('match-created', match.id),
        teamId: match.teamId,
        match,
        actorUserId: creator.id,
        updatedAt: createdAt,
      }),
    );

    return clone(match);
  },

  async updateMatch(matchId: string, input: UpdateMatchInput, actorUserId: string) {
    const { actor, activeTeamId } = ensureActiveTeamContext(actorUserId);
    const match = findMatchForTeam(activeTeamId, matchId);
    requireTeamAdmin(actorUserId, match.teamId);
    const updatedAt = nowIso();
    const nextStatus = input.status ?? match.status;

    match.seasonId = input.seasonId ?? match.seasonId ?? null;
    match.date = input.date;
    match.time = input.time;
    match.venue = input.venue.trim();
    match.locationUrl = input.locationUrl?.trim() || null;
    match.opponentName = input.opponentName.trim();
    match.opponentLogoUrl =
      input.opponentLogoUrl !== undefined
        ? input.opponentLogoUrl
        : match.opponentLogoUrl ?? null;
    match.opponentTeamId =
      input.opponentTeamId !== undefined ? input.opponentTeamId : match.opponentTeamId ?? null;
    match.opponentTeamName =
      input.opponentTeamName !== undefined
        ? input.opponentTeamName
        : match.opponentTeamName ?? null;
    match.opponentTeamLogoUrl =
      input.opponentTeamLogoUrl !== undefined
        ? input.opponentTeamLogoUrl
        : match.opponentTeamLogoUrl ?? null;
    match.opponentSource =
      input.opponentSource !== undefined ? input.opponentSource : match.opponentSource ?? null;
    match.linePlayersCount = input.linePlayersCount;
    match.matchType = input.matchType;
    match.notes = input.notes?.trim() ?? '';
    match.fieldCost =
      input.fieldCost !== undefined ? input.fieldCost : match.fieldCost ?? null;
    if (input.fieldCost === null) {
      match.fieldPayment = null;
    } else {
      match.fieldPayment = match.fieldPayment ?? null;
    }
    match.status = nextStatus;
    if (nextStatus === 'canceled') {
      match.scoreboard = null;
      match.finishedAt = null;
    }
    match.updatedAt = updatedAt;

    const notificationId = buildNotificationId('match-updated', match.id);
    const existing = findNotificationByIdForTeam(match.teamId, notificationId);
    upsertNotification(
      createMatchUpdatedNotification({
        id: notificationId,
        teamId: match.teamId,
        match,
        actorUserId: actor.id,
        createdAt: existing?.createdAt,
        updatedAt,
      }),
    );

    return clone(match);
  },

  async updateMatchMetadata(matchId: string, input: UpdateMatchMetadataInput, actorUserId: string) {
    const { activeTeamId } = ensureActiveTeamContext(actorUserId);
    const match = findMatchForTeam(activeTeamId, matchId);
    requireTeamAdmin(actorUserId, match.teamId);

    if (match.deletedAt) {
      throw new Error('Esta partida foi excluída e não pode ser editada.');
    }

    const updatedAt = nowIso();
    match.date = input.date;
    match.time = input.time;
    match.venue = input.venue.trim();
    match.locationUrl = input.locationUrl?.trim() || null;
    match.matchType = input.matchType;
    match.updatedAt = updatedAt;
  },

  async updateMatchFieldPayment(
    matchId: string,
    input: UpdateMatchFieldPaymentInput,
    actorUserId: string,
  ) {
    const { activeTeamId } = ensureActiveTeamContext(actorUserId);
    const match = findMatchForTeam(activeTeamId, matchId);
    requireTeamAdmin(actorUserId, match.teamId);

    if (!match.fieldCost) {
      throw new Error('Informe o valor do campo antes de controlar pagamentos.');
    }

    const updatedAt = nowIso();
    const confirmedPlayerIds = getConfirmedPlayerIds(snapshotForTeam(activeTeamId), match.id);

    match.fieldPayment = input.fieldPayment
      ? buildMatchFieldPayment({
          values: input.fieldPayment,
          fieldCost: match.fieldCost,
          confirmedPlayerIds,
          updatedAt,
          updatedByUserId: actorUserId,
        })
      : null;
    match.updatedAt = updatedAt;

    return clone(match);
  },

  async updateAttendance(input: UpdateAttendanceInput, actorUserId: string) {
    const { actor, membership, activeTeamId, preRepairMembershipPlayerId } = ensureActiveTeamContext(actorUserId);
    const currentPlayerId = membership.roles.includes('player')
      ? ensureCurrentUserPlayerForActiveTeam(actorUserId)
      : null;
    const match = findMatchForTeam(activeTeamId, input.matchId);
    const now = nowIso();

    if (match.status === 'finished' || match.status === 'canceled') {
      throw new Error('A presença desta partida não aceita mais alterações.');
    }

    const player = ensurePlayerBelongsToTeam(input.playerId, match.teamId);

    const canManageAttendance = membership.canManageTeam === true;
    const isOwnAttendance =
      currentPlayerId === player.id ||
      (currentPlayerId === null && preRepairMembershipPlayerId === player.id);

    if (!canManageAttendance && !isOwnAttendance) {
      throw new Error('Você só pode responder à sua própria presença.');
    }

    if (isOwnAttendance && !canManageAttendance && preRepairMembershipPlayerId !== player.id) {
      throw new Error(
        'Seu perfil de jogador ainda não está vinculado ao seu login. Peça ao administrador do time para concluir esse vínculo antes de confirmar presença.',
      );
    }

    let record = findAttendanceForMatch(activeTeamId, input.matchId).find(
      (item) => item.playerId === input.playerId,
    );
    const attendanceId = buildStableDocumentId(match.id, player.id);

    if (!record) {
      record = {
        id: attendanceId,
        teamId: match.teamId,
        matchId: input.matchId,
        playerId: input.playerId,
        userId: isOwnAttendance ? actor.id : findPlayer(input.playerId).linkedUserId ?? null,
        status: input.status,
        createdAt: now,
        updatedAt: now,
        respondedAt: now,
      };

      database.attendance.push(record);
    } else {
      record.userId =
        isOwnAttendance ? actor.id : record.userId ?? findPlayer(input.playerId).linkedUserId ?? null;
      record.status = input.status;
      record.respondedAt = now;
      record.updatedAt = now;
    }

    if (canManageAttendance) {
      const notificationId = buildNotificationId('attendance-confirmed', match.id, player.id);
      if (input.status === 'confirmed' || input.status === 'absent') {
        const existing = findNotificationByIdForTeam(match.teamId, notificationId);
        upsertNotification(
          createAttendanceNotification({
            id: notificationId,
            teamId: match.teamId,
            match,
            player,
            status: input.status,
            actorUserId: actor.id,
            createdAt: existing?.createdAt,
            updatedAt: now,
          }),
        );
      } else {
        removeNotification(notificationId);
      }
    }

    return clone(record);
  },

  async saveLineup(input: SaveLineupInput, actorUserId: string) {
    const { actor, activeTeamId } = ensureActiveTeamContext(actorUserId);
    const match = findMatchForTeam(activeTeamId, input.matchId);
    requireTeamAdmin(actorUserId, match.teamId);
    const now = nowIso();
    const existing = findLineupForTeam(activeTeamId, input.matchId);
    const confirmedPlayerIds = new Set(
      findAttendanceForMatch(activeTeamId, input.matchId)
        .filter((item) => item.status === 'confirmed')
        .map((item) => item.playerId),
    );

    if (match.status === 'finished' || match.status === 'canceled') {
      throw new Error('A escalação só pode ser salva antes do encerramento da partida.');
    }

    if (confirmedPlayerIds.size === 0) {
      throw new Error('Confirme a presença do elenco antes de salvar a escalação.');
    }

    const starterIds = input.starters.map((starter) => starter.playerId);
    const hasDuplicateSlots =
      starterIds.some((playerId, index) => starterIds.indexOf(playerId) !== index) ||
      input.benchPlayerIds.some(
        (playerId, index) => input.benchPlayerIds.indexOf(playerId) !== index,
      ) ||
      starterIds.some((playerId) => input.benchPlayerIds.includes(playerId));

    if (hasDuplicateSlots) {
      throw new Error('A escalação tem jogadores repetidos. Revise titulares e reservas.');
    }

    for (const starter of input.starters) {
      ensurePlayerBelongsToTeam(starter.playerId, match.teamId);
      if (!confirmedPlayerIds.has(starter.playerId)) {
        throw new Error('A escalação aceita apenas jogadores confirmados.');
      }
    }

    for (const playerId of input.benchPlayerIds) {
      ensurePlayerBelongsToTeam(playerId, match.teamId);
      if (!confirmedPlayerIds.has(playerId)) {
        throw new Error('A escalação aceita apenas jogadores confirmados.');
      }
    }

    const preset = getFormationPresetByKey(
      match.matchType,
      match.linePlayersCount,
      input.formationKey,
    );
    const normalizedLineup = sanitizeLineupLayoutState({
      formationKey: input.formationKey,
      starters: input.starters,
      benchPlayerIds: input.benchPlayerIds,
      players: findTeamPlayers(activeTeamId).filter((player) =>
        confirmedPlayerIds.has(player.id),
      ),
      starterLimit: match.linePlayersCount + 1,
      fallbackFormationKey: preset.key,
      fallbackCoordinates: preset.coordinates,
    });

    if (existing) {
      existing.formationKey = normalizedLineup.formationKey;
      existing.starters = clone(normalizedLineup.starters);
      existing.benchPlayerIds = [...normalizedLineup.benchPlayerIds];
      existing.updatedAt = now;
      const notificationId = buildNotificationId('lineup-published', match.id);
      const existingNotification = findNotificationByIdForTeam(match.teamId, notificationId);
      upsertNotification(
        createLineupPublishedNotification({
          id: notificationId,
          teamId: match.teamId,
          match,
          actorUserId: actor.id,
          createdAt: existingNotification?.createdAt,
          updatedAt: now,
        }),
      );
      return clone(existing);
    }

    const lineup = {
      id: createId('lineup'),
      teamId: match.teamId,
      matchId: input.matchId,
      formationKey: normalizedLineup.formationKey,
      starters: clone(normalizedLineup.starters),
      benchPlayerIds: [...normalizedLineup.benchPlayerIds],
      createdAt: now,
      updatedAt: now,
    };

    database.lineups.push(lineup);
    upsertNotification(
      createLineupPublishedNotification({
        id: buildNotificationId('lineup-published', match.id),
        teamId: match.teamId,
        match,
        actorUserId: actor.id,
        updatedAt: now,
      }),
    );
    return clone(lineup);
  },

  async finishMatch(input: FinishMatchInput, actorUserId: string) {
    const { actor, activeTeamId } = ensureActiveTeamContext(actorUserId);
    const match = findMatchForTeam(activeTeamId, input.matchId);
    requireTeamAdmin(actorUserId, match.teamId);

    const now = nowIso();
    const snapshot = snapshotForTeam(activeTeamId);
    const confirmedPlayerIds = new Set(getConfirmedPlayerIds(snapshot, match.id));
    const starterIds = new Set(
      findLineupForTeam(activeTeamId, match.id)?.starters.map((item) => item.playerId) ?? [],
    );

    if (match.status === 'canceled') {
      throw new Error('Uma partida cancelada não pode ser encerrada.');
    }

    const ownGoalsForTeam = input.ownGoalsForTeam ?? 0;

    if (input.teamScore < 0 || input.opponentScore < 0 || ownGoalsForTeam < 0) {
      throw new Error('O placar não pode ter números negativos.');
    }

    if (confirmedPlayerIds.size === 0) {
      throw new Error('Confirme a presença do elenco antes de fechar a partida.');
    }

    for (const stat of input.playerStats) {
      if (!confirmedPlayerIds.has(stat.playerId)) {
        throw new Error('Somente jogadores confirmados podem receber estatísticas da partida.');
      }
      if (stat.goals < 0 || stat.assists < 0) {
        throw new Error('Gols e assistências não podem ser negativos.');
      }
    }

    const submittedMap = input.playerStats.reduce<Record<string, { goals: number; assists: number }>>(
      (acc, stat) => {
        acc[stat.playerId] = { goals: stat.goals, assists: stat.assists };
        return acc;
      },
      {},
    );

    const nextStatIds = new Set(
      [...confirmedPlayerIds].map((playerId) => buildStableDocumentId(match.id, playerId)),
    );
    database.matchStats = database.matchStats.filter(
      (item) => item.matchId !== match.id || nextStatIds.has(item.id),
    );

    const statsToInsert = [...confirmedPlayerIds].map<MatchStat>((playerId) => {
      const existing = findMatchStatsForMatch(activeTeamId, match.id).find(
        (item) => item.playerId === playerId,
      );

      return {
        id: buildStableDocumentId(match.id, playerId),
        teamId: match.teamId,
        matchId: match.id,
        playerId,
        played: true,
        started: starterIds.has(playerId),
        goals: submittedMap[playerId]?.goals ?? 0,
        assists: submittedMap[playerId]?.assists ?? 0,
        yellowCards: 0,
        redCards: 0,
        notes: '',
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
    });

    for (const stat of statsToInsert) {
      const existingIndex = database.matchStats.findIndex((item) => item.id === stat.id);
      if (existingIndex >= 0) {
        database.matchStats[existingIndex] = stat;
      } else {
        database.matchStats.push(stat);
      }
    }

    match.scoreboard = {
      team: input.teamScore,
      opponent: input.opponentScore,
      ownGoalsForTeam,
      result: calculateMatchResult(input.teamScore, input.opponentScore),
    };
    const nextFieldCost = input.fieldCost
      ? buildMatchFieldCost({
          values: input.fieldCost,
          updatedAt: now,
          updatedByUserId: actor.id,
        })
      : null;
    if (
      nextFieldCost &&
      match.fieldPayment &&
      getMatchFieldPaymentSummary(nextFieldCost, match.fieldPayment).totalPaidCount >
        nextFieldCost.splitCount
    ) {
      throw new Error(
        'A nova divisão do campo não comporta a quantidade de pagantes já marcada.',
      );
    }

    match.fieldCost = nextFieldCost;
    match.fieldPayment = nextFieldCost ? match.fieldPayment ?? null : null;
    match.status = 'finished';
    match.finishedAt = match.finishedAt ?? now;
    match.updatedAt = now;

    try {
      const matchFinishedNotificationId = buildNotificationId('match-finished', match.id);
      const existingFinishedNotification = findNotificationByIdForTeam(
        match.teamId,
        matchFinishedNotificationId,
      );
      upsertNotification(
        createMatchFinishedNotification({
          id: matchFinishedNotificationId,
          teamId: match.teamId,
          match,
          actorUserId: actor.id,
          createdAt: existingFinishedNotification?.createdAt,
          updatedAt: now,
        }),
      );

      const votingNotificationId = buildNotificationId('mvp-voting-opened', match.id);
      const existingVotingNotification = findNotificationByIdForTeam(
        match.teamId,
        votingNotificationId,
      );
      upsertNotification(
        createMvpVotingOpenedNotification({
          id: votingNotificationId,
          teamId: match.teamId,
          match,
          actorUserId: actor.id,
          createdAt: existingVotingNotification?.createdAt,
          updatedAt: now,
        }),
      );

      const ratingsNotificationId = buildNotificationId('ratings-opened', match.id);
      const existingRatingsNotification = findNotificationByIdForTeam(
        match.teamId,
        ratingsNotificationId,
      );
      upsertNotification(
        createRatingsOpenedNotification({
          id: ratingsNotificationId,
          teamId: match.teamId,
          match,
          actorUserId: actor.id,
          createdAt: existingRatingsNotification?.createdAt,
          updatedAt: now,
        }),
      );
    } catch {
      // best-effort: falha nas notificações não desfaz o encerramento
    }

    return clone(match);
  },

  async updateFinishedMatchStats(input: FinishMatchInput, actorUserId: string) {
    const { actor, activeTeamId } = ensureActiveTeamContext(actorUserId);
    const match = findMatchForTeam(activeTeamId, input.matchId);
    requireTeamAdmin(actorUserId, match.teamId);

    if (match.status !== 'finished') {
      throw new Error('Esta função só pode ser usada em partidas já encerradas.');
    }

    const now = nowIso();
    const snapshot = snapshotForTeam(activeTeamId);
    const confirmedPlayerIds = new Set(getConfirmedPlayerIds(snapshot, match.id));
    const starterIds = new Set(
      findLineupForTeam(activeTeamId, match.id)?.starters.map((item) => item.playerId) ?? [],
    );

    const ownGoalsForTeam = input.ownGoalsForTeam ?? 0;

    if (input.teamScore < 0 || input.opponentScore < 0 || ownGoalsForTeam < 0) {
      throw new Error('O placar não pode ter números negativos.');
    }

    if (confirmedPlayerIds.size === 0) {
      throw new Error('Confirme a presença do elenco antes de salvar as estatísticas.');
    }

    for (const stat of input.playerStats) {
      if (!confirmedPlayerIds.has(stat.playerId)) {
        throw new Error('Somente jogadores confirmados podem receber estatísticas da partida.');
      }
      if (stat.goals < 0 || stat.assists < 0) {
        throw new Error('Gols e assistências não podem ser negativos.');
      }
    }

    const submittedMap = input.playerStats.reduce<Record<string, { goals: number; assists: number }>>(
      (acc, stat) => {
        acc[stat.playerId] = { goals: stat.goals, assists: stat.assists };
        return acc;
      },
      {},
    );

    const nextStatIds = new Set(
      [...confirmedPlayerIds].map((playerId) => buildStableDocumentId(match.id, playerId)),
    );
    database.matchStats = database.matchStats.filter(
      (item) => item.matchId !== match.id || nextStatIds.has(item.id),
    );

    const statsToInsert = [...confirmedPlayerIds].map<MatchStat>((playerId) => {
      const existing = findMatchStatsForMatch(activeTeamId, match.id).find(
        (item) => item.playerId === playerId,
      );
      return {
        id: buildStableDocumentId(match.id, playerId),
        teamId: match.teamId,
        matchId: match.id,
        playerId,
        played: true,
        started: starterIds.has(playerId),
        goals: submittedMap[playerId]?.goals ?? 0,
        assists: submittedMap[playerId]?.assists ?? 0,
        yellowCards: 0,
        redCards: 0,
        notes: '',
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
    });

    for (const stat of statsToInsert) {
      const existingIndex = database.matchStats.findIndex((item) => item.id === stat.id);
      if (existingIndex >= 0) {
        database.matchStats[existingIndex] = stat;
      } else {
        database.matchStats.push(stat);
      }
    }

    match.scoreboard = {
      team: input.teamScore,
      opponent: input.opponentScore,
      ownGoalsForTeam,
      result: calculateMatchResult(input.teamScore, input.opponentScore),
    };
    const nextFieldCost = input.fieldCost
      ? buildMatchFieldCost({
          values: input.fieldCost,
          updatedAt: now,
          updatedByUserId: actor.id,
        })
      : null;
    if (
      nextFieldCost &&
      match.fieldPayment &&
      getMatchFieldPaymentSummary(nextFieldCost, match.fieldPayment).totalPaidCount > nextFieldCost.splitCount
    ) {
      throw new Error('A nova divisão do campo não comporta a quantidade de pagantes já marcada.');
    }

    match.fieldCost = nextFieldCost;
    match.fieldPayment = nextFieldCost ? match.fieldPayment ?? null : null;
    // status and finishedAt preserved intentionally
    match.updatedAt = now;

    return clone(match);
  },

  async registerFinishedMatch(input: RegisterFinishedMatchInput, actorUserId: string) {
    const { activeTeamId } = ensureActiveTeamContext(actorUserId);
    requireTeamAdmin(actorUserId, activeTeamId);

    return createFinishedMatchRecord({
      actorUserId,
      team: findTeam(activeTeamId),
      teamPlayers: findTeamPlayers(activeTeamId),
      values: input,
    });
  },

  async previewLegacyMatchImport(
    payload: ImportedMatchPayloadItem[],
    actorUserId: string,
  ): Promise<LegacyMatchImportPreview> {
    const { activeTeamId } = ensureActiveTeamContext(actorUserId);
    requireTeamAdmin(actorUserId, activeTeamId);

    return buildLegacyMatchImportPreview({
      payload,
      teamPlayers: findTeamPlayers(activeTeamId),
      existingMatches: database.matches.filter((match) => match.teamId === activeTeamId),
    });
  },

  async importLegacyMatches(
    payload: ImportedMatchPayloadItem[],
    actorUserId: string,
  ): Promise<ImportLegacyMatchesResult> {
    const { activeTeamId } = ensureActiveTeamContext(actorUserId);
    requireTeamAdmin(actorUserId, activeTeamId);
    const preview = buildLegacyMatchImportPreview({
      payload,
      teamPlayers: findTeamPlayers(activeTeamId),
      existingMatches: database.matches.filter((match) => match.teamId === activeTeamId),
    });
    const team = findTeam(activeTeamId);
    const teamPlayers = findTeamPlayers(activeTeamId);
    const createdMatchIds: string[] = [];
    let skippedDuplicates = 0;
    let invalidMatches = 0;

    for (const item of preview.items) {
      if (item.status === 'duplicate') {
        skippedDuplicates += 1;
        continue;
      }

      if (item.status !== 'ready') {
        invalidMatches += 1;
        continue;
      }

      const source = payload[item.sourceIndex];
      const players = item.players.flatMap<RegisterFinishedMatchPlayerInput>((player) => {
        if (player.status !== 'matched' || !player.matchedPlayerId) {
          return [];
        }

        return [{
          playerId: player.matchedPlayerId,
          played: player.played,
          started: player.started,
          goals: player.goals,
          assists: player.assists,
        }];
      });
      const match = createFinishedMatchRecord({
        actorUserId,
        team,
        teamPlayers,
        values: {
          seasonId: team.activeSeasonId ?? null,
          date: source.date,
          time: source.time ?? '',
          venue: source.venue ?? null,
          locationUrl: source.locationUrl ?? null,
          opponentName: source.opponentName,
          opponentLogoUrl: source.opponentLogoUrl ?? null,
          linePlayersCount: source.linePlayersCount ?? null,
          matchType: source.matchType,
          notes: source.notes ?? null,
          teamScore: source.teamScore,
          opponentScore: source.opponentScore,
          players,
        },
      });
      createdMatchIds.push(match.id);
    }

    return {
      createdMatches: createdMatchIds.length,
      skippedDuplicates,
      invalidMatches,
      createdMatchIds,
    };
  },

  async createMatchDiaryEntry(
    input: CreateMatchDiaryEntryInput,
    actorUserId: string,
  ) {
    const { actor, activeTeamId } = ensureActiveTeamContext(actorUserId);
    requireTeamAdmin(actorUserId, activeTeamId);
    const match = findMatchForTeam(activeTeamId, input.matchId);
    const teamMembers = database.teamMembers.filter((member) => member.teamId === activeTeamId);
    const validated = validateDiaryFields({
      title: input.title,
      content: input.content,
    });
    const now = nowIso();
    const entry: MatchDiaryEntry = {
      id: createId('diary'),
      teamId: activeTeamId,
      matchId: match.id,
      authorUserId: actor.id,
      authorName: actor.displayName,
      title: validated.title,
      content: validated.content,
      mentionedPlayerIds: sanitizeMentionedPlayerIds(activeTeamId, input.mentionedPlayerIds),
      visibility: 'team',
      pinned: input.pinned ?? false,
      mood: input.mood ?? null,
      emoji: resolveDiaryEmoji(input.mood, input.emoji),
      createdAt: now,
      updatedAt: now,
    };

    database.matchDiaryEntries.push(entry);

    if (input.notifyTeam) {
      publishMatchDiaryNotifications({
        entry,
        match,
        actorUserId: actor.id,
        teamMembers,
        mentionedPlayerIds: entry.mentionedPlayerIds,
      });
    }

    return clone(entry);
  },

  async updateMatchDiaryEntry(
    entryId: string,
    input: UpdateMatchDiaryEntryInput,
    actorUserId: string,
  ) {
    const { actor, activeTeamId } = ensureActiveTeamContext(actorUserId);
    requireTeamAdmin(actorUserId, activeTeamId);
    const entry = findMatchDiaryEntryForTeam(activeTeamId, entryId);

    if (!entry) {
      throw new Error('Resenha da partida não encontrada.');
    }

    const match = findMatchForTeam(activeTeamId, entry.matchId);
    const nextTitle = input.title !== undefined ? input.title : entry.title;
    const nextContent = input.content !== undefined ? input.content : entry.content;
    const validated = validateDiaryFields({
      title: nextTitle,
      content: nextContent,
    });

    entry.title = normalizeDiaryTitle(validated.title);
    entry.content = validated.content;
    entry.mentionedPlayerIds =
      input.mentionedPlayerIds !== undefined
        ? sanitizeMentionedPlayerIds(activeTeamId, input.mentionedPlayerIds)
        : entry.mentionedPlayerIds;
    entry.pinned = input.pinned ?? entry.pinned ?? false;
    entry.mood = input.mood !== undefined ? input.mood : entry.mood ?? null;
    entry.emoji =
      input.emoji !== undefined || input.mood !== undefined
        ? resolveDiaryEmoji(entry.mood, input.emoji ?? entry.emoji)
        : entry.emoji ?? null;
    entry.updatedAt = nowIso();

    if (input.notifyTeam) {
      removeDiaryNotifications(entry.id);
      publishMatchDiaryNotifications({
        entry,
        match,
        actorUserId: actor.id,
        teamMembers: database.teamMembers.filter((member) => member.teamId === activeTeamId),
        mentionedPlayerIds: entry.mentionedPlayerIds,
      });
    }

    return clone(entry);
  },

  async deleteMatchDiaryEntry(entryId: string, actorUserId: string) {
    const { activeTeamId } = ensureActiveTeamContext(actorUserId);
    requireTeamAdmin(actorUserId, activeTeamId);
    const entry = findMatchDiaryEntryForTeam(activeTeamId, entryId);

    if (!entry) {
      throw new Error('Resenha da partida não encontrada.');
    }

    database.matchDiaryEntries = database.matchDiaryEntries.filter((item) => item.id !== entryId);
    removeDiaryNotifications(entryId);
  },

  async deleteMatch(matchId: string, actorUserId: string) {
    const { activeTeamId } = ensureActiveTeamContext(actorUserId);
    const match = findMatchForTeam(activeTeamId, matchId);
    requireTeamAdmin(actorUserId, match.teamId);

    if (match.deletedAt) {
      return;
    }

    const updatedAt = nowIso();
    match.status = 'canceled';
    match.scoreboard = null;
    match.finishedAt = null;
    match.deletedAt = updatedAt;
    match.deletedBy = actorUserId;
    match.updatedAt = updatedAt;
  },

  async setManualMvp(matchId: string, playerId: string | null, actorUserId: string) {
    const { activeTeamId } = ensureActiveTeamContext(actorUserId);
    const match = findMatchForTeam(activeTeamId, matchId);
    requireTeamAdmin(actorUserId, match.teamId);

    if (match.deletedAt) {
      throw new Error('Não é possível editar o MVP de uma partida excluída.');
    }

    const updatedAt = nowIso();

    if (playerId !== null) {
      match.mvpWinnerPlayerIds = [playerId];
      match.manualMvpPlayerId = playerId;
      match.manualMvpSelectedBy = actorUserId;
      match.manualMvpSelectedAt = updatedAt;
      match.updatedAt = updatedAt;
    } else {
      const { match: synced } = syncMvpMatchFields(matchId);
      synced.manualMvpPlayerId = null;
      synced.manualMvpSelectedBy = null;
      synced.manualMvpSelectedAt = null;
      synced.updatedAt = updatedAt;
    }

    return clone(match);
  },

  async adminSetMatchAttendance(
    matchId: string,
    playerId: string,
    status: AttendanceStatus,
    actorUserId: string,
  ) {
    const { activeTeamId } = ensureActiveTeamContext(actorUserId);
    const match = findMatchForTeam(activeTeamId, matchId);
    requireTeamAdmin(actorUserId, match.teamId);

    if (match.deletedAt) {
      throw new Error('Não é possível editar participantes de uma partida excluída.');
    }

    const now = nowIso();
    const attendanceId = buildStableDocumentId(matchId, playerId);
    const existingIndex = database.attendance.findIndex((item) => item.id === attendanceId);

    if (existingIndex >= 0) {
      database.attendance[existingIndex]!.status = status;
      database.attendance[existingIndex]!.respondedAt = now;
      database.attendance[existingIndex]!.updatedAt = now;
    } else {
      database.attendance.push({
        id: attendanceId,
        teamId: activeTeamId,
        matchId,
        playerId,
        userId: null,
        status,
        respondedAt: now,
        createdAt: now,
        updatedAt: now,
      });
    }

    const record = database.attendance.find((item) => item.id === attendanceId)!;

    return clone(record);
  },

  async fetchMatchDiaryEntriesByMatchId(matchId: string, actorUserId: string) {
    const { activeTeamId } = ensureActiveTeamContext(actorUserId);
    findMatchForTeam(activeTeamId, matchId);
    return clone(findMatchDiaryEntriesForMatch(activeTeamId, matchId));
  },

  async listMatchDiaryEntriesForTeam(teamId: string, actorUserId: string, limit?: number) {
    const { activeTeamId } = ensureActiveTeamContext(actorUserId);

    if (activeTeamId !== teamId) {
      throw new Error('Troque para o time atual antes de continuar.');
    }

    const entries = findMatchDiaryEntriesForTeam(teamId);
    return clone(limit != null ? entries.slice(0, limit) : entries);
  },

  async submitMvpVote(input: SubmitMvpVoteInput, actorUserId: string) {
    const { player: voter, activeTeamId } = requireLinkedPlayer(actorUserId);
    const match = findMatchForTeam(activeTeamId, input.matchId);
    const now = nowIso();

    if (match.status !== 'finished') {
      throw new Error('A votacao de MVP so fica disponivel apos o encerramento da partida.');
    }

    const eligiblePlayerIds = getConfirmedPlayerIds(
      snapshotForTeam(activeTeamId),
      match.id,
    );

    if (!eligiblePlayerIds.includes(voter.id)) {
      throw new Error('Apenas jogadores confirmados podem votar no MVP.');
    }

    const targetPlayer = ensurePlayerBelongsToTeam(input.targetPlayerId, match.teamId);

    if (!eligiblePlayerIds.includes(targetPlayer.id)) {
      throw new Error('Não é possível votar em quem não participou da partida.');
    }

    if (targetPlayer.id === voter.id) {
      throw new Error('Não é permitido votar em si mesmo.');
    }

    const alreadyVoted = findMvpVotesForMatch(activeTeamId, match.id).find(
      (vote) => vote.voterPlayerId === voter.id,
    );

    if (alreadyVoted) {
      throw new Error('Você já votou no MVP desta partida.');
    }

    const vote: MvpVote = {
      id: buildStableDocumentId(match.id, voter.id),
      teamId: match.teamId,
      matchId: match.id,
      voterPlayerId: voter.id,
      targetPlayerId: targetPlayer.id,
      createdAt: now,
      updatedAt: now,
    };

    database.mvpVotes.push(vote);
    const { match: syncedMatch, updatedAt } = syncMvpMatchFields(match.id);
    syncMvpWinnerNotification(syncedMatch, voter.linkedUserId ?? actorUserId, updatedAt);

    return clone(vote);
  },

  async submitPlayerRating(input: SubmitPlayerRatingInput, actorUserId: string) {
    const { player: rater, activeTeamId } = requireLinkedPlayer(actorUserId);
    const match = findMatchForTeam(activeTeamId, input.matchId);
    const now = nowIso();
    const teamCriteria = syncRatingCriteriaOrder(activeTeamId);
    const activeCriteria = getActiveRatingCriteria(teamCriteria);

    if (match.status !== 'finished') {
      throw new Error('As avaliações só ficam disponíveis após o encerramento da partida.');
    }

    const eligiblePlayerIds = getConfirmedPlayerIds(
      snapshotForTeam(activeTeamId),
      match.id,
    );

    if (!eligiblePlayerIds.includes(rater.id)) {
      throw new Error('Apenas jogadores confirmados podem avaliar a partida.');
    }

    const targetPlayer = ensurePlayerBelongsToTeam(input.targetPlayerId, match.teamId);

    if (!eligiblePlayerIds.includes(targetPlayer.id)) {
      throw new Error('Não é possível avaliar quem não participou da partida.');
    }

    if (targetPlayer.id === rater.id) {
      throw new Error('Não é permitido avaliar a si mesmo.');
    }

    const duplicate = findRatingsForMatch(activeTeamId, match.id).find(
      (rating) =>
        rating.raterPlayerId === rater.id &&
        rating.targetPlayerId === targetPlayer.id,
    );

    if (duplicate) {
      throw new Error('Você já avaliou este jogador nesta partida.');
    }

    validateRatingCriteriaInput(teamCriteria, input);
    const criteriaSnapshot = buildRatingCriteriaSnapshot(activeCriteria);

    const rating: PlayerRating = {
      id: buildStableDocumentId(match.id, rater.id, targetPlayer.id),
      teamId: match.teamId,
      matchId: match.id,
      raterPlayerId: rater.id,
      targetPlayerId: targetPlayer.id,
      criteriaScores: clone(input.criteriaScores),
      criteriaSnapshot,
      overall: calculateOverallFromCriteriaScores({
        criteriaScores: input.criteriaScores,
        criteriaSnapshot,
      }),
      createdAt: now,
      updatedAt: now,
    };

    database.playerRatings.push(rating);
    return clone(rating);
  },

  async markNotificationAsRead(notificationId: string, actorUserId: string) {
    const { actor, activeTeamId } = ensureActiveTeamContext(actorUserId);
    const notification = findNotificationByIdForTeam(activeTeamId, notificationId);

    if (!notification) {
      throw new Error('Notificação não encontrada.');
    }

    if (!canAccessNotification(notification, actor.id)) {
      throw new Error('Você não pode abrir esta notificação.');
    }

    if (!notification.readByUserIds.includes(actor.id)) {
      notification.readByUserIds = [...notification.readByUserIds, actor.id];
    }
  },

  async markAllNotificationsAsRead(actorUserId: string) {
    const { actor, activeTeamId } = ensureActiveTeamContext(actorUserId);

    for (const notification of findNotificationsForTeam(activeTeamId)) {
      if (!canAccessNotification(notification, actor.id)) {
        continue;
      }

      if (!notification.readByUserIds.includes(actor.id)) {
        notification.readByUserIds = [...notification.readByUserIds, actor.id];
      }
    }
  },
};
