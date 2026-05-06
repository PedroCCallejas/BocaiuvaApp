import { calculateMatchResult, getConfirmedPlayerIds, getMvpSummary } from '@/lib/match';
import {
  createEmptyManualStats,
  createInviteCode,
  deriveNickname,
  displayNameFromEmail,
  normalizeInviteCode,
  normalizeManualStats,
  slugifyTeamName,
} from '@/lib/team';
import type {
  AttendanceRecord,
  Match,
  MatchStat,
  MvpVote,
  Player,
  PlayerRating,
  Team,
  TeamMember,
  User,
} from '@/types/domain';
import { createSeedDatabase } from '@/mocks/seed';
import type {
  AppRepository,
  AppSnapshot,
  CreateMatchInput,
  CreatePlayerInput,
  CreateTeamInput,
  FinishMatchInput,
  GoogleLoginInput,
  LoginInput,
  MockDatabase,
  RegisterInput,
  SaveLineupInput,
  SubmitMvpVoteInput,
  SubmitPlayerRatingInput,
  UpdateMatchInput,
  UpdateTeamInput,
  UpdateAttendanceInput,
  UpdatePlayerInput,
} from '@/services/repository/types';

let database = createSeedDatabase();

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function snapshotFromDatabase(source: MockDatabase): AppSnapshot {
  return clone({
    users: source.users,
    teams: source.teams,
    teamMembers: source.teamMembers,
    players: source.players,
    matches: source.matches,
    lineups: source.lineups,
    attendance: source.attendance,
    matchStats: source.matchStats,
    mvpVotes: source.mvpVotes,
    playerRatings: source.playerRatings,
    seasons: source.seasons,
  });
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
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
    throw new Error('Usuario nao encontrado.');
  }
  return user;
}

function findTeam(teamId: string) {
  const team = database.teams.find((item) => item.id === teamId);
  if (!team) {
    throw new Error('Time nao encontrado.');
  }
  return team;
}

function findPlayer(playerId: string) {
  const player = database.players.find((item) => item.id === playerId);
  if (!player) {
    throw new Error('Jogador nao encontrado.');
  }
  return player;
}

function findMatch(matchId: string) {
  const match = database.matches.find((item) => item.id === matchId);
  if (!match) {
    throw new Error('Partida nao encontrada.');
  }
  return match;
}

function findLineup(matchId: string) {
  return database.lineups.find((item) => item.matchId === matchId) ?? null;
}

function findTeamPlayers(teamId: string) {
  return database.players.filter((player) => player.teamId === teamId);
}

function findMembership(membershipId: string) {
  const membership = database.teamMembers.find((item) => item.id === membershipId);
  if (!membership) {
    throw new Error('Participacao no time nao encontrada.');
  }
  return membership;
}

function findUserMemberships(userId: string) {
  return database.teamMembers.filter(
    (membership) => membership.userId === userId && membership.status === 'active',
  );
}

function findMembershipByUserAndTeam(userId: string, teamId: string) {
  return (
    database.teamMembers.find(
      (membership) =>
        membership.userId === userId &&
        membership.teamId === teamId &&
        membership.status === 'active',
    ) ?? null
  );
}

function syncUserActiveContext(user: User) {
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
  const normalizedInviteCode = normalizeInviteCode(inviteCode);
  return (
    database.teams.find((team) => team.inviteCode === normalizedInviteCode) ?? null
  );
}

function requireTeamAdmin(actorUserId: string, teamId: string) {
  const actor = findUser(actorUserId);
  const membership = findMembershipByUserAndTeam(actor.id, teamId);

  if (
    !membership ||
    !membership.canManageTeam
  ) {
    throw new Error('Apenas o administrador do time pode fazer essa acao.');
  }

  syncUserActiveContext(actor);
  return actor;
}

