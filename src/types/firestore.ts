import type {
  AppNotification,
  AttendanceRecord,
  Lineup,
  Match,
  MatchStat,
  MvpVote,
  Player,
  PlayerRating,
  Season,
  Team,
  TeamMember,
  TeamRatingCriterion,
  User,
} from '@/types/domain';

export const FIRESTORE_COLLECTIONS = {
  users: 'users',
  teams: 'teams',
  teamMembers: 'teamMembers',
  players: 'players',
  matches: 'matches',
  lineups: 'lineups',
  attendance: 'attendance',
  matchStats: 'matchStats',
  mvpVotes: 'mvpVotes',
  playerRatings: 'playerRatings',
  ratingCriteria: 'ratingCriteria',
  notifications: 'notifications',
  seasons: 'seasons',
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
export type FirestoreTeamMemberDocument = TeamMember;
export type FirestoreTeamRatingCriterionDocument = TeamRatingCriterion;
export type FirestorePlayerDocument = Player;
export type FirestoreMatchDocument = Match;
export type FirestoreLineupDocument = Lineup;
export type FirestoreAttendanceDocument = AttendanceRecord;
export type FirestoreMatchStatDocument = MatchStat;
export type FirestoreMvpVoteDocument = MvpVote;
export type FirestorePlayerRatingDocument = PlayerRating;
export type FirestoreNotificationDocument = AppNotification;
export type FirestorePostMatchDocument =
  | FirestoreMatchStatDocument
  | FirestoreMvpVoteDocument
  | FirestorePlayerRatingDocument;
export type FirestoreSeasonDocument = Season;
