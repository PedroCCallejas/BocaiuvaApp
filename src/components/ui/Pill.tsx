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
            backgroundColor ?? (color ? `${color}1C` : theme.colors.backgroundElevated),
          borderColor: borderColor ?? (color ? `${color}4D` : theme.colors.borderStrong),
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
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  label: {
    fontFamily: fonts.heading,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
});
