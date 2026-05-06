import { StyleSheet, Text, View } from 'react-native';

import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';

interface PillProps {
  label: string;
  color?: string;
}

export function Pill({ label, color }: PillProps) {
  const theme = useAppTheme();

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: color ? `${color}22` : theme.colors.chip,
          borderColor: color ? `${color}55` : theme.colors.border,
        },
      ]}>
      <Text
        style={[
          styles.label,
          {
            color: color ?? theme.colors.textMuted,
          },
        ]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  label: {
    fontFamily: fonts.heading,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
});
