import AsyncStorage from '@react-native-async-storage/async-storage';
import mobileAds, {
  AdEventType,
  InterstitialAd,
  TestIds,
} from 'react-native-google-mobile-ads';

import type { AdPlacement } from '@/constants/ads';
import {
  AD_PLACEMENTS,
  ADS_ENABLED,
  MATCH_CREATE_INTERSTITIAL_COOLDOWN_MS,
} from '@/constants/ads';

const LAST_MATCH_CREATE_INTERSTITIAL_AT_KEY =
  '@appboca/ads/last-match-create-interstitial-at';
const INTERSTITIAL_RETRY_DELAY_MS = 30_000;

let initializePromise: Promise<void> | null = null;
let interstitial: InterstitialAd | null = null;
let interstitialLoaded = false;
let interstitialLoading = false;
let interstitialListeners: Array<() => void> = [];
let showPromise: Promise<void> | null = null;
let reloadTimer: ReturnType<typeof setTimeout> | null = null;

function isAdMobAvailable() {
  return ADS_ENABLED;
}

function getAndroidBannerHomeUnitId() {
  if (__DEV__) {
    return TestIds.ADAPTIVE_BANNER;
  }

  return process.env.EXPO_PUBLIC_ADMOB_ANDROID_BANNER_HOME_ID?.trim() || null;
}

function getAndroidMatchCreateInterstitialUnitId() {
  if (__DEV__) {
    return TestIds.INTERSTITIAL;
  }

  return (
    process.env.EXPO_PUBLIC_ADMOB_ANDROID_INTERSTITIAL_AFTER_MATCH_CREATE_ID?.trim() || null
  );
}

function clearInterstitialListeners() {
  interstitialListeners.forEach((unsubscribe) => unsubscribe());
  interstitialListeners = [];
}

function clearReloadTimer() {
  if (!reloadTimer) {
    return;
  }

  clearTimeout(reloadTimer);
  reloadTimer = null;
}

function scheduleInterstitialReload(delayMs = 0) {
  clearReloadTimer();

  reloadTimer = setTimeout(() => {
    void preloadMatchCreateInterstitial();
  }, delayMs);
}

function buildInterstitial() {
  const unitId = getAndroidMatchCreateInterstitialUnitId();

  if (!unitId || !isAdMobAvailable()) {
    return null;
  }

  return InterstitialAd.createForAdRequest(unitId);
}

async function persistLastInterstitialShownAt() {
  try {
    await AsyncStorage.setItem(
      LAST_MATCH_CREATE_INTERSTITIAL_AT_KEY,
      String(Date.now()),
    );
  } catch (error) {
    console.warn('[ads] Failed to persist interstitial cooldown', error);
  }
}

async function isMatchCreateInterstitialOnCooldown() {
  try {
    const rawValue = await AsyncStorage.getItem(
      LAST_MATCH_CREATE_INTERSTITIAL_AT_KEY,
    );

    if (!rawValue) {
      return false;
    }

    const lastShownAt = Number(rawValue);

    if (!Number.isFinite(lastShownAt)) {
      return false;
    }

    return Date.now() - lastShownAt < MATCH_CREATE_INTERSTITIAL_COOLDOWN_MS;
  } catch (error) {
    console.warn('[ads] Failed to read interstitial cooldown', error);
    return false;
  }
}

export function getBannerAdUnitId(placement: AdPlacement): string | null {
  if (!isAdMobAvailable()) {
    return null;
  }

  if (
    placement === AD_PLACEMENTS.HOME_AFTER_NEXT_MATCH ||
    placement === AD_PLACEMENTS.PUBLIC_TEAM_AFTER_STATS
  ) {
    return getAndroidBannerHomeUnitId();
  }

  return null;
}

export async function initializeAdMob() {
  if (!isAdMobAvailable()) {
    return;
  }

  if (initializePromise) {
    return initializePromise;
  }

  initializePromise = mobileAds()
    .initialize()
    .then(async () => {
      await preloadMatchCreateInterstitial();
    })
    .catch((error) => {
      console.warn('[ads] Failed to initialize AdMob', error);
      initializePromise = null;
    });

  return initializePromise;
}

export async function preloadMatchCreateInterstitial() {
  if (!isAdMobAvailable() || interstitialLoading || interstitialLoaded || showPromise) {
    return;
  }

  const nextInterstitial = buildInterstitial();

  if (!nextInterstitial) {
    return;
  }

  clearReloadTimer();
  clearInterstitialListeners();

  interstitial = nextInterstitial;
  interstitialLoaded = false;
  interstitialLoading = true;

  interstitialListeners = [
    nextInterstitial.addAdEventListener(AdEventType.LOADED, () => {
      interstitialLoaded = true;
      interstitialLoading = false;
    }),
    nextInterstitial.addAdEventListener(AdEventType.ERROR, (error) => {
      console.warn('[ads] Interstitial failed to load', error);
      interstitialLoaded = false;
      interstitialLoading = false;
      interstitial = null;
      clearInterstitialListeners();
      scheduleInterstitialReload(INTERSTITIAL_RETRY_DELAY_MS);
    }),
    nextInterstitial.addAdEventListener(AdEventType.CLOSED, () => {
      interstitialLoaded = false;
      interstitialLoading = false;
      interstitial = null;
      clearInterstitialListeners();
      scheduleInterstitialReload();
    }),
    nextInterstitial.addAdEventListener(AdEventType.OPENED, () => {
      void persistLastInterstitialShownAt();
    }),
  ];

  nextInterstitial.load();
}

export async function showMatchCreateInterstitialIfEligible() {
  if (!isAdMobAvailable()) {
    return;
  }

  await initializeAdMob();

  if (showPromise) {
    await showPromise;
    return;
  }

  if (await isMatchCreateInterstitialOnCooldown()) {
    await preloadMatchCreateInterstitial();
    return;
  }

  if (!interstitial || !interstitialLoaded) {
    await preloadMatchCreateInterstitial();
    return;
  }

  const activeInterstitial = interstitial;
  interstitialLoaded = false;

  showPromise = new Promise<void>((resolve) => {
    let settled = false;

    const cleanUp = () => {
      if (settled) {
        return;
      }

      settled = true;
      closedUnsubscribe();
      errorUnsubscribe();
      showPromise = null;
      resolve();
    };

    const closedUnsubscribe = activeInterstitial.addAdEventListener(
      AdEventType.CLOSED,
      cleanUp,
    );
    const errorUnsubscribe = activeInterstitial.addAdEventListener(
      AdEventType.ERROR,
      (error) => {
        console.warn('[ads] Interstitial failed while showing', error);
        cleanUp();
      },
    );

    activeInterstitial.show().catch((error) => {
      console.warn('[ads] Interstitial show rejected', error);
      cleanUp();
    });
  });

  await showPromise;
}
