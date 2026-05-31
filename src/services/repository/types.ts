import type {
  AppNotification,
  AttendanceRecord,
  AttendanceStatus,
  FootPreference,
  Lineup,
  LineupNode,
  Match,
  MatchDiaryEntry,
  MatchDiaryMood,
  MatchStat,
  MatchType,
  MvpVote,
  ManualPlayerStats,
  Player,
  PlayerRating,
  Position,
  TeamRatingCriterion,
  Season,
  Team,
  TeamMember,
  User,
} from '@/types/domain';
import type {
  ImportLegacyMatchesResult,
  ImportedMatchPayloadItem,
  LegacyMatchImportPreview,
  RegisterFinishedMatchPlayerInput,
} from '@/types/match-import';

export type RepositoryMode = 'mock' | 'firebase';

export interface AppSnapshot {
  users: User[];
  teams: Team[];
  teamMembers: TeamMember[];
  players: Player[];
  matches: Match[];
  lineups: Lineup[];
  attendance: AttendanceRecord[];
  matchStats: MatchStat[];
  matchDiaryEntries: MatchDiaryEntry[];
  mvpVotes: MvpVote[];
  playerRatings: PlayerRating[];
  ratingCriteria: TeamRatingCriterion[];
  notifications: AppNotification[];
  seasons: Season[];
}

export interface UserCredential {
  userId: string;
  email: string;
  password: string;
}

export interface MockDatabase extends AppSnapshot {
  credentials: UserCredential[];
}

export const emptySnapshot: AppSnapshot = {
  users: [],
  teams: [],
  teamMembers: [],
  players: [],
  matches: [],
  lineups: [],
  attendance: [],
  matchStats: [],
  matchDiaryEntries: [],
  mvpVotes: [],
  playerRatings: [],
  ratingCriteria: [],
  notifications: [],
  seasons: [],
};

export interface LoginInput {
  email: string;
  password: string;
}

export interface GoogleLoginInput {
  idToken: string;
  accessToken?: string | null;
}

export interface RegisterInput {
  displayName: string;
  email: string;
  password: string;
}

export interface CreateTeamInput {
  name: string;
  coachName: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor?: string | null;
  logoUrl?: string | null;
  bannerUrl?: string | null;
  presentationVideoUrl?: string | null;
  description?: string | null;
}

export interface UpdateTeamInput {
  name: string;
  coachName: string;
  slug: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor?: string | null;
  logoUrl?: string | null;
  bannerUrl?: string | null;
  presentationVideoUrl?: string | null;
  description?: string | null;
}

export interface CreateMatchInput {
  teamId: string;
  seasonId?: string | null;
  date: string;
  time: string;
  venue: string;
  locationUrl?: string | null;
  opponentName: string;
  opponentLogoUrl?: string | null;
  linePlayersCount: number;
  matchType: MatchType;
  notes?: string;
}

export interface UpdateMatchInput {
  seasonId?: string | null;
  date: string;
  time: string;
  venue: string;
  locationUrl?: string | null;
  opponentName: string;
  opponentLogoUrl?: string | null;
  linePlayersCount: number;
  matchType: MatchType;
  notes?: string;
  status?: Match['status'];
}

export interface UpdateAttendanceInput {
  matchId: string;
  playerId: string;
  status: AttendanceStatus;
}

export interface SaveLineupInput {
  matchId: string;
  formationKey: string;
  starters: LineupNode[];
  benchPlayerIds: string[];
}

export interface PlayerDraftInput {
  fullName: string;
  nickname: string;
  photoUrl?: string | null;
  presentationVideoUrl?: string | null;
  jerseyNumber: number;
  primaryPosition: Position;
  secondaryPositions: Position[];
  dominantFoot: FootPreference;
  status: 'active' | 'injured' | 'suspended' | 'inactive';
  bio?: string;
  preferredPosition?: Position | null;
  introVideoUrl?: string | null;
  celebrationVideoUrl?: string | null;
}

export interface CreatePlayerInput extends PlayerDraftInput {
  teamId: string;
  linkedUserId?: string | null;
  linkedEmail?: string | null;
  manualStats?: ManualPlayerStats;
  allowSelfEditJerseyNumber?: boolean;
}

export interface UpdatePlayerInput extends Partial<PlayerDraftInput> {
  linkedUserId?: string | null;
  linkedEmail?: string | null;
  manualStats?: ManualPlayerStats;
  allowSelfEditJerseyNumber?: boolean;
}

export interface JoinTeamResult {
  team: Team;
  alreadyMember: boolean;
}

export interface SnapshotSubscriptionHandlers {
  onSnapshot: (snapshot: AppSnapshot) => void;
  onError?: (error: unknown) => void;
}

export interface FinishMatchPlayerStatInput {
  playerId: string;
  goals: number;
  assists: number;
}

export interface FinishMatchInput {
  matchId: string;
  teamScore: number;
  opponentScore: number;
  ownGoalsForTeam?: number;
  playerStats: FinishMatchPlayerStatInput[];
}

export interface RegisterFinishedMatchInput {
  seasonId?: string | null;
  date: string;
  time?: string | null;
  venue?: string | null;
  locationUrl?: string | null;
  opponentName: string;
  opponentLogoUrl?: string | null;
  linePlayersCount?: number | null;
  matchType: MatchType;
  notes?: string | null;
  teamScore: number;
  opponentScore: number;
  players: RegisterFinishedMatchPlayerInput[];
}

