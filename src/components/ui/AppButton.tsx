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
    variant === 'ghost' ? theme.colors.text : variant === 'secondary' ? theme.colors.text : '#041008';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.pressable,
        fullWidth && styles.fullWidth,
        pressed && !disabled && !loading ? styles.pressed : null,
        disabled ? styles.disabled : null,
      ]}>
      {variant === 'primary' ? (
        <LinearGradient
          colors={[theme.colors.primary, theme.colors.secondary]}
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
                  ? `${theme.colors.danger}20`
                  : variant === 'secondary'
                    ? theme.colors.backgroundElevated
                    : theme.colors.backgroundElevated,
              borderColor:
                variant === 'danger'
                  ? `${theme.colors.danger}66`
                  : variant === 'ghost'
                    ? 'rgba(255,255,255,0.14)'
                    : 'rgba(255,255,255,0.14)',
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
  },
  fullWidth: {
    width: '100%',
  },
  gradient: {
    minHeight: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 18,
  },
  fallback: {
    minHeight: 52,
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
    fontSize: 15,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.86,
  },
  disabled: {
    opacity: 0.5,
  },
});
