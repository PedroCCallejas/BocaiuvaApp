import { useEffect } from 'react';
import { usePathname } from 'expo-router';

import {
  ADS_DEBUG_ENABLED,
  ADS_ENABLED,
  ADS_WEB_ENABLED,
  getAdSensePlacementConfig,
} from '@/config/ads';
import {
  type AdPlacement,
  isAllowedToolsAdPlacement,
  isAllowedToolsAdRoute,
} from '@/constants/ads';
import { WebAdSenseSlot } from '@/components/ads/WebAdSenseSlot';

export interface AppAdBannerProps {
  placement: AdPlacement;
  compact?: boolean;
}

function debugWebAd(message: string, details: Record<string, unknown>) {
  if (!ADS_DEBUG_ENABLED) {
    return;
  }

  console.log(`[ads:web] ${message}`, details);
}

export function AppAdBanner({ placement, compact = false }: AppAdBannerProps) {
  const pathname = usePathname();
  const routeAllowed = isAllowedToolsAdRoute(pathname);
  const placementAllowed = isAllowedToolsAdPlacement(placement);
  const placementConfig = getAdSensePlacementConfig(placement);

  useEffect(() => {
    debugWebAd('app-banner-check', {
      pathname,
      placement,
      slot: placementConfig?.slot ?? null,
      routeAllowed,
      placementAllowed,
      adsEnabled: ADS_ENABLED,
      adsWebEnabled: ADS_WEB_ENABLED,
      hasPlacementConfig: Boolean(placementConfig),
    });
  }, [pathname, placement, routeAllowed, placementAllowed, placementConfig]);

  if (!ADS_ENABLED || !ADS_WEB_ENABLED || !routeAllowed || !placementAllowed || !placementConfig) {
    debugWebAd('app-banner-null', {
      pathname,
      placement,
      slot: placementConfig?.slot ?? null,
      routeAllowed,
      placementAllowed,
      adsEnabled: ADS_ENABLED,
      adsWebEnabled: ADS_WEB_ENABLED,
      hasPlacementConfig: Boolean(placementConfig),
    });
    return null;
  }

  return (
    <WebAdSenseSlot
      placement={placement}
      compact={compact}
      pathname={pathname}
      clientId={placementConfig.clientId}
      slot={placementConfig.slot}
    />
  );
}
