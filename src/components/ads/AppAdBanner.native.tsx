import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { BannerAd, BannerAdSize } from 'react-native-google-mobile-ads';

import { ADS_ENABLED } from '@/config/ads';
import type { AdPlacement } from '@/constants/ads';
import { useAppTheme } from '@/hooks/use-app-theme';
import {
  getBannerAdUnitId,
  initializeAdMob,
} from '@/services/ads/admob-service';

export interface AppAdBannerProps {
  placement: AdPlacement;
  compact?: boolean;
}

export function AppAdBanner({ placement, compact = false }: AppAdBannerProps) {
  const theme = useAppTheme();
  const unitId = getBannerAdUnitId(placement);

  useEffect(() => {
    if (!unitId) {
      return;
    }

    void initializeAdMob();
  }, [unitId]);

  if (!ADS_ENABLED || !unitId) {
    return null;
  }

  return (
    <View
      accessibilityRole="summary"
      accessibilityLabel={`Espaco de anuncio ${placement}`}
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
