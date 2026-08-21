import { useContext, useEffect, useRef, useState } from 'react';
import type { TextInputProps } from 'react-native';
import {
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
  findNodeHandle,
} from 'react-native';

import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';

import { ScreenKeyboardContext } from './Screen';

interface AppInputProps extends TextInputProps {
  label: string;
  error?: string;
}

export function AppInput({
  label,
  error,
  style,
  onBlur,
  onFocus,
  accessibilityHint,
  accessibilityLabel,
  ...props
}: AppInputProps) {
  const theme = useAppTheme();
  const keyboardContext = useContext(ScreenKeyboardContext);
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const focusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (focusTimeoutRef.current) {
        clearTimeout(focusTimeoutRef.current);
      }
    },
    [],
  );

  return (
    <View style={styles.wrapper}>
      <Text style={[styles.label, { color: theme.colors.textMuted }]}>{label}</Text>
      <TextInput
        ref={inputRef}
        accessibilityHint={error ?? accessibilityHint}
        accessibilityLabel={accessibilityLabel ?? label}
        aria-invalid={Boolean(error)}
        placeholderTextColor={theme.colors.textMuted}
        returnKeyType={props.multiline ? 'default' : props.returnKeyType ?? 'next'}
        style={[
          styles.input,
          {
            color: theme.colors.text,
            backgroundColor: theme.colors.backgroundElevated,
            borderColor: error
              ? theme.colors.danger
              : focused
                ? theme.colors.focus
                : theme.colors.borderStrong,
          },
          style,
        ]}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);

          if (Platform.OS === 'web') {
            return;
          }

          if (focusTimeoutRef.current) {
            clearTimeout(focusTimeoutRef.current);
          }

          focusTimeoutRef.current = setTimeout(() => {
            const target = findNodeHandle(inputRef.current);

            if (target) {
              keyboardContext?.scrollToFocusedInput(target);
            }
          }, 90);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        selectionColor={theme.colors.action}
        {...props}
      />
      {error ? (
        <Text
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
          style={[styles.error, { color: theme.colors.danger }]}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 8,
  },
  label: {
    fontFamily: fonts.heading,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  input: {
    minHeight: 54,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontFamily: fonts.body,
    fontSize: 16,
  },
  error: {
    fontFamily: fonts.body,
    fontSize: 12,
  },
});
