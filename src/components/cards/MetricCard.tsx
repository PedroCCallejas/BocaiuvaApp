import { Pressable, StyleSheet, Text, View } from 'react-native';

import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';

interface MetricCardProps {
  label: string;
  value: string;
  helper?: string;
  onPress?: () => void;
  accessibilityHint?: string;
}

export function MetricCard({
  label,
  value,
  helper,
  onPress,
  accessibilityHint,
}: MetricCardProps) {
  const theme = useAppTheme();

  const content = (
    <>
      <Text style={[styles.label, { color: theme.colors.textMuted }]}>{label}</Text>
      <Text style={[styles.value, { color: theme.colors.text }]}>{value}</Text>
      {helper ? (
        <Text style={[styles.helper, { color: theme.colors.accent ?? theme.colors.secondary }]}>
          {helper}
        </Text>
      ) : null}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value}`}
        accessibilityHint={accessibilityHint ?? 'Toque para ver o detalhamento por partida.'}
        onPress={onPress}
        style={({ pressed }) => [
          styles.container,
          {
            backgroundColor: theme.colors.surface,
            borderColor: pressed ? theme.colors.secondary : theme.colors.border,
            opacity: pressed ? 0.85 : 1,
          },
        ]}>
        {content}
      </Pressable>
    );
  }

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
        },
      ]}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minWidth: 148,
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    gap: 8,
  },
  label: {
    fontFamily: fonts.heading,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  value: {
    fontFamily: fonts.display,
    fontSize: 28,
    fontWeight: '900',
  },
  helper: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
  },
});
