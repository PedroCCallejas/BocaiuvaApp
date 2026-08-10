import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';

interface AppButtonProps {
  label: string;
  onPress: (event?: GestureResponderEvent) => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
}

export function AppButton({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  fullWidth,
}: AppButtonProps) {
  const theme = useAppTheme();
  const contentColor =
    variant === 'primary'
      ? theme.colors.actionText
      : variant === 'danger'
        ? theme.colors.danger
        : theme.colors.text;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled || loading), busy: Boolean(loading) }}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.pressable,
        fullWidth && styles.fullWidth,
        variant === 'primary' ? styles.primaryShadow : null,
        pressed && !disabled && !loading ? styles.pressed : null,
        disabled ? styles.disabled : null,
      ]}>
      {variant === 'primary' ? (
        <LinearGradient
          colors={[theme.colors.action, theme.colors.actionPressed]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradient}>
          <ButtonLabel label={label} color={contentColor} loading={loading} />
        </LinearGradient>
      ) : (
        <View
          style={[
            styles.fallback,
            {
              backgroundColor:
                variant === 'danger'
                  ? `${theme.colors.danger}14`
                  : variant === 'secondary'
                    ? theme.colors.surfaceRaised
                    : 'transparent',
              borderColor:
                variant === 'danger'
                  ? `${theme.colors.danger}52`
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
    borderRadius: 16,
  },
  fullWidth: {
    width: '100%',
  },
  gradient: {
    minHeight: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 18,
  },
  fallback: {
    minHeight: 50,
    borderRadius: 16,
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
    fontWeight: '800',
    letterSpacing: 0.15,
  },
  primaryShadow: {
    shadowColor: '#D7FF64',
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 3,
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.985 }],
  },
  disabled: {
    opacity: 0.5,
  },
});
