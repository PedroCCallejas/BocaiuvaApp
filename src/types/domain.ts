export type AppRole = 'owner' | 'team_admin' | 'player';
export type TeamMemberRole = 'admin' | 'player';
export type TeamMemberStatus = 'active' | 'inactive';

export type MatchType = 'society' | 'futsal' | 'field' | 'training';

export type MatchStatus = 'scheduled' | 'confirmed' | 'finished' | 'canceled';
export type PublicOpponentSource = 'manual' | 'public_team';

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

export type LegacyRatingCriterionId =
  | 'dedicacao'
  | 'energia'
  | 'qualidade'
  | 'decisivo'
  | 'preciosismo'
  | 'reclamacao'
  | 'fominha'
  | 'marra';

export type RatingCriterion = string;
export type RatingCriterionType = 'positive' | 'negative';
export type MatchDiaryVisibility = 'team';
export type MatchDiaryMood =
  | 'funny'
  | 'highlight'
  | 'warning'
  | 'praise'
  | 'neutral';

export type NotificationType =
  | 'match-created'
  | 'match-updated'
  | 'attendance-confirmed'
  | 'attendance-absent'
  | 'lineup-published'
  | 'match-finished'
  | 'mvp-voting-opened'
  | 'mvp-winner'
  | 'ratings-opened'
  | 'match-diary-published';

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
  /** Deprecated: team creation now depends on owned-team count, kept only for compatibility. */
  canCreateTeam: boolean;
  activeTeamId: string | null;
  teamId?: string | null;
  playerId?: string | null;
  avatarUrl?: string | null;
  notificationTokens?: string[];
}

export interface TeamMember extends BaseEntity {
  userId: string;
  teamId: string;
  playerId: string | null;
  inviteCodeUsed?: string | null;
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
  bannerUrl?: string | null;
  presentationVideoUrl?: string | null;
  isPublic?: boolean;
  city?: string | null;
  state?: string | null;
  neighborhood?: string | null;
  homeFieldName?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  contactWhatsapp?: string | null;
  publicDescription?: string | null;
  allowFriendlyContact?: boolean;
  publicRosterEnabled?: boolean;
  primaryColor: string;
  secondaryColor: string;
  accentColor?: string | null;
  description?: string | null;
  inviteCode: string;
  inviteCodeUpdatedAt: string;
  coachName: string;
  adminUserId: string;
  activeSeasonId?: string | null;
  defaultMatchCostCents?: number | null;
}

export interface TeamRatingCriterion extends BaseEntity {
  teamId: string;
  label: string;
  description?: string | null;
  type: RatingCriterionType;
  weight: number;
  active: boolean;
  order: number;
}

