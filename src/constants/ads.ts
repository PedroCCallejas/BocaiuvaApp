export const AD_PLACEMENTS = {
  HOME_AFTER_NEXT_MATCH: 'home-after-next-match',
  PUBLIC_TEAM_AFTER_STATS: 'public-team-after-stats',
  TOOLS_AFTER_RESULT: 'tools-after-result',
  TOOLS_HUB_AFTER_CARDS: 'tools-hub-after-cards',
} as const;

export type AdPlacement = (typeof AD_PLACEMENTS)[keyof typeof AD_PLACEMENTS];

export const MATCH_CREATE_INTERSTITIAL_COOLDOWN_MS = 10 * 60 * 1000;
