import type { PropsWithChildren } from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { fonts } from '@/constants/theme';

import { TOOL_COLORS } from './tool-theme';

interface ToolSectionProps extends PropsWithChildren {
  kicker?: string;
  title?: string;
  description?: string;
  style?: ViewStyle;
}

export function ToolSection({
  kicker,
  title,
  description,
  children,
  style,
}: ToolSectionProps) {
  return (
    <View style={[styles.section, style]}>
      {kicker ? <Text style={styles.kicker}>{kicker}</Text> : null}
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {description ? <Text style={styles.description}>{description}</Text> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 12,
  },
  kicker: {
    fontFamily: fonts.heading,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: TOOL_COLORS.highlight,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 28,
    fontWeight: '900',
    lineHeight: 30,
    color: TOOL_COLORS.text,
  },
  description: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 23,
    color: TOOL_COLORS.textMuted,
  },
});
