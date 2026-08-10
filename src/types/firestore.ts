import type {
  AppNotification,
  AttendanceRecord,
  Lineup,
  Match,
  MatchDiaryEntry,
  MatchStat,
  MvpVote,
  Player,
  PlayerRating,
  PublicTeamProfile,
  Season,
  Team,
  TeamMember,
  TeamMemberRole,
  TeamRatingCriterion,
  User,
} from '@/types/domain';

export const FIRESTORE_COLLECTIONS = {
  users: 'users',
  teams: 'teams',
  publicTeams: 'publicTeams',
  teamInvites: 'teamInvites',
  teamMembershipIndex: 'teamMembershipIndex',
  teamMembers: 'teamMembers',
  players: 'players',
  matches: 'matches',
  lineups: 'lineups',
  attendance: 'attendance',
  matchStats: 'matchStats',
  matchDiaryEntries: 'matchDiaryEntries',
  mvpVotes: 'mvpVotes',
  playerRatings: 'playerRatings',
  ratingCriteria: 'ratingCriteria',
  notifications: 'notifications',
  seasons: 'seasons',
  expenseCategories: 'expenseCategories',
  expenses: 'expenses',
} as const;

export const FIRESTORE_POST_MATCH_COLLECTIONS = {
  matchStats: FIRESTORE_COLLECTIONS.matchStats,
  mvpVotes: FIRESTORE_COLLECTIONS.mvpVotes,
  playerRatings: FIRESTORE_COLLECTIONS.playerRatings,
} as const;

export type FirestoreCollectionName =
  (typeof FIRESTORE_COLLECTIONS)[keyof typeof FIRESTORE_COLLECTIONS];

export type FirestoreUserDocument = User;
export type FirestoreTeamDocument = Team;
export type FirestorePublicTeamDocument = PublicTeamProfile & {
  adminUserId: string;
  sourceTeamUpdatedAt: string;
  syncedAt: string;
};
export type FirestoreTeamInviteDocument = {
  id: string;
  code: string;
  teamId: string;
  teamName: string;
  teamSlug: string;
  teamLogoUrl?: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor?: string | null;
  adminUserId: string;
  createdAt: string;
  updatedAt: string;
};
export type FirestoreTeamMembershipIndexDocument = {
  id: string;
  membershipId: string;
  sourceTeamMemberId: string;
  teamId: string;
  userId: string;
  playerId: string | null;
  role: TeamMemberRole | null;
  roles: TeamMember['roles'];
  canManageTeam: boolean;
  canManagePlayers: boolean;
  joinedAt: string;
  status: TeamMember['status'];
  createdAt: string;
  updatedAt: string;
};
export type FirestoreTeamMemberDocument = TeamMember;
export type FirestoreTeamRatingCriterionDocument = TeamRatingCriterion;
export type FirestorePlayerDocument = Player;
export type FirestoreMatchDocument = Match;
export type FirestoreLineupDocument = Lineup;
export type FirestoreAttendanceDocument = AttendanceRecord;
export type FirestoreMatchStatDocument = MatchStat;
export type FirestoreMatchDiaryEntryDocument = MatchDiaryEntry;
export type FirestoreMvpVoteDocument = MvpVote;
export type FirestorePlayerRatingDocument = PlayerRating;
export type FirestoreNotificationDocument = AppNotification;
export type FirestorePostMatchDocument =
  | FirestoreMatchStatDocument
  | FirestoreMvpVoteDocument
  | FirestorePlayerRatingDocument;
export type FirestoreSeasonDocument = Season;
