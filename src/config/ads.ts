import { Platform } from 'react-native';

function readStringEnv(name: string) {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function readBooleanEnv(name: string, fallback = false) {
  const value = process.env[name]?.trim().toLowerCase();

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  return fallback;
}

const legacyAdsEnabled = readBooleanEnv('EXPO_PUBLIC_ENABLE_ADS', false);

export const ADS_ENABLED = readBooleanEnv('EXPO_PUBLIC_ADS_ENABLED', legacyAdsEnabled);
export const ADS_WEB_ENABLED = ADS_ENABLED && readBooleanEnv('EXPO_PUBLIC_ADS_WEB_ENABLED', false);
export const ADS_MOBILE_ENABLED =
  ADS_ENABLED && readBooleanEnv('EXPO_PUBLIC_ADS_MOBILE_ENABLED', false);

export const ADSENSE_CLIENT_ID = readStringEnv('EXPO_PUBLIC_ADSENSE_CLIENT_ID');
export const ADSENSE_SLOT_BANNER = readStringEnv('EXPO_PUBLIC_ADSENSE_SLOT_BANNER');

export const ADMOB_ANDROID_APP_ID = readStringEnv('EXPO_PUBLIC_ADMOB_ANDROID_APP_ID');
export const ADMOB_IOS_APP_ID = readStringEnv('EXPO_PUBLIC_ADMOB_IOS_APP_ID');

export const ADMOB_ANDROID_BANNER_ID =
  readStringEnv('EXPO_PUBLIC_ADMOB_ANDROID_BANNER_ID') ??
  readStringEnv('EXPO_PUBLIC_ADMOB_ANDROID_BANNER_HOME_ID');
export const ADMOB_IOS_BANNER_ID = readStringEnv('EXPO_PUBLIC_ADMOB_IOS_BANNER_ID');

export const ADMOB_ANDROID_INTERSTITIAL_ID =
  readStringEnv('EXPO_PUBLIC_ADMOB_ANDROID_INTERSTITIAL_ID') ??
  readStringEnv('EXPO_PUBLIC_ADMOB_ANDROID_INTERSTITIAL_AFTER_MATCH_CREATE_ID');
export const ADMOB_IOS_INTERSTITIAL_ID = readStringEnv('EXPO_PUBLIC_ADMOB_IOS_INTERSTITIAL_ID');

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

export function isAdSenseBannerConfigured() {
  return ADS_WEB_ENABLED && Boolean(ADSENSE_CLIENT_ID && ADSENSE_SLOT_BANNER);
}

export function isCurrentPlatformMobileAdsConfigured() {
  return ADS_MOBILE_ENABLED && Boolean(getCurrentMobileAppId());
}
