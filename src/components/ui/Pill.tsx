import { StyleSheet, Text, View } from 'react-native';

import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';

interface PillProps {
  label: string;
  color?: string;
  backgroundColor?: string;
  borderColor?: string;
  textColor?: string;
}

export function Pill({
  label,
  color,
  backgroundColor,
  borderColor,
  textColor,
}: PillProps) {
  const theme = useAppTheme();

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor:
            backgroundColor ?? (color ? `${color}26` : theme.colors.backgroundElevated),
          borderColor: borderColor ?? (color ? `${color}66` : 'rgba(255,255,255,0.12)'),
        },
      ]}>
      <Text
        style={[
          styles.label,
          {
            color: textColor ?? (color ? theme.colors.text : theme.colors.text),
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
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  label: {
    fontFamily: fonts.heading,
    fontSize: 12,
    fontWeight: '700',
  },
});
