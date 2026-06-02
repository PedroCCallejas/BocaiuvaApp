import { emptySnapshot, type AppSnapshot } from '@/services/repository/types';
import type {
  AttendanceRecord,
  Match,
  MatchStat,
  Player,
  Team,
  TeamMember,
  TeamRatingCriterion,
  User,
} from '@/types/domain';

const NOW = '2026-06-02T12:00:00.000Z';

let sequence = 0;

function nextId(prefix: string) {
  sequence += 1;
  return `${prefix}-${sequence}`;
}

export function createUser(overrides: Partial<User> = {}): User {
  const id = overrides.id ?? nextId('user');

  return {
    id,
    email: overrides.email ?? `${id}@professo.test`,
    displayName: overrides.displayName ?? `User ${id}`,
    appRole: overrides.appRole ?? 'player',
    canCreateTeam: overrides.canCreateTeam ?? true,
    activeTeamId: overrides.activeTeamId ?? null,
    teamId: overrides.teamId ?? overrides.activeTeamId ?? null,
    playerId: overrides.playerId ?? null,
    avatarUrl: overrides.avatarUrl ?? null,
    notificationTokens: overrides.notificationTokens ?? [],
    createdAt: overrides.createdAt ?? NOW,
    updatedAt: overrides.updatedAt ?? NOW,
  };
}

export function createTeam(overrides: Partial<Team> = {}): Team {
  const id = overrides.id ?? nextId('team');

  return {
    id,
    name: overrides.name ?? `Time ${id}`,
    slug: overrides.slug ?? `time-${id}`,
    logoUrl: overrides.logoUrl ?? null,
    bannerUrl: overrides.bannerUrl ?? null,
    presentationVideoUrl: overrides.presentationVideoUrl ?? null,
    isPublic: overrides.isPublic ?? false,
    city: overrides.city ?? null,
    state: overrides.state ?? null,
    neighborhood: overrides.neighborhood ?? null,
    homeFieldName: overrides.homeFieldName ?? null,
    contactName: overrides.contactName ?? null,
    contactPhone: overrides.contactPhone ?? null,
    contactWhatsapp: overrides.contactWhatsapp ?? null,
    publicDescription: overrides.publicDescription ?? null,
    allowFriendlyContact: overrides.allowFriendlyContact ?? false,
    publicRosterEnabled: overrides.publicRosterEnabled ?? false,
    primaryColor: overrides.primaryColor ?? '#004d40',
    secondaryColor: overrides.secondaryColor ?? '#ffffff',
    accentColor: overrides.accentColor ?? '#ffca28',
    description: overrides.description ?? '',
    inviteCode: overrides.inviteCode ?? 'ABC123',
    inviteCodeUpdatedAt: overrides.inviteCodeUpdatedAt ?? NOW,
    coachName: overrides.coachName ?? 'Professor',
    adminUserId: overrides.adminUserId ?? 'user-owner',
    activeSeasonId: overrides.activeSeasonId ?? null,
    createdAt: overrides.createdAt ?? NOW,
    updatedAt: overrides.updatedAt ?? NOW,
  };
}

export function createTeamMember(overrides: Partial<TeamMember> = {}): TeamMember {
  return {
    id: overrides.id ?? nextId('membership'),
    userId: overrides.userId ?? 'user-owner',
    teamId: overrides.teamId ?? 'team-1',
    playerId: overrides.playerId ?? null,
    roles: overrides.roles ?? ['player'],
    canManageTeam: overrides.canManageTeam ?? false,
    canManagePlayers: overrides.canManagePlayers ?? false,
    joinedAt: overrides.joinedAt ?? NOW,
    status: overrides.status ?? 'active',
    createdAt: overrides.createdAt ?? NOW,
    updatedAt: overrides.updatedAt ?? NOW,
  };
}

export function createPlayer(overrides: Partial<Player> = {}): Player {
  const id = overrides.id ?? nextId('player');

  return {
    id,
    teamId: overrides.teamId ?? 'team-1',
    linkedUserId: overrides.linkedUserId ?? null,
    linkedEmail: overrides.linkedEmail ?? null,
    fullName: overrides.fullName ?? `Jogador ${id}`,
    nickname: overrides.nickname ?? `J${id}`,
    photoUrl: overrides.photoUrl ?? null,
    presentationVideoUrl: overrides.presentationVideoUrl ?? null,
    jerseyNumber: overrides.jerseyNumber ?? 10,
    primaryPosition: overrides.primaryPosition ?? 'midfielder',
    secondaryPositions: overrides.secondaryPositions ?? [],
    dominantFoot: overrides.dominantFoot ?? 'right',
    status: overrides.status ?? 'active',
    bio: overrides.bio ?? '',
    preferredPosition: overrides.preferredPosition ?? 'midfielder',
    allowSelfEditJerseyNumber: overrides.allowSelfEditJerseyNumber ?? false,
    introVideoUrl: overrides.introVideoUrl ?? null,
    celebrationVideoUrl: overrides.celebrationVideoUrl ?? null,
    manualStats: overrides.manualStats ?? {
      matches: 0,
      goals: 0,
      assists: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      mvps: 0,
    },
    deletedAt: overrides.deletedAt ?? null,
    createdAt: overrides.createdAt ?? NOW,
    updatedAt: overrides.updatedAt ?? NOW,
  };
}

