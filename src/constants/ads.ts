export const AD_PLACEMENTS = {
  HOME_AFTER_NEXT_MATCH: 'home-after-next-match',
  PUBLIC_TEAM_AFTER_STATS: 'public-team-after-stats',
} as const;

export type AdPlacement = (typeof AD_PLACEMENTS)[keyof typeof AD_PLACEMENTS];

export const ADS_ENABLED = process.env.EXPO_PUBLIC_ENABLE_ADS === 'true';
export const MATCH_CREATE_INTERSTITIAL_COOLDOWN_MS = 10 * 60 * 1000;
