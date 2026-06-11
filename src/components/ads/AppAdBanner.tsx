import { useEffect, useRef } from 'react';

import {
  ADS_ENABLED,
  ADS_WEB_ENABLED,
  ADSENSE_CLIENT_ID,
  ADSENSE_SLOT_BANNER,
  isAdSenseBannerConfigured,
} from '@/config/ads';
import type { AdPlacement } from '@/constants/ads';

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

export interface AppAdBannerProps {
  placement: AdPlacement;
  compact?: boolean;
}

function getPlaceholderCopy(placement: AdPlacement) {
  return `Espaco reservado para patrocinadores em ${placement}.`;
}

export function AppAdBanner({ placement, compact = false }: AppAdBannerProps) {
  const initializedRef = useRef(false);
  const showAdSenseBanner = isAdSenseBannerConfigured();
  const showPlaceholder = ADS_ENABLED && !showAdSenseBanner;

  useEffect(() => {
    if (
      !showAdSenseBanner ||
      typeof document === 'undefined' ||
      typeof window === 'undefined'
    ) {
      return;
    }

    const scriptId = 'appboca-adsense-script';
    let script = document.getElementById(scriptId);

    if (!script) {
      script = document.createElement('script');
      script.id = scriptId;
      script.setAttribute('async', 'true');
      script.setAttribute(
        'src',
        `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT_ID}`,
      );
      script.setAttribute('crossorigin', 'anonymous');
      document.head.appendChild(script);
    }

    if (initializedRef.current) {
      return;
    }

    try {
      window.adsbygoogle = window.adsbygoogle || [];
      window.adsbygoogle.push({});
      initializedRef.current = true;
    } catch (error) {
      console.warn('[ads] AdSense banner initialization failed', error);
    }
  }, [showAdSenseBanner]);

  if (!ADS_ENABLED) {
    return null;
  }

  if (!ADS_WEB_ENABLED || showPlaceholder) {
    return (
      <div
        aria-label={`Espaco de anuncio ${placement}`}
        style={{
          border: '1px dashed rgba(255,255,255,0.2)',
          borderRadius: compact ? 20 : 24,
          padding: compact ? '10px 12px' : '14px 16px',
          background: 'rgba(255,255,255,0.04)',
          color: 'rgba(255,255,255,0.72)',
          display: 'grid',
          gap: 4,
          textAlign: 'center',
        }}>
        <strong style={{ color: '#FFFFFF', fontSize: compact ? 12 : 13 }}>
          Placeholder de anuncio web
        </strong>
        <span style={{ fontSize: compact ? 11 : 12 }}>
          {ADS_WEB_ENABLED
            ? getPlaceholderCopy(placement)
            : 'Ative EXPO_PUBLIC_ADS_WEB_ENABLED para usar AdSense no web.'}
        </span>
      </div>
    );
  }

  return (
    <div
      aria-label={`Espaco de anuncio ${placement}`}
      style={{
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: compact ? 20 : 24,
        padding: compact ? '8px 10px' : '12px',
        background: 'rgba(255,255,255,0.02)',
        overflow: 'hidden',
      }}>
      <ins
        className="adsbygoogle"
        style={{
          display: 'block',
          minHeight: compact ? 50 : 90,
          width: '100%',
        }}
        data-ad-client={ADSENSE_CLIENT_ID ?? undefined}
        data-ad-slot={ADSENSE_SLOT_BANNER ?? undefined}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
}
