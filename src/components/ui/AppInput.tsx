import { useContext, useEffect, useRef } from 'react';
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
  onFocus,
  ...props
}: AppInputProps) {
  const theme = useAppTheme();
  const keyboardContext = useContext(ScreenKeyboardContext);
  const inputRef = useRef<TextInput>(null);
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
        placeholderTextColor={theme.colors.textMuted}
        returnKeyType={props.multiline ? 'default' : props.returnKeyType ?? 'next'}
        style={[
          styles.input,
          {
            color: theme.colors.text,
            backgroundColor: theme.colors.surface,
            borderColor: error ? theme.colors.danger : theme.colors.border,
          },
          style,
        ]}
        onFocus={(event) => {
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
        {...props}
      />
      {error ? <Text style={[styles.error, { color: theme.colors.danger }]}>{error}</Text> : null}
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
