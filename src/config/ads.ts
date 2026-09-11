import { AD_PLACEMENTS, type AdPlacement } from '@/constants/ads';

export const ADS_ENABLED =
  (process.env.EXPO_PUBLIC_ADS_ENABLED ?? '').trim().toLowerCase() === 'true' ||
  (process.env.EXPO_PUBLIC_ENABLE_ADS ?? '').trim().toLowerCase() === 'true';

export const ADS_WEB_ENABLED =
  ADS_ENABLED &&
  (process.env.EXPO_PUBLIC_ADS_WEB_ENABLED ?? '').trim().toLowerCase() === 'true';

export const ADS_DEBUG_ENABLED =
  __DEV__ ||
  (process.env.EXPO_PUBLIC_DEBUG_ADS ?? '').trim().toLowerCase() === 'true';

export const ADSENSE_CLIENT_ID =
  (process.env.EXPO_PUBLIC_ADSENSE_CLIENT_ID ?? '').trim() || 'ca-pub-1836203364600133';

export const ADSENSE_SLOT_BANNER =
  (process.env.EXPO_PUBLIC_ADSENSE_SLOT_BANNER ?? '').trim() || null;

export const ADSENSE_SLOT_TOOLS_AFTER_RESULT =
  (process.env.EXPO_PUBLIC_ADSENSE_SLOT_TOOLS_AFTER_RESULT ?? '').trim() ||
  ADSENSE_SLOT_BANNER;

export const ADSENSE_SLOT_TOOLS_HUB_AFTER_CARDS =
  (process.env.EXPO_PUBLIC_ADSENSE_SLOT_TOOLS_HUB_AFTER_CARDS ?? '').trim() ||
  ADSENSE_SLOT_BANNER;

export function getAdSensePlacementSlot(placement: AdPlacement) {
  switch (placement) {
    case AD_PLACEMENTS.TOOLS_AFTER_RESULT:
      return ADSENSE_SLOT_TOOLS_AFTER_RESULT;
    case AD_PLACEMENTS.TOOLS_HUB_AFTER_CARDS:
      return ADSENSE_SLOT_TOOLS_HUB_AFTER_CARDS;
    default:
      return null;
  }
}

export function getAdSensePlacementConfig(placement: AdPlacement) {
  if (!ADS_WEB_ENABLED) {
    return null;
  }

  const slot = getAdSensePlacementSlot(placement);

  if (!ADSENSE_CLIENT_ID || !slot) {
    return null;
  }

  return {
    clientId: ADSENSE_CLIENT_ID,
    slot,
  };
}

export function isAdSenseBannerConfigured(placement?: AdPlacement) {
  if (placement) {
    return Boolean(getAdSensePlacementConfig(placement));
  }

  return ADS_WEB_ENABLED && Boolean(ADSENSE_CLIENT_ID && ADSENSE_SLOT_BANNER);
}
