import { useEffect, useRef } from 'react';

import { ADS_DEBUG_ENABLED } from '@/config/ads';
import type { AdPlacement } from '@/constants/ads';

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

interface WebAdSenseSlotProps {
  placement: AdPlacement;
  clientId: string;
  slot: string;
  compact?: boolean;
  pathname?: string | null;
}

function debugWebAd(message: string, details: Record<string, unknown>) {
  if (!ADS_DEBUG_ENABLED) {
    return;
  }

  console.log(`[ads:web] ${message}`, details);
}

function ensureAdSenseScript(clientId: string) {
  if (typeof document === 'undefined') {
    return;
  }

  const scriptId = 'appboca-adsense-script';
  let script = document.getElementById(scriptId) as HTMLScriptElement | null;

  if (script) {
    return;
  }

  script = document.createElement('script');
  script.id = scriptId;
  script.async = true;
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${clientId}`;
  script.crossOrigin = 'anonymous';
  document.head.appendChild(script);
}

export function WebAdSenseSlot({
  placement,
  clientId,
  slot,
  compact = false,
  pathname,
}: WebAdSenseSlotProps) {
  const insRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      debugWebAd('skip-no-dom', { placement, pathname });
      return;
    }

    const node = insRef.current;

    if (!node) {
      debugWebAd('skip-no-node', { placement, pathname });
      return;
    }

    if (node.getAttribute('data-appboca-initialized') === 'true') {
      debugWebAd('skip-already-initialized', { placement, pathname, slot });
      return;
    }

    ensureAdSenseScript(clientId);

    try {
      window.adsbygoogle = window.adsbygoogle || [];
      window.adsbygoogle.push({});
      node.setAttribute('data-appboca-initialized', 'true');

      debugWebAd('rendered', {
        placement,
        pathname,
        slot,
        clientId,
      });
    } catch (error) {
      debugWebAd('render-failed', {
        placement,
        pathname,
        slot,
        clientId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, [clientId, pathname, placement, slot]);

  return (
    <div
      aria-label={`Espaco de anuncio ${placement}`}
      data-appboca-placement={placement}
      style={{
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: compact ? 20 : 24,
        padding: compact ? '8px 10px' : '12px',
        background: 'rgba(255,255,255,0.02)',
        overflow: 'hidden',
      }}>
      <ins
        ref={(node) => {
          insRef.current = node;
        }}
        className="adsbygoogle"
        style={{
          display: 'block',
          minHeight: compact ? 50 : 90,
          width: '100%',
        }}
        data-ad-client={clientId}
        data-ad-slot={slot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
}
