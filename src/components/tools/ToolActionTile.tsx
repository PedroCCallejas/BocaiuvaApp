import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { fonts } from '@/constants/theme';

import { TOOL_COLORS } from './tool-theme';

interface ToolActionTileProps {
  icon: string;
  title: string;
  description: string;
  onPress: () => void;
  style?: ViewStyle;
}

export function ToolActionTile({ icon, title, description, onPress, style }: ToolActionTileProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.tile,
        pressed && styles.tilePressed,
        style,
      ]}>
      {({ pressed }) => (
        <>
          <View style={[styles.iconBox, pressed && styles.iconBoxPressed]}>
            <Text style={styles.icon}>{icon}</Text>
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.description}>{description}</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    backgroundColor: TOOL_COLORS.card,
    borderWidth: 1.5,
    borderColor: TOOL_COLORS.borderStrong,
    borderRadius: 20,
    padding: 18,
    gap: 8,
    minHeight: 134,
    justifyContent: 'flex-end',
  },
  tilePressed: {
    backgroundColor: TOOL_COLORS.cardAlt,
    borderColor: TOOL_COLORS.accent,
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: TOOL_COLORS.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  iconBoxPressed: {
    backgroundColor: 'rgba(34, 197, 94, 0.28)',
  },
  icon: {
    fontSize: 24,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 22,
    color: TOOL_COLORS.text,
  },
  description: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
    color: TOOL_COLORS.textSoft,
  },
});
