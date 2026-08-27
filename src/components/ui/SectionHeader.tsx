import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Entra à esquerda da ação, na mesma linha. */
  antesDaAcao?: ReactNode;
}

export function SectionHeader({
  title,
  subtitle,
  actionLabel,
  onAction,
  antesDaAcao,
}: SectionHeaderProps) {
  const theme = useAppTheme();

  return (
    <View style={styles.container}>
      <View style={styles.copy}>
        <View style={styles.titleRow}>
          <View style={[styles.accent, { backgroundColor: theme.colors.action }]} />
          <Text
            accessibilityRole="header"
            aria-level={2}
            style={[styles.title, { color: theme.colors.text }]}>
            {title}
          </Text>
        </View>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>{subtitle}</Text>
        ) : null}
      </View>
      {antesDaAcao}
      {actionLabel && onAction ? (
        <Pressable
          accessibilityLabel={actionLabel}
          accessibilityRole="button"
          onPress={onAction}
          style={[
            styles.actionWrap,
            {
              backgroundColor: theme.colors.backgroundElevated,
              borderColor: theme.colors.borderStrong,
            },
          ]}>
          <Text style={[styles.action, { color: theme.colors.text }]}>
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
  },
  copy: {
    flex: 1,
    gap: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  accent: {
    width: 5,
    height: 18,
    borderRadius: 999,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 21,
    fontWeight: '900',
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 13,
  },
  action: {
    fontFamily: fonts.heading,
    fontSize: 13,
    fontWeight: '700',
  },
  actionWrap: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
});
