export const AD_PLACEMENTS = {
  HOME_AFTER_NEXT_MATCH: 'home-after-next-match',
  PUBLIC_TEAM_AFTER_STATS: 'public-team-after-stats',
  TOOLS_AFTER_RESULT: 'tools-after-result',
  TOOLS_HUB_AFTER_CARDS: 'tools-hub-after-cards',
} as const;

export type AdPlacement = (typeof AD_PLACEMENTS)[keyof typeof AD_PLACEMENTS];

export const PUBLIC_TOOLS_AD_ROUTES = [
  '/ferramentas',
  '/ferramentas/sorteador-de-times',
  '/ferramentas/cronometro-pelada',
  '/ferramentas/rodizio-de-times',
  '/ferramentas/campeonato-rapido',
] as const;

export const PUBLIC_TOOLS_AD_PLACEMENTS = [
  AD_PLACEMENTS.TOOLS_AFTER_RESULT,
  AD_PLACEMENTS.TOOLS_HUB_AFTER_CARDS,
] as const;

export function isAllowedToolsAdRoute(pathname: string | null | undefined) {
  if (!pathname) {
    return false;
  }

  return PUBLIC_TOOLS_AD_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

export function isAllowedToolsAdPlacement(placement: AdPlacement) {
  return PUBLIC_TOOLS_AD_PLACEMENTS.includes(
    placement as (typeof PUBLIC_TOOLS_AD_PLACEMENTS)[number],
  );
}

export const MATCH_CREATE_INTERSTITIAL_COOLDOWN_MS = 10 * 60 * 1000;