function requirePlayerManager(actorUserId: string, teamId: string) {
  const actor = findUser(actorUserId);
  const membership = findMembershipByUserAndTeam(actor.id, teamId);

  if (!membership || !membership.canManagePlayers) {
    throw new Error('Apenas quem gerencia o elenco pode fazer essa acao.');
  }

  syncUserActiveContext(actor);
  return actor;
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

function requireLinkedPlayer(actorUserId: string) {
  const actor = findUser(actorUserId);
  const membership = syncUserActiveContext(actor);

  if (!membership?.playerId) {
    throw new Error('Esta conta ainda nao esta vinculada a um jogador.');
  }

  const player = findPlayer(membership.playerId);
  return { actor, player };
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
    database.teams.some(
      (team) => team.id !== excludedTeamId && team.inviteCode === inviteCode,
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
    throw new Error('Jogador nao pertence ao time informado.');
  }

  return player;
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

function syncLinkedUser(player: Player) {
  if (!player.linkedUserId) {
    return;
  }

  const linkedUser = database.users.find((user) => user.id === player.linkedUserId);
  if (!linkedUser) {
    return;
  }

  const team = findTeam(player.teamId);
  const membership =
    findMembershipByUserAndTeam(linkedUser.id, player.teamId) ??
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
  if (!membership.roles.includes('player')) {
    membership.roles = [...membership.roles, 'player'];
  }
  membership.canManageTeam = membership.roles.includes('admin');
  membership.canManagePlayers = membership.roles.includes('admin');
  membership.updatedAt = nowIso();
  linkedUser.teamId = player.teamId;
  linkedUser.playerId = player.id;
  linkedUser.activeTeamId = linkedUser.activeTeamId ?? player.teamId;
  linkedUser.appRole = resolveTeamAppRole(linkedUser, team);
  linkedUser.updatedAt = nowIso();
  player.linkedEmail = normalizeEmail(linkedUser.email);
  syncUserActiveContext(linkedUser);
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
  }
  linkedUser.appRole = resolveTeamAppRole(linkedUser, team);
  linkedUser.updatedAt = nowIso();
  player.linkedUserId = null;
  syncUserActiveContext(linkedUser);
}

function syncMvpMatchFields(matchId: string) {
  const match = findMatch(matchId);
  const summary = getMvpSummary(snapshotFromDatabase(database), matchId);

  match.mvpWinnerPlayerIds = summary.winnerPlayerIds;
  match.mvpTotalVotes = summary.totalVotes;
  match.updatedAt = nowIso();
}

function allowedSelfUpdateFields(input: UpdatePlayerInput) {
  const allowedKeys = new Set([
    'photoUrl',
    'nickname',
    'bio',
    'jerseyNumber',
    'secondaryPositions',
    'dominantFoot',
    'preferredPosition',
    'introVideoUrl',
    'celebrationVideoUrl',
  ]);

  const invalid = Object.keys(input).filter((key) => !allowedKeys.has(key));
  if (invalid.length > 0) {
    throw new Error(
      'Seu perfil permite editar apenas foto, apelido, bio, posicoes, pe dominante e os videos do jogador.',
    );
  }
}

function validateRatingCriteria(criteria: SubmitPlayerRatingInput['criteria']) {
  for (const [key, value] of Object.entries(criteria)) {
    if (value < 0 || value > 5) {
      throw new Error(`A nota de ${key} deve ficar entre 0 e 5.`);
    }
  }
}

export const mockRepository: AppRepository = {
  getMode() {
    return 'mock';
  },

  async getInitialSnapshot() {
    for (const user of database.users) {
      syncUserActiveContext(user);
    }
    return snapshotFromDatabase(database);
  },

  async getSnapshot() {
    for (const user of database.users) {
      syncUserActiveContext(user);
    }
    return snapshotFromDatabase(database);
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
    syncUserActiveContext(user);
    return clone(user);
  },

  async loginWithGoogle(_input: GoogleLoginInput) {
    throw new Error('Esse acesso nao esta disponivel nesta demonstracao.');
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

    return clone(user);
  },

  async resetPassword() {
    return;
  },

  async createTeam(input: CreateTeamInput, adminUserId: string) {
    const owner = findUser(adminUserId);

    if (!owner.canCreateTeam) {
      throw new Error('Seu acesso ainda nao permite criar um time.');
    }

    const createdAt = nowIso();
    const teamId = createId('team');
    const seasonId = createId('season');
    const inviteCode = createUniqueInviteCode();

    const team: Team = {
      id: teamId,
      name: input.name.trim(),
      slug: slugifyTeamName(input.name),
      logoUrl: input.logoUrl?.trim() || null,
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
    database.teamMembers.push(ownerMembership);
    database.seasons.push(season);
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

    team.name = input.name.trim();
    team.coachName = input.coachName.trim();
    team.slug = slugifyTeamName(input.slug.trim() || input.name);
    team.logoUrl = input.logoUrl?.trim() || null;
    team.primaryColor = input.primaryColor;
    team.secondaryColor = input.secondaryColor;
    team.accentColor = input.accentColor ?? null;
    team.description = input.description?.trim() ?? '';
    team.updatedAt = updatedAt;

    return clone(team);
  },

  async regenerateTeamInviteCode(teamId: string, actorUserId: string) {
    requireTeamAdmin(actorUserId, teamId);
    const team = findTeam(teamId);
    const updatedAt = nowIso();

    team.inviteCode = createUniqueInviteCode(team.id);
    team.inviteCodeUpdatedAt = updatedAt;
    team.updatedAt = updatedAt;

    return clone(team);
  },

  async setActiveTeam(teamId: string, userId: string) {
    const user = findUser(userId);
    const membership = findMembershipByUserAndTeam(user.id, teamId);

    if (!membership) {
      throw new Error('Voce ainda nao participa desse time.');
    }

    user.activeTeamId = membership.teamId;
    user.teamId = membership.teamId;
    user.playerId = membership.playerId;
    user.appRole = resolveTeamAppRole(user, findTeam(membership.teamId));
    user.updatedAt = nowIso();

    return clone(user);
  },

  async joinTeamWithInviteCode(inviteCode: string, userId: string) {
    const actor = findUser(userId);
    const team = findTeamByInviteCode(inviteCode);
    if (!team) {
      throw new Error('Nao encontramos um time com esse codigo.');
    }

    const existingMembership = findMembershipByUserAndTeam(actor.id, team.id);
    if (existingMembership) {
      actor.activeTeamId = team.id;
      actor.teamId = team.id;
      actor.playerId = existingMembership.playerId;
      actor.appRole = resolveTeamAppRole(actor, team);
      actor.updatedAt = nowIso();
      return {
        team: clone(team),
        alreadyMember: true,
      };
    }

    const normalizedActorEmail = normalizeEmail(actor.email);
    const candidatePlayer =
      findTeamPlayers(team.id).find(
        (player) =>
          !player.linkedUserId &&
          normalizeEmail(player.linkedEmail ?? '') === normalizedActorEmail,
      ) ?? null;

    const updatedAt = nowIso();
    let player = candidatePlayer;

    if (player) {
      player.linkedUserId = actor.id;
      player.linkedEmail = normalizedActorEmail;
      player.updatedAt = updatedAt;
      syncLinkedUser(player);
    } else {
      player = createBasicPlayer(team.id, actor);
      database.players.push(player);
      syncLinkedUser(player);
    }

    actor.activeTeamId = team.id;
    actor.teamId = team.id;
    actor.playerId = player.id;
    actor.appRole = actor.appRole === 'owner' ? 'owner' : 'player';
    actor.updatedAt = updatedAt;

    return {
      team: clone(team),
      alreadyMember: false,
    };
  },

  async createPlayer(input: CreatePlayerInput, actorUserId: string) {
    requirePlayerManager(actorUserId, input.teamId);
    assertJerseyAvailable(input.teamId, input.jerseyNumber);
    const linkedUser = input.linkedUserId
      ? validateLinkedUserAssignment(input.linkedUserId, input.teamId)
      : null;
    const linkedEmail = validateLinkedEmailAvailability(
      input.teamId,
      linkedUser?.email ?? input.linkedEmail,
    );

    const createdAt = nowIso();
    const player: Player = {
      id: createId('player'),
      teamId: input.teamId,
      linkedUserId: input.linkedUserId ?? null,
      linkedEmail,
      fullName: input.fullName.trim(),
      nickname: input.nickname.trim(),
      photoUrl: input.photoUrl ?? null,
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
      createdAt,
      updatedAt: createdAt,
    };

    database.players.push(player);
    syncLinkedUser(player);

    return clone(player);
  },

  async updatePlayer(playerId: string, input: UpdatePlayerInput, actorUserId: string) {
    const player = findPlayer(playerId);
    const actor = findUser(actorUserId);
    const createdAt = nowIso();
    syncUserActiveContext(actor);

    if (
      actor.teamId === player.teamId &&
      findMembershipByUserAndTeam(actor.id, player.teamId)?.canManagePlayers
    ) {
      const previousLinkedUserId = player.linkedUserId ?? null;

      if (typeof input.jerseyNumber === 'number') {
        assertJerseyAvailable(player.teamId, input.jerseyNumber, player.id);
      }

      const linkedUser =
        typeof input.linkedUserId === 'string'
          ? validateLinkedUserAssignment(input.linkedUserId, player.teamId, player.id)
          : null;

      const nextLinkedEmail = validateLinkedEmailAvailability(
        player.teamId,
        linkedUser?.email ??
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

      if (typeof input.fullName === 'string') {
        player.fullName = input.fullName.trim();
      }
      if (typeof input.nickname === 'string') {
        player.nickname = input.nickname.trim();
      }
      if (input.photoUrl !== undefined) {
        player.photoUrl = input.photoUrl;
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
      if (input.linkedUserId !== undefined) {
        player.linkedUserId = input.linkedUserId;
      }
      if (input.linkedEmail !== undefined || nextLinkedEmail !== null) {
        player.linkedEmail = nextLinkedEmail;
      }
      if (input.manualStats !== undefined) {
        player.manualStats = normalizeManualStats(input.manualStats);
      }
    } else {
      if (actor.playerId !== player.id || actor.teamId !== player.teamId) {
        throw new Error('Voce nao tem permissao para editar esse jogador.');
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
      opponentName: input.opponentName.trim(),
      opponentLogoUrl: input.opponentLogoUrl ?? null,
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

    const attendance = findTeamPlayers(input.teamId).map<AttendanceRecord>((player) => ({
      id: createId('attendance'),
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

    return clone(match);
  },

  async updateMatch(matchId: string, input: UpdateMatchInput, actorUserId: string) {
    const match = findMatch(matchId);
    requireTeamAdmin(actorUserId, match.teamId);
    const updatedAt = nowIso();
    const nextStatus = input.status ?? match.status;

    match.seasonId = input.seasonId ?? match.seasonId ?? null;
    match.date = input.date;
    match.time = input.time;
    match.venue = input.venue.trim();
    match.opponentName = input.opponentName.trim();
    match.opponentLogoUrl =
      input.opponentLogoUrl !== undefined
        ? input.opponentLogoUrl
        : match.opponentLogoUrl ?? null;
    match.linePlayersCount = input.linePlayersCount;
    match.matchType = input.matchType;
    match.notes = input.notes?.trim() ?? '';
    match.status = nextStatus;
    if (nextStatus === 'canceled') {
      match.scoreboard = null;
      match.finishedAt = null;
    }
    match.updatedAt = updatedAt;

    return clone(match);
  },

  async updateAttendance(input: UpdateAttendanceInput, actorUserId: string) {
    const match = findMatch(input.matchId);
    const actor = findUser(actorUserId);
    const membership = findMembershipByUserAndTeam(actor.id, match.teamId);
    const now = nowIso();

    if (!membership) {
      throw new Error('Voce ainda nao participa desse time.');
    }

    if (match.status === 'finished' || match.status === 'canceled') {
      throw new Error('A presenca desta partida nao aceita mais alteracoes.');
    }

    ensurePlayerBelongsToTeam(input.playerId, match.teamId);

    const canManageAttendance = membership.canManageTeam === true;
    const isOwnAttendance = membership.playerId === input.playerId;

    if (!canManageAttendance && !isOwnAttendance) {
      throw new Error('Voce so pode responder a sua propria presenca.');
    }

    let record = database.attendance.find(
      (item) => item.matchId === input.matchId && item.playerId === input.playerId,
    );

    if (!record) {
      record = {
        id: createId('attendance'),
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
      return clone(record);
    }

    record.userId =
      isOwnAttendance ? actor.id : record.userId ?? findPlayer(input.playerId).linkedUserId ?? null;
    record.status = input.status;
    record.respondedAt = now;
    record.updatedAt = now;
    return clone(record);
  },

  async saveLineup(input: SaveLineupInput, actorUserId: string) {
    const match = findMatch(input.matchId);
    requireTeamAdmin(actorUserId, match.teamId);
    const now = nowIso();
    const existing = database.lineups.find((item) => item.matchId === input.matchId);
    const confirmedPlayerIds = new Set(
      database.attendance
        .filter((item) => item.matchId === input.matchId && item.status === 'confirmed')
        .map((item) => item.playerId),
    );

    if (match.status === 'finished' || match.status === 'canceled') {
      throw new Error('A escalacao so pode ser salva antes do encerramento da partida.');
    }

    if (confirmedPlayerIds.size === 0) {
      throw new Error('Confirme a presenca do elenco antes de salvar a escalacao.');
    }

    const starterIds = input.starters.map((starter) => starter.playerId);
    const hasDuplicateSlots =
      starterIds.some((playerId, index) => starterIds.indexOf(playerId) !== index) ||
      input.benchPlayerIds.some(
        (playerId, index) => input.benchPlayerIds.indexOf(playerId) !== index,
      ) ||
      starterIds.some((playerId) => input.benchPlayerIds.includes(playerId));

    if (hasDuplicateSlots) {
      throw new Error('A escalacao tem jogadores repetidos. Revise titulares e reservas.');
    }

    for (const starter of input.starters) {
      ensurePlayerBelongsToTeam(starter.playerId, match.teamId);
      if (!confirmedPlayerIds.has(starter.playerId)) {
        throw new Error('A escalacao aceita apenas jogadores confirmados.');
      }
    }

    for (const playerId of input.benchPlayerIds) {
      ensurePlayerBelongsToTeam(playerId, match.teamId);
      if (!confirmedPlayerIds.has(playerId)) {
        throw new Error('A escalacao aceita apenas jogadores confirmados.');
      }
    }

    if (existing) {
      existing.formationKey = input.formationKey;
      existing.starters = clone(input.starters);
      existing.benchPlayerIds = [...input.benchPlayerIds];
      existing.updatedAt = now;
      return clone(existing);
    }

    const lineup = {
      id: createId('lineup'),
      teamId: match.teamId,
      matchId: input.matchId,
      formationKey: input.formationKey,
      starters: clone(input.starters),
      benchPlayerIds: [...input.benchPlayerIds],
      createdAt: now,
      updatedAt: now,
    };

    database.lineups.push(lineup);
    return clone(lineup);
  },

  async finishMatch(input: FinishMatchInput, actorUserId: string) {
    const match = findMatch(input.matchId);
    requireTeamAdmin(actorUserId, match.teamId);

    const now = nowIso();
    const confirmedPlayerIds = new Set(getConfirmedPlayerIds(snapshotFromDatabase(database), match.id));
    const starterIds = new Set(findLineup(match.id)?.starters.map((item) => item.playerId) ?? []);

    for (const stat of input.playerStats) {
      if (!confirmedPlayerIds.has(stat.playerId)) {
        throw new Error('Somente jogadores confirmados podem receber estatisticas da partida.');
      }
      if (stat.goals < 0 || stat.assists < 0) {
        throw new Error('Gols e assistencias nao podem ser negativos.');
      }
    }

    const submittedMap = input.playerStats.reduce<Record<string, { goals: number; assists: number }>>(
      (acc, stat) => {
        acc[stat.playerId] = { goals: stat.goals, assists: stat.assists };
        return acc;
      },
      {},
    );

    database.matchStats = database.matchStats.filter((item) => item.matchId !== match.id);

    const statsToInsert = [...confirmedPlayerIds].map<MatchStat>((playerId) => ({
      id: createId('stat'),
      teamId: match.teamId,
      matchId: match.id,
      playerId,
      played: true,
      started: starterIds.has(playerId),
      goals: submittedMap[playerId]?.goals ?? 0,
      assists: submittedMap[playerId]?.assists ?? 0,
      yellowCards: 0,
      redCards: 0,
      createdAt: now,
      updatedAt: now,
    }));

    database.matchStats.push(...statsToInsert);

    match.scoreboard = {
      team: input.teamScore,
      opponent: input.opponentScore,
      result: calculateMatchResult(input.teamScore, input.opponentScore),
    };
    match.status = 'finished';
    match.finishedAt = now;
    match.updatedAt = now;

    return clone(match);
  },

  async submitMvpVote(input: SubmitMvpVoteInput, actorUserId: string) {
    const match = findMatch(input.matchId);
    const { actor, player: voter } = requireLinkedPlayer(actorUserId);
    const now = nowIso();

    if (actor.teamId !== match.teamId || match.status !== 'finished') {
      throw new Error('A votacao de MVP so fica disponivel apos o encerramento da partida.');
    }

    if (!getConfirmedPlayerIds(snapshotFromDatabase(database), match.id).includes(voter.id)) {
      throw new Error('Apenas jogadores confirmados podem votar no MVP.');
    }

    const targetPlayer = ensurePlayerBelongsToTeam(input.targetPlayerId, match.teamId);

    if (!getConfirmedPlayerIds(snapshotFromDatabase(database), match.id).includes(targetPlayer.id)) {
      throw new Error('Nao e possivel votar em quem nao participou da partida.');
    }

    const alreadyVoted = database.mvpVotes.find(
      (vote) => vote.matchId === match.id && vote.voterPlayerId === voter.id,
    );

    if (alreadyVoted) {
      throw new Error('Voce ja votou no MVP desta partida.');
    }

    const vote: MvpVote = {
      id: createId('mvp'),
      teamId: match.teamId,
      matchId: match.id,
      voterPlayerId: voter.id,
      targetPlayerId: targetPlayer.id,
      createdAt: now,
      updatedAt: now,
    };

    database.mvpVotes.push(vote);
    syncMvpMatchFields(match.id);

    return clone(vote);
  },

  async submitPlayerRating(input: SubmitPlayerRatingInput, actorUserId: string) {
    const match = findMatch(input.matchId);
    const { actor, player: rater } = requireLinkedPlayer(actorUserId);
    const now = nowIso();

    if (actor.teamId !== match.teamId || match.status !== 'finished') {
      throw new Error('As avaliacoes so ficam disponiveis apos o encerramento da partida.');
    }

    const eligiblePlayerIds = getConfirmedPlayerIds(snapshotFromDatabase(database), match.id);

    if (!eligiblePlayerIds.includes(rater.id)) {
      throw new Error('Apenas jogadores confirmados podem avaliar a partida.');
    }

    const targetPlayer = ensurePlayerBelongsToTeam(input.targetPlayerId, match.teamId);

    if (!eligiblePlayerIds.includes(targetPlayer.id)) {
      throw new Error('Nao e possivel avaliar quem nao participou da partida.');
    }

    if (targetPlayer.id === rater.id) {
      throw new Error('Nao e permitido avaliar a si mesmo.');
    }

    const duplicate = database.playerRatings.find(
      (rating) =>
        rating.matchId === match.id &&
        rating.raterPlayerId === rater.id &&
        rating.targetPlayerId === targetPlayer.id,
    );

    if (duplicate) {
      throw new Error('Voce ja avaliou este jogador nesta partida.');
    }

    validateRatingCriteria(input.criteria);

    const rating: PlayerRating = {
      id: createId('rating'),
      teamId: match.teamId,
      matchId: match.id,
      raterPlayerId: rater.id,
      targetPlayerId: targetPlayer.id,
      criteria: clone(input.criteria),
      overall: Number(average(Object.values(input.criteria)).toFixed(1)),
      createdAt: now,
      updatedAt: now,
    };

    database.playerRatings.push(rating);
    return clone(rating);
  },
};
