import { StyleSheet, View, type PropsWithChildren, type ViewStyle } from 'react-native';

import { TOOL_COLORS } from './tool-theme';

type ToolCardTone = 'default' | 'field' | 'accent';

interface ToolCardProps extends PropsWithChildren {
  tone?: ToolCardTone;
  style?: ViewStyle;
}

export function ToolCard({ children, tone = 'default', style }: ToolCardProps) {
  const toneStyle =
    tone === 'accent'
      ? {
          backgroundColor: TOOL_COLORS.accentSoft,
          borderColor: TOOL_COLORS.borderStrong,
        }
      : tone === 'field'
        ? {
            backgroundColor: TOOL_COLORS.cardAlt,
            borderColor: TOOL_COLORS.borderStrong,
          }
        : {
            backgroundColor: TOOL_COLORS.card,
            borderColor: TOOL_COLORS.border,
          };

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: toneStyle.backgroundColor,
          borderColor: toneStyle.borderColor,
        },
        style,
      ]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 18,
    gap: 12,
    overflow: 'hidden',
  },
});
