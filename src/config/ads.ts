import { Platform } from 'react-native';

import { AD_PLACEMENTS, type AdPlacement } from '@/constants/ads';

export const ADS_ENABLED =
  (process.env.EXPO_PUBLIC_ADS_ENABLED ?? '').trim().toLowerCase() === 'true' ||
  (process.env.EXPO_PUBLIC_ENABLE_ADS ?? '').trim().toLowerCase() === 'true';

export const ADS_WEB_ENABLED =
  ADS_ENABLED &&
  (process.env.EXPO_PUBLIC_ADS_WEB_ENABLED ?? '').trim().toLowerCase() === 'true';

export const ADS_MOBILE_ENABLED =
  ADS_ENABLED &&
  (process.env.EXPO_PUBLIC_ADS_MOBILE_ENABLED ?? '').trim().toLowerCase() === 'true';

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

export const ADMOB_ANDROID_APP_ID =
  (process.env.EXPO_PUBLIC_ADMOB_ANDROID_APP_ID ?? '').trim() || null;

export const ADMOB_IOS_APP_ID =
  (process.env.EXPO_PUBLIC_ADMOB_IOS_APP_ID ?? '').trim() || null;

export const ADMOB_ANDROID_BANNER_ID =
  (process.env.EXPO_PUBLIC_ADMOB_ANDROID_BANNER_ID ?? '').trim() ||
  (process.env.EXPO_PUBLIC_ADMOB_ANDROID_BANNER_HOME_ID ?? '').trim() ||
  null;

export const ADMOB_IOS_BANNER_ID =
  (process.env.EXPO_PUBLIC_ADMOB_IOS_BANNER_ID ?? '').trim() || null;

export const ADMOB_ANDROID_INTERSTITIAL_ID =
  (process.env.EXPO_PUBLIC_ADMOB_ANDROID_INTERSTITIAL_ID ?? '').trim() ||
  (process.env.EXPO_PUBLIC_ADMOB_ANDROID_INTERSTITIAL_AFTER_MATCH_CREATE_ID ?? '').trim() ||
  null;

export const ADMOB_IOS_INTERSTITIAL_ID =
  (process.env.EXPO_PUBLIC_ADMOB_IOS_INTERSTITIAL_ID ?? '').trim() || null;

export function getCurrentMobileAppId() {
  if (Platform.OS === 'android') {
    return ADMOB_ANDROID_APP_ID;
  }

  if (Platform.OS === 'ios') {
    return ADMOB_IOS_APP_ID;
  }

  return null;
}

export function getCurrentMobileBannerId() {
  if (Platform.OS === 'android') {
    return ADMOB_ANDROID_BANNER_ID;
  }

  if (Platform.OS === 'ios') {
    return ADMOB_IOS_BANNER_ID;
  }

  return null;
}

export function getCurrentMobileInterstitialId() {
  if (Platform.OS === 'android') {
    return ADMOB_ANDROID_INTERSTITIAL_ID;
  }

  if (Platform.OS === 'ios') {
    return ADMOB_IOS_INTERSTITIAL_ID;
  }

  return null;
}

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

export function isCurrentPlatformMobileAdsConfigured() {
  return ADS_MOBILE_ENABLED && Boolean(getCurrentMobileAppId());
}
