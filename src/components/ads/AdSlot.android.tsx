import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { BannerAd, BannerAdSize } from 'react-native-google-mobile-ads';

import type { AdPlacement } from '@/constants/ads';
import { ADS_ENABLED } from '@/constants/ads';
import { useAppTheme } from '@/hooks/use-app-theme';
import {
  getBannerAdUnitId,
  initializeAdMob,
} from '@/services/ads/admob-service';

interface AdSlotProps {
  placement: AdPlacement;
  compact?: boolean;
}

export function AdSlot({ placement, compact = false }: AdSlotProps) {
  const theme = useAppTheme();
  const unitId = getBannerAdUnitId(placement);

  useEffect(() => {
    void initializeAdMob();
  }, []);

  if (!ADS_ENABLED || !unitId) {
    return null;
  }

  return (
    <View
      accessibilityRole="summary"
      accessibilityLabel={`Espaço de anúncio ${placement}`}
      style={[
        styles.card,
        compact ? styles.cardCompact : null,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
        },
      ]}>
      <BannerAd
        unitId={unitId}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        onAdFailedToLoad={(error) => {
          console.warn('[ads] Banner failed to load', placement, error);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 24,
    paddingHorizontal: 12,
    paddingVertical: 12,
    overflow: 'hidden',
  },
  cardCompact: {
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
});
