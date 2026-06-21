import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { fonts } from '@/constants/theme';

import { TOOL_COLORS } from './tool-theme';

type ToolBadgeTone = 'accent' | 'highlight' | 'muted';

interface ToolBadgeProps {
  label: string;
  tone?: ToolBadgeTone;
  style?: ViewStyle;
}

export function ToolBadge({ label, tone = 'accent', style }: ToolBadgeProps) {
  const toneStyles =
    tone === 'highlight'
      ? {
          backgroundColor: TOOL_COLORS.highlightSoft,
          borderColor: 'rgba(250, 204, 21, 0.28)',
          color: TOOL_COLORS.highlight,
        }
      : tone === 'muted'
        ? {
            backgroundColor: 'rgba(203, 213, 225, 0.08)',
            borderColor: 'rgba(203, 213, 225, 0.16)',
            color: TOOL_COLORS.textMuted,
          }
        : {
            backgroundColor: TOOL_COLORS.accentSoft,
            borderColor: TOOL_COLORS.border,
            color: TOOL_COLORS.accentLight,
          };

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: toneStyles.backgroundColor,
          borderColor: toneStyles.borderColor,
        },
        style,
      ]}>
      <Text style={[styles.label, { color: toneStyles.color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  label: {
    fontFamily: fonts.heading,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
});