export function createMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: overrides.id ?? nextId('match'),
    teamId: overrides.teamId ?? 'team-1',
    seasonId: overrides.seasonId ?? null,
    date: overrides.date ?? '2026-05-20',
    time: overrides.time ?? '19:00',
    venue: overrides.venue ?? 'Arena Centro',
    locationUrl: overrides.locationUrl ?? null,
    opponentName: overrides.opponentName ?? 'Rivais FC',
    opponentLogoUrl: overrides.opponentLogoUrl ?? null,
    opponentTeamId: overrides.opponentTeamId ?? null,
    opponentTeamName: overrides.opponentTeamName ?? null,
    opponentTeamLogoUrl: overrides.opponentTeamLogoUrl ?? null,
    opponentSource: overrides.opponentSource ?? null,
    linePlayersCount: overrides.linePlayersCount ?? 7,
    matchType: overrides.matchType ?? 'society',
    notes: overrides.notes ?? '',
    status: overrides.status ?? 'finished',
    createdBy: overrides.createdBy ?? 'user-owner',
    scoreboard: overrides.scoreboard ?? {
      team: 2,
      opponent: 1,
      ownGoalsForTeam: 0,
      result: 'win',
    },
    fieldCost: overrides.fieldCost ?? null,
    fieldPayment: overrides.fieldPayment ?? null,
    finishedAt: overrides.finishedAt ?? NOW,
    mvpWinnerPlayerIds: overrides.mvpWinnerPlayerIds ?? [],
    mvpTotalVotes: overrides.mvpTotalVotes ?? 0,
    createdAt: overrides.createdAt ?? NOW,
    updatedAt: overrides.updatedAt ?? NOW,
  };
}

export function createAttendance(overrides: Partial<AttendanceRecord> = {}): AttendanceRecord {
  return {
    id: overrides.id ?? nextId('attendance'),
    teamId: overrides.teamId ?? 'team-1',
    matchId: overrides.matchId ?? 'match-1',
    playerId: overrides.playerId ?? 'player-1',
    userId: overrides.userId ?? null,
    status: overrides.status ?? 'confirmed',
    respondedAt: overrides.respondedAt ?? NOW,
    createdAt: overrides.createdAt ?? NOW,
    updatedAt: overrides.updatedAt ?? NOW,
  };
}

export function createMatchStat(overrides: Partial<MatchStat> = {}): MatchStat {
  return {
    id: overrides.id ?? nextId('stat'),
    teamId: overrides.teamId ?? 'team-1',
    matchId: overrides.matchId ?? 'match-1',
    playerId: overrides.playerId ?? 'player-1',
    played: overrides.played ?? true,
    started: overrides.started ?? true,
    goals: overrides.goals ?? 0,
    assists: overrides.assists ?? 0,
    yellowCards: overrides.yellowCards ?? 0,
    redCards: overrides.redCards ?? 0,
    notes: overrides.notes ?? '',
    createdAt: overrides.createdAt ?? NOW,
    updatedAt: overrides.updatedAt ?? NOW,
  };
}

export function createCriterion(
  overrides: Partial<TeamRatingCriterion> = {},
): TeamRatingCriterion {
  return {
    id: overrides.id ?? nextId('criterion'),
    teamId: overrides.teamId ?? 'team-1',
    label: overrides.label ?? 'Compromisso',
    description: overrides.description ?? null,
    type: overrides.type ?? 'positive',
    weight: overrides.weight ?? 1,
    active: overrides.active ?? true,
    order: overrides.order ?? 0,
    createdAt: overrides.createdAt ?? NOW,
    updatedAt: overrides.updatedAt ?? NOW,
  };
}

export function createSnapshot(overrides: Partial<AppSnapshot> = {}): AppSnapshot {
  return {
    ...emptySnapshot,
    ...overrides,
  };
}
