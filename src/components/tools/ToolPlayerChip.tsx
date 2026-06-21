import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { fonts } from '@/constants/theme';

import { TOOL_COLORS } from './tool-theme';

interface ToolPlayerChipProps {
  label: string;
  prefix?: string;
  accentColor?: string;
  style?: ViewStyle;
}

export function ToolPlayerChip({
  label,
  prefix,
  accentColor = TOOL_COLORS.accent,
  style,
}: ToolPlayerChipProps) {
  return (
    <View style={[styles.chip, style]}>
      {prefix ? (
        <View style={[styles.prefixDot, { backgroundColor: accentColor }]}>
          <Text style={styles.prefixText}>{prefix}</Text>
        </View>
      ) : null}
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 14,
    borderColor: TOOL_COLORS.border,
    backgroundColor: TOOL_COLORS.cardMuted,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  prefixDot: {
    minWidth: 22,
    height: 22,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  prefixText: {
    fontFamily: fonts.heading,
    fontSize: 10,
    fontWeight: '800',
    color: TOOL_COLORS.background,
  },
  label: {
    flexShrink: 1,
    fontFamily: fonts.body,
    fontSize: 14,
    color: TOOL_COLORS.text,
  },
});
