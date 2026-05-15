import type { MatchType } from './domain';

export type MatchImportPlayerResolutionSource =
  | 'linkedUserId'
  | 'email'
  | 'jerseyNumber'
  | 'name'
  | 'nickname';

export interface RegisterFinishedMatchPlayerInput {
  playerId: string;
  played: boolean;
  started?: boolean;
  goals: number;
  assists: number;
}

export interface ImportedMatchPlayerPayload {
  linkedUserId?: string | null;
  email?: string | null;
  jerseyNumber?: number | null;
  name?: string | null;
  played?: boolean;
  started?: boolean;
  goals?: number;
  assists?: number;
}

export interface ImportedMatchPayloadItem {
  date: string;
  time?: string | null;
  opponentName: string;
  venue?: string | null;
  matchType: MatchType;
  teamScore: number;
  opponentScore: number;
  players: ImportedMatchPlayerPayload[];
  notes?: string | null;
  locationUrl?: string | null;
  opponentLogoUrl?: string | null;
  linePlayersCount?: number | null;
}

export interface LegacyMatchImportPlayerPreview {
  sourceIndex: number;
  played: boolean;
  started: boolean;
  goals: number;
  assists: number;
  lookupLabel: string;
  status: 'matched' | 'unmatched' | 'conflict' | 'ignored';
  matchedPlayerId?: string | null;
  matchedPlayerName?: string | null;
  matchedPlayerJerseyNumber?: number | null;
  resolutionSource?: MatchImportPlayerResolutionSource | null;
  message?: string | null;
}

export interface LegacyMatchImportPreviewItem {
  sourceIndex: number;
  status: 'ready' | 'duplicate' | 'invalid';
  date: string;
  time: string;
  opponentName: string;
  venue: string;
  matchType: MatchType;
  teamScore: number;
  opponentScore: number;
  warnings: string[];
  errors: string[];
  duplicateMatchId?: string | null;
  players: LegacyMatchImportPlayerPreview[];
  matchedPlayerCount: number;
  unresolvedPlayerCount: number;
  conflictCount: number;
}

export interface LegacyMatchImportPreviewSummary {
  totalMatches: number;
  readyMatches: number;
  duplicateMatches: number;
  invalidMatches: number;
  matchedPlayers: number;
  unresolvedPlayers: number;
  conflicts: number;
}

export interface LegacyMatchImportPreview {
  summary: LegacyMatchImportPreviewSummary;
  items: LegacyMatchImportPreviewItem[];
}

export interface ImportLegacyMatchesResult {
  createdMatches: number;
  skippedDuplicates: number;
  invalidMatches: number;
  createdMatchIds: string[];
}
