import {
  createContext,
  useMemo,
  useRef,
  type PropsWithChildren,
} from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import {
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import { useAppTheme } from '@/hooks/use-app-theme';

import { WebScreenHeader } from '../navigation/WebScreenHeader';

export interface ScreenKeyboardContextValue {
  scrollToFocusedInput: (target: unknown) => void;
}

export const ScreenKeyboardContext =
  createContext<ScreenKeyboardContextValue | null>(null);

interface ScreenProps extends PropsWithChildren {
  scroll?: boolean;
  scrollEnabled?: boolean;
  keyboardAware?: boolean;
  formMode?: boolean;
  bottomSafePadding?: number;
  keyboardVerticalOffset?: number;
  keyboardShouldPersistTaps?: 'never' | 'always' | 'handled';
  refreshing?: boolean;
  onRefresh?: () => void;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  hideWebHeader?: boolean;
}

export function Screen({
  children,
  scroll = true,
  scrollEnabled = true,
  keyboardAware = true,
  formMode = false,
  bottomSafePadding = 0,
  keyboardVerticalOffset = Platform.OS === 'ios' ? 12 : 0,
  keyboardShouldPersistTaps = 'handled',
  refreshing = false,
  onRefresh,
  style,
  contentContainerStyle,
  hideWebHeader = false,
}: ScreenProps) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const keyboardAvoidanceEnabled = keyboardAware && Platform.OS === 'ios';
  const contentPaddingBottom =
    Math.max(
      insets.bottom,
      Platform.OS === 'web' ? 32 : formMode ? 112 : 28,
    ) + bottomSafePadding;

  const keyboardContextValue = useMemo<ScreenKeyboardContextValue>(
    () => ({
      scrollToFocusedInput: (target) => {
        if (Platform.OS === 'web' || !target || !scroll) {
          return;
        }

        const responder = scrollRef.current?.getScrollResponder?.() as
          | {
              scrollResponderScrollNativeHandleToKeyboard?: (
                nodeHandle: unknown,
                extraHeight?: number,
                preventNegativeScrollOffset?: boolean,
              ) => void;
            }
          | undefined;

        responder?.scrollResponderScrollNativeHandleToKeyboard?.(
          target,
          formMode ? 120 : 88,
          true,
        );
      },
    }),
    [formMode, scroll],
  );

  const content = scroll ? (
    <ScrollView
      ref={scrollRef}
      automaticallyAdjustKeyboardInsets={keyboardAvoidanceEnabled}
      contentInsetAdjustmentBehavior={Platform.OS === 'ios' ? 'automatic' : 'never'}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: contentPaddingBottom },
        contentContainerStyle,
      ]}
      keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      scrollEnabled={scrollEnabled}
      refreshControl={
        onRefresh && Platform.OS !== 'web' ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.primary}
            colors={[theme.colors.primary]}
            progressBackgroundColor={theme.colors.surface}
          />
        ) : undefined
      }
      showsVerticalScrollIndicator={false}>
      {children}
    </ScrollView>
  ) : (
    <View
      style={[
        styles.content,
        { paddingBottom: contentPaddingBottom },
        contentContainerStyle,
      ]}>
      {children}
    </View>
  );

  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={[styles.safeArea, { backgroundColor: theme.colors.background }, style]}>
      <View
        pointerEvents="none"
        style={[styles.orbTop, { backgroundColor: theme.colors.primarySoft }]}
      />
      <View
        pointerEvents="none"
        style={[styles.orbBottom, { backgroundColor: theme.colors.secondarySoft }]}
      />
      <KeyboardAvoidingView
        behavior="padding"
        enabled={keyboardAvoidanceEnabled}
        keyboardVerticalOffset={keyboardVerticalOffset}
        style={styles.flex}>
        {Platform.OS === 'web' && !hideWebHeader ? <WebScreenHeader /> : null}
        <ScreenKeyboardContext.Provider value={keyboardContextValue}>
          {content}
        </ScreenKeyboardContext.Provider>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 1200 : 1080,
    alignSelf: 'center',
    padding: Platform.OS === 'web' ? 24 : 20,
    gap: 20,
  },
  orbTop: {
    position: 'absolute',
    top: -80,
    right: -40,
    width: 220,
    height: 220,
    borderRadius: 110,
    opacity: 0.35,
  },
  orbBottom: {
    position: 'absolute',
    bottom: -100,
    left: -40,
    width: 240,
    height: 240,
    borderRadius: 120,
    opacity: 0.2,
  },
});
