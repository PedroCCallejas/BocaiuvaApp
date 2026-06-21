import { Pressable, StyleSheet, Text, type GestureResponderEvent } from 'react-native';

import { fonts } from '@/constants/theme';

import { TOOL_COLORS } from './tool-theme';

type ToolButtonVariant = 'primary' | 'secondary' | 'ghost';

interface ToolPrimaryButtonProps {
  label: string;
  onPress: (event?: GestureResponderEvent) => void;
  variant?: ToolButtonVariant;
  fullWidth?: boolean;
}

export function ToolPrimaryButton({
  label,
  onPress,
  variant = 'primary',
  fullWidth = false,
}: ToolPrimaryButtonProps) {
  const isPrimary = variant === 'primary';
  const isSecondary = variant === 'secondary';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        fullWidth ? styles.fullWidth : null,
        {
          backgroundColor: isPrimary
            ? TOOL_COLORS.accent
            : isSecondary
              ? TOOL_COLORS.cardAlt
              : 'transparent',
          borderColor: isPrimary
            ? TOOL_COLORS.accent
            : isSecondary
              ? TOOL_COLORS.borderStrong
              : TOOL_COLORS.border,
        },
        pressed ? styles.pressed : null,
      ]}>
      <Text
        style={[
          styles.label,
          {
            color: isPrimary ? TOOL_COLORS.background : TOOL_COLORS.text,
          },
        ]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 50,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullWidth: {
    width: '100%',
  },
  label: {
    fontFamily: fonts.heading,
    fontSize: 15,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.88,
    transform: [{ translateY: 1 }],
  },
});
