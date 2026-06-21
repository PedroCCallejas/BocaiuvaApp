import { usePathname } from 'expo-router';

import { ADS_DEBUG_ENABLED } from '@/config/ads';
import {
  type AdPlacement,
  isAllowedToolsAdPlacement,
  isAllowedToolsAdRoute,
} from '@/constants/ads';
import { AppAdBanner } from '@/components/ads/AppAdBanner';

// Allowlist: anúncio APENAS nas rotas listadas aqui.
// Qualquer outra rota, incluindo login, home, perfil, rotas protegidas, retorna null.
interface SafeAdProps {
  placement: AdPlacement;
  compact?: boolean;
  hasContent?: boolean;
}

function debugSafeAd(message: string, details: Record<string, unknown>) {
  if (!ADS_DEBUG_ENABLED) {
    return;
  }

  console.log(`[ads:safe] ${message}`, details);
}

export function SafeAd({ placement, compact = false, hasContent = true }: SafeAdProps) {
  const pathname = usePathname();
  const isAllowedRoute = isAllowedToolsAdRoute(pathname);
  const isAllowedPlacement = isAllowedToolsAdPlacement(placement);

  debugSafeAd('check', {
    pathname,
    placement,
    hasContent,
    isAllowedRoute,
    isAllowedPlacement,
  });

  if (!isAllowedRoute || !isAllowedPlacement || !hasContent) {
    debugSafeAd('null', {
      pathname,
      placement,
      hasContent,
      isAllowedRoute,
      isAllowedPlacement,
    });
    return null;
  }

  debugSafeAd('render', {
    pathname,
    placement,
    hasContent,
  });

  return <AppAdBanner placement={placement} compact={compact} />;
}