export interface SubmitMvpVoteInput {
  matchId: string;
  targetPlayerId: string;
}

export interface SubmitPlayerRatingInput {
  matchId: string;
  targetPlayerId: string;
  criteriaScores: Record<string, number>;
}

export interface MatchDiaryEntryDraftInput {
  title?: string | null;
  content: string;
  mentionedPlayerIds?: string[];
  visibility?: 'team';
  pinned?: boolean;
  mood?: MatchDiaryMood | null;
  emoji?: string | null;
}

export interface CreateMatchDiaryEntryInput extends MatchDiaryEntryDraftInput {
  matchId: string;
  notifyTeam?: boolean;
}

export interface UpdateMatchDiaryEntryInput {
  title?: string | null;
  content?: string;
  mentionedPlayerIds?: string[];
  pinned?: boolean;
  mood?: MatchDiaryMood | null;
  emoji?: string | null;
  notifyTeam?: boolean;
}

export interface CreateRatingCriterionInput {
  label: string;
  description?: string | null;
  type: TeamRatingCriterion['type'];
  weight?: number | null;
  active?: boolean;
}

export interface UpdateRatingCriterionInput {
  label?: string;
  description?: string | null;
  type?: TeamRatingCriterion['type'];
  weight?: number | null;
  active?: boolean;
  order?: number;
}

export interface AppRepository {
  getMode(): RepositoryMode;
  getInitialSnapshot(): Promise<AppSnapshot>;
  getSnapshot(): Promise<AppSnapshot>;
  subscribeSnapshot?(
    currentUserId: string,
    handlers: SnapshotSubscriptionHandlers,
  ): Promise<() => void> | (() => void);
  login(input: LoginInput): Promise<User>;
  loginWithGoogle(input: GoogleLoginInput): Promise<User>;
  register(input: RegisterInput): Promise<User>;
  resetPassword(email: string): Promise<void>;
  createTeam(input: CreateTeamInput, adminUserId: string): Promise<Team>;
  updateTeam(teamId: string, input: UpdateTeamInput, actorUserId: string): Promise<Team>;
  regenerateTeamInviteCode(teamId: string, actorUserId: string): Promise<Team>;
  createRatingCriterion(
    input: CreateRatingCriterionInput,
    actorUserId: string,
  ): Promise<TeamRatingCriterion>;
  updateRatingCriterion(
    criterionId: string,
    input: UpdateRatingCriterionInput,
    actorUserId: string,
  ): Promise<TeamRatingCriterion>;
  deleteRatingCriterion(
    criterionId: string,
    actorUserId: string,
  ): Promise<void>;
  setActiveTeam(teamId: string, userId: string): Promise<User>;
  joinTeamWithInviteCode(inviteCode: string, userId: string): Promise<JoinTeamResult>;
  createPlayer(input: CreatePlayerInput, actorUserId: string): Promise<Player>;
  updatePlayer(playerId: string, input: UpdatePlayerInput, actorUserId: string): Promise<Player>;
  removePlayer(playerId: string, actorUserId: string): Promise<Player>;
  reactivatePlayer(playerId: string, actorUserId: string): Promise<Player>;
  createMatch(input: CreateMatchInput, creatorUserId: string): Promise<Match>;
  updateMatch(matchId: string, input: UpdateMatchInput, actorUserId: string): Promise<Match>;
  updateAttendance(input: UpdateAttendanceInput, actorUserId: string): Promise<AttendanceRecord>;
  saveLineup(input: SaveLineupInput, actorUserId: string): Promise<Lineup>;
  finishMatch(input: FinishMatchInput, actorUserId: string): Promise<Match>;
  registerFinishedMatch(
    input: RegisterFinishedMatchInput,
    actorUserId: string,
  ): Promise<Match>;
  previewLegacyMatchImport(
    payload: ImportedMatchPayloadItem[],
    actorUserId: string,
  ): Promise<LegacyMatchImportPreview>;
  importLegacyMatches(
    payload: ImportedMatchPayloadItem[],
    actorUserId: string,
  ): Promise<ImportLegacyMatchesResult>;
  createMatchDiaryEntry(
    input: CreateMatchDiaryEntryInput,
    actorUserId: string,
  ): Promise<MatchDiaryEntry>;
  updateMatchDiaryEntry(
    entryId: string,
    input: UpdateMatchDiaryEntryInput,
    actorUserId: string,
  ): Promise<MatchDiaryEntry>;
  deleteMatchDiaryEntry(entryId: string, actorUserId: string): Promise<void>;
  fetchMatchDiaryEntriesByMatchId(
    matchId: string,
    actorUserId: string,
  ): Promise<MatchDiaryEntry[]>;
  listMatchDiaryEntriesForTeam(
    teamId: string,
    actorUserId: string,
    limit?: number,
  ): Promise<MatchDiaryEntry[]>;
  submitMvpVote(input: SubmitMvpVoteInput, actorUserId: string): Promise<MvpVote>;
  submitPlayerRating(
    input: SubmitPlayerRatingInput,
    actorUserId: string,
  ): Promise<PlayerRating>;
  markNotificationAsRead(notificationId: string, actorUserId: string): Promise<void>;
  markAllNotificationsAsRead(actorUserId: string): Promise<void>;
}