export interface Player extends BaseEntity {
  teamId: string;
  linkedUserId?: string | null;
  linkedEmail?: string | null;
  fullName: string;
  nickname: string;
  photoUrl?: string | null;
  presentationVideoUrl?: string | null;
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

export interface PublicTeamStats {
  games: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  pointsRate: number;
}

export interface PublicTeamRosterPlayer {
  id: string;
  fullName: string;
  nickname: string;
  photoUrl?: string | null;
  primaryPosition: Position;
  jerseyNumber: number;
  presentationVideoUrl?: string | null;
}

export interface PublicTeamSummary {
  id: string;
  slug: string;
  name: string;
  logoUrl?: string | null;
  bannerUrl?: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor?: string | null;
  city: string;
  state: string;
  neighborhood?: string | null;
  homeFieldName?: string | null;
  publicDescription?: string | null;
  allowFriendlyContact: boolean;
  contactName?: string | null;
  contactPhone?: string | null;
  contactWhatsapp?: string | null;
  stats: PublicTeamStats;
}

export interface PublicTeamProfile extends PublicTeamSummary {
  presentationVideoUrl?: string | null;
  publicRosterEnabled: boolean;
  roster: PublicTeamRosterPlayer[];
}

export interface Scoreboard {
  team: number;
  opponent: number;
  ownGoalsForTeam?: number;
  result: MatchResult;
}

export interface MatchFieldCost {
  totalAmount: number;
  splitCount: number;
  amountPerPlayer: number;
  currency: 'BRL';
  note?: string | null;
  updatedAt?: string;
  updatedByUserId?: string;
}

export interface MatchFieldPayment {
  payerPlayerIds: string[];
  paidGuestCount?: number;
  pixKey?: string | null;
  responsibleName?: string | null;
  updatedAt?: string;
  updatedByUserId?: string;
}

/**
 * Categoria de despesa criada livremente pelo admin ("Cerveja", "Bola",
 * "Churrasco pós-jogo"). Arquivar em vez de apagar preserva o histórico
 * das despesas antigas que apontam para ela.
 */
export interface ExpenseCategory extends BaseEntity {
  teamId: string;
  label: string;
  archivedAt?: string | null;
}

/** `equal` divide igual entre os participantes; `manual` usa valores por pessoa. */
export type ExpenseSplitMode = 'equal' | 'manual';

/**
 * Despesa do time. Nasce solta: `matchId` é opcional e só é preenchido
 * quando o admin escolhe vincular a despesa a uma partida.
 * Os participantes são sempre definidos à mão — quem consumiu não é
 * necessariamente quem jogou.
 */
export interface Expense extends BaseEntity {
  teamId: string;
  categoryId: string;
  matchId?: string | null;
  description?: string | null;
  date: string;
  totalAmountCents: number;
  paidByPlayerId?: string | null;
  splitMode: ExpenseSplitMode;
  participantPlayerIds: string[];
  extraSharesCount?: number;
  manualSharesCents?: Record<string, number>;
  settledPlayerIds: string[];
  createdBy?: string | null;
  deletedAt?: string | null;
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
  opponentTeamId?: string | null;
  opponentTeamName?: string | null;
  opponentTeamLogoUrl?: string | null;
  opponentSource?: PublicOpponentSource | null;
  linePlayersCount: number;
  matchType: MatchType;
  notes?: string;
  status: MatchStatus;
  createdBy: string;
  scoreboard?: Scoreboard | null;
  fieldCost?: MatchFieldCost | null;
  fieldPayment?: MatchFieldPayment | null;
  finishedAt?: string | null;
  mvpWinnerPlayerIds?: string[];
  mvpTotalVotes?: number;
  deletedAt?: string | null;
  deletedBy?: string | null;
  manualMvpPlayerId?: string | null;
  manualMvpSelectedBy?: string | null;
  manualMvpSelectedAt?: string | null;
}

export interface LineupNode {
  playerId: string;
  x: number;
  y: number;
  zone: LineupZone;
  label?: string | null;
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

export interface PlayerRatingCriteriaSnapshotItem {
  criterionId: string;
  label: string;
  type: RatingCriterionType;
  weight: number;
  order: number;
}

export interface PlayerRating extends BaseEntity {
  teamId: string;
  matchId: string;
  raterPlayerId: string;
  targetPlayerId: string;
  criteriaScores?: Record<string, number>;
  criteriaSnapshot?: Record<string, PlayerRatingCriteriaSnapshotItem>;
  criteria?: Partial<Record<LegacyRatingCriterionId, number>>;
  overall: number;
}

export interface MatchDiaryEntry extends BaseEntity {
  teamId: string;
  matchId: string;
  authorUserId: string;
  authorName: string;
  title?: string | null;
  content: string;
  mentionedPlayerIds: string[];
  visibility: MatchDiaryVisibility;
  pinned?: boolean;
  mood?: MatchDiaryMood | null;
  emoji?: string | null;
}

export interface AppNotification extends BaseEntity {
  teamId: string;
  type: NotificationType;
  title: string;
  message: string;
  matchId?: string | null;
  playerId?: string | null;
  entryId?: string | null;
  actorUserId?: string | null;
  targetUserId?: string | null;
  readByUserIds: string[];
}

export type PostMatchCollectionKey = 'matchStats' | 'mvpVotes' | 'playerRatings';
export type PostMatchEntity = MatchStat | MvpVote | PlayerRating;

export interface Season extends BaseEntity {
  teamId: string;
  name: string;
  year: number;
  startDate: string;
  endDate: string;
  status: SeasonStatus;
}
