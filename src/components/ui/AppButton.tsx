import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from 'react-native';
import { useState } from 'react';

import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';

interface AppButtonProps {
  label: string;
  onPress: (event?: GestureResponderEvent) => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function AppButton({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  fullWidth,
  size = 'md',
}: AppButtonProps) {
  const theme = useAppTheme();
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const contentColor =
    variant === 'primary'
      ? theme.colors.actionText
      : variant === 'danger'
        ? theme.colors.danger
        : theme.colors.text;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      accessibilityState={{ disabled: Boolean(disabled || loading), busy: Boolean(loading) }}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.pressable,
        fullWidth && styles.fullWidth,
        size === 'sm' ? styles.small : size === 'lg' ? styles.large : null,
        focused ? { borderWidth: 2, borderColor: theme.colors.focus } : null,
        pressed && !disabled && !loading ? styles.pressed : null,
        disabled ? styles.disabled : null,
      ]}>
      {variant === 'primary' ? (
        <View style={[styles.primary, { backgroundColor: pressed ? theme.colors.actionPressed : theme.colors.action }]}>
          <ButtonLabel label={label} color={contentColor} loading={loading} />
        </View>
      ) : (
        <View
          style={[
            styles.fallback,
            {
              backgroundColor:
                variant === 'danger'
                  ? theme.colors.dangerSoft
                  : variant === 'secondary'
                    ? (hovered ? theme.colors.surfaceRaised : theme.colors.surfaceMuted)
                    : 'transparent',
              borderColor:
                variant === 'danger'
                  ? theme.colors.dangerBorder
                  : variant === 'ghost'
                    ? theme.colors.border
                    : theme.colors.borderStrong,
            },
          ]}>
          <ButtonLabel
            label={label}
            color={variant === 'danger' ? theme.colors.danger : contentColor}
            loading={loading}
          />
        </View>
      )}
    </Pressable>
  );
}

function ButtonLabel({
  label,
  color,
  loading,
}: {
  label: string;
  color: string;
  loading?: boolean;
}) {
  return (
    <>
      {loading ? <ActivityIndicator color={color} /> : null}
      <Text style={[styles.label, { color }]}>{label}</Text>
    </>
  );
}

const styles = StyleSheet.create({
  pressable: {
    minWidth: 120,
    borderWidth: 2,
    borderColor: 'transparent',
    borderRadius: 12,
  },
  fullWidth: {
    width: '100%',
  },
  primary: {
    minHeight: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 18,
  },
  fallback: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 18,
  },
  label: {
    fontFamily: fonts.heading,
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.15,
    flexShrink: 1,
    textAlign: 'center',
  },
  small: { minWidth: 88 },
  large: { width: '100%' },
  pressed: {
    opacity: 0.9,
  },
  disabled: {
    opacity: 0.5,
  },
});
