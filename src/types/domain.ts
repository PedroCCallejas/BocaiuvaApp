export type AppRole = 'owner' | 'team_admin' | 'player';
export type TeamMemberRole = 'admin' | 'player';
export type TeamMemberStatus = 'active' | 'inactive';

export type MatchType = 'society' | 'futsal' | 'field' | 'training';

export type MatchStatus = 'scheduled' | 'confirmed' | 'finished' | 'canceled';

export type PlayerStatus = 'active' | 'injured' | 'suspended' | 'inactive';

export type AttendanceStatus = 'confirmed' | 'absent' | 'pending';

export type FootPreference = 'right' | 'left' | 'both';

export type MatchResult = 'win' | 'draw' | 'loss';

export type Position =
  | 'goalkeeper'
  | 'right-back'
  | 'center-back'
  | 'left-back'
  | 'wing-back'
  | 'defensive-midfielder'
  | 'midfielder'
  | 'attacking-midfielder'
  | 'winger'
  | 'forward'
  | 'striker';

export type LineupZone = 'goalkeeper' | 'defense' | 'midfield' | 'attack';

export type SeasonStatus = 'planned' | 'active' | 'completed';

export type RatingCriterion =
  | 'marking'
  | 'attack'
  | 'defense'
  | 'stamina'
  | 'resistance'
  | 'grit'
  | 'flair'
  | 'passing'
  | 'finishing';

export interface BaseEntity {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export interface ManualPlayerStats {
  matches: number;
  goals: number;
  assists: number;
  wins: number;
  draws: number;
  losses: number;
  mvps: number;
}

export interface User extends BaseEntity {
  email: string;
  displayName: string;
  appRole: AppRole;
  canCreateTeam: boolean;
  activeTeamId: string | null;
  teamId?: string | null;
  playerId?: string | null;
  avatarUrl?: string | null;
}

export interface TeamMember extends BaseEntity {
  userId: string;
  teamId: string;
  playerId: string | null;
  roles: TeamMemberRole[];
  canManageTeam: boolean;
  canManagePlayers: boolean;
  joinedAt: string;
  status: TeamMemberStatus;
}

export interface Team extends BaseEntity {
  name: string;
  slug: string;
  logoUrl?: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor?: string | null;
  description?: string | null;
  inviteCode: string;
  inviteCodeUpdatedAt: string;
  coachName: string;
  adminUserId: string;
  activeSeasonId?: string | null;
}

export interface Player extends BaseEntity {
  teamId: string;
  linkedUserId?: string | null;
  linkedEmail?: string | null;
  fullName: string;
  nickname: string;
  photoUrl?: string | null;
  jerseyNumber: number;
  primaryPosition: Position;
  secondaryPositions: Position[];
  dominantFoot: FootPreference;
  status: PlayerStatus;
  bio?: string;
  preferredPosition?: Position | null;
  allowSelfEditJerseyNumber?: boolean;
  introVideoUrl?: string | null;
  celebrationVideoUrl?: string | null;
  manualStats?: ManualPlayerStats;
  deletedAt?: string | null;
}

export interface Scoreboard {
  team: number;
  opponent: number;
  result: MatchResult;
}

export interface Match extends BaseEntity {
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
  status: MatchStatus;
  createdBy: string;
  scoreboard?: Scoreboard | null;
  finishedAt?: string | null;
  mvpWinnerPlayerIds?: string[];
  mvpTotalVotes?: number;
}

export interface LineupNode {
  playerId: string;
  x: number;
  y: number;
  zone: LineupZone;
}

export interface Lineup extends BaseEntity {
  teamId: string;
  matchId: string;
  formationKey: string;
  starters: LineupNode[];
  benchPlayerIds: string[];
}

export interface AttendanceRecord extends BaseEntity {
  teamId: string;
  matchId: string;
  playerId: string;
  userId?: string | null;
  status: AttendanceStatus;
  respondedAt?: string | null;
}

export interface MatchStat extends BaseEntity {
  teamId: string;
  matchId: string;
  playerId: string;
  played: boolean;
  started?: boolean;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  notes?: string;
}

export interface MvpVote extends BaseEntity {
  teamId: string;
  matchId: string;
  voterPlayerId: string;
  targetPlayerId: string;
}

export interface PlayerRating extends BaseEntity {
  teamId: string;
  matchId: string;
  raterPlayerId: string;
  targetPlayerId: string;
  criteria: Record<RatingCriterion, number>;
  overall: number;
}

export interface Season extends BaseEntity {
  teamId: string;
  name: string;
  year: number;
  startDate: string;
  endDate: string;
  status: SeasonStatus;
}
