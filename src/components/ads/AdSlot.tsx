import type { AdPlacement } from '@/constants/ads';
import { AppAdBanner } from '@/components/ads/AppAdBanner';

interface AdSlotProps {
  placement: AdPlacement;
  compact?: boolean;
}

export function AdSlot({ placement, compact = false }: AdSlotProps) {
  return <AppAdBanner placement={placement} compact={compact} />;
}
