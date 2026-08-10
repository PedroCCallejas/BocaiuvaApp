import { Pressable, StyleSheet, Text, View } from 'react-native';

import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';

interface CounterFieldProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (next: number) => void;
}

export function CounterField({
  label,
  value,
  min = 0,
  max = 99,
  onChange,
}: CounterFieldProps) {
  const theme = useAppTheme();

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: theme.colors.textMuted }]}>{label}</Text>
      <View
        style={[
          styles.row,
          {
            backgroundColor: theme.colors.backgroundElevated,
            borderColor: theme.colors.borderStrong,
          },
        ]}>
        <CounterButton
          label="-"
          onPress={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
        />
        <Text style={[styles.value, { color: theme.colors.text }]}>{value}</Text>
        <CounterButton
          label="+"
          onPress={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
        />
      </View>
    </View>
  );
}

function CounterButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const theme = useAppTheme();

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.button,
        {
          backgroundColor: disabled ? theme.colors.surfaceMuted : theme.colors.surfaceRaised,
          opacity: disabled ? 0.5 : 1,
        },
      ]}>
      <Text style={[styles.buttonLabel, { color: theme.colors.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  label: {
    fontFamily: fonts.heading,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  row: {
    minWidth: 120,
    minHeight: 52,
    borderWidth: 1,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
  },
  button: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonLabel: {
    fontFamily: fonts.heading,
    fontSize: 18,
    fontWeight: '800',
  },
  value: {
    fontFamily: fonts.display,
    fontSize: 24,
    fontWeight: '900',
  },
});
