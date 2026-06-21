import { useEffect, useRef, useState } from 'react';

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

type AdStatus = 'unknown' | 'filled' | 'unfilled';

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
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const insRef = useRef<HTMLElement | null>(null);
  const [adStatus, setAdStatus] = useState<AdStatus>('unknown');

  useEffect(() => {
    if (typeof window === 'undefined' || typeof MutationObserver === 'undefined') {
      return;
    }

    const node = insRef.current;
    const wrapper = wrapperRef.current;

    if (!node || !wrapper) {
      debugWebAd('status-observer-skip', {
        placement,
        pathname,
        slot,
      });
      return;
    }

    const syncStatus = () => {
      const rawStatus = node.getAttribute('data-ad-status');
      const nextStatus: AdStatus =
        rawStatus === 'filled' || rawStatus === 'unfilled' ? rawStatus : 'unknown';
      const wrapperHidden = nextStatus === 'unfilled';

      setAdStatus((currentStatus) => (currentStatus === nextStatus ? currentStatus : nextStatus));
      wrapper.setAttribute('data-ad-status', nextStatus);
      wrapper.setAttribute('data-ad-visibility', wrapperHidden ? 'hidden' : 'visible');

      debugWebAd('status-change', {
        placement,
        pathname,
        slot,
        adStatus: nextStatus,
        wrapperHidden,
      });
    };

    syncStatus();

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && mutation.attributeName === 'data-ad-status') {
          syncStatus();
          return;
        }
      }
    });

    observer.observe(node, {
      attributes: true,
      attributeFilter: ['data-ad-status'],
    });

    return () => {
      observer.disconnect();
    };
  }, [pathname, placement, slot]);

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

  const isFilled = adStatus === 'filled';
  const isUnfilled = adStatus === 'unfilled';

  return (
    <div
      ref={(node) => {
        wrapperRef.current = node;
      }}
      aria-label={`Espaco de anuncio ${placement}`}
      data-appboca-placement={placement}
      data-appboca-ad-wrapper="true"
      data-ad-status={adStatus}
      data-ad-visibility={isUnfilled ? 'hidden' : 'visible'}
      style={{
        display: isUnfilled ? 'none' : 'block',
        border: isFilled ? '1px solid rgba(255,255,255,0.08)' : '0',
        borderRadius: compact ? 20 : 24,
        padding: isFilled ? (compact ? '8px 10px' : '12px') : 0,
        background: isFilled ? 'rgba(255,255,255,0.02)' : 'transparent',
        overflow: 'hidden',
        minHeight: 0,
      }}>
      <ins
        ref={(node) => {
          insRef.current = node;
        }}
        className="adsbygoogle"
        style={{
          display: 'block',
          width: '100%',
          maxWidth: '100%',
          minHeight: 0,
          overflow: 'hidden',
        }}
        data-ad-client={clientId}
        data-ad-slot={slot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
}
