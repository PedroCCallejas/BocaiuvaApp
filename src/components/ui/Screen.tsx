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
  useWindowDimensions,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

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

/**
 * Folga reservada para a barra de abas. Mantido acima da altura real dela
 * (56–68px conforme a largura) para o ultimo item nunca encostar na borda.
 */
const TAB_BAR_CLEARANCE = 88;

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
  const { width } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const keyboardAvoidanceEnabled = keyboardAware && Platform.OS === 'ios';
  const isWideWeb = Platform.OS === 'web' && width >= 768;
  // A barra de abas flutua sobre o conteudo, entao o fim da lista precisa de
  // folga suficiente para nao ficar escondido atras dela. No navegador do
  // celular os 32px antigos eram menores que a propria barra (~68px + area
  // segura), e o ultimo item aparecia cortado.
  const contentPaddingBottom =
    Math.max(
      insets.bottom + TAB_BAR_CLEARANCE,
      Platform.OS === 'web' ? TAB_BAR_CLEARANCE : formMode ? 112 : 28,
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

  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={[styles.safeArea, { backgroundColor: theme.colors.background }, style]}>
      <LinearGradient
        pointerEvents="none"
        colors={[theme.colors.primaryFaint, 'rgba(7,10,13,0)']}
        start={{ x: 1, y: 0 }}
        end={{ x: 0.25, y: 1 }}
        style={styles.ambientTop}
      />
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(7,10,13,0)', theme.colors.secondaryFaint]}
        start={{ x: 0.35, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.ambientBottom}
      />
      <KeyboardAvoidingView
        behavior="padding"
        enabled={keyboardAvoidanceEnabled}
        keyboardVerticalOffset={keyboardVerticalOffset}
        style={styles.flex}>
        {isWideWeb && !hideWebHeader ? <WebScreenHeader /> : null}
        <ScreenKeyboardContext.Provider value={keyboardContextValue}>
          {scroll ? (
            <ScrollView
              ref={scrollRef}
              automaticallyAdjustKeyboardInsets={keyboardAvoidanceEnabled}
              contentInsetAdjustmentBehavior={Platform.OS === 'ios' ? 'automatic' : 'never'}
              contentContainerStyle={[
                styles.content,
                {
                  maxWidth: isWideWeb ? 1200 : 1080,
                  paddingHorizontal: isWideWeb ? 28 : 18,
                  paddingTop: isWideWeb ? 28 : 20,
                  paddingBottom: contentPaddingBottom,
                  gap: isWideWeb ? 24 : 20,
                },
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
                    tintColor={theme.colors.action}
                    colors={[theme.colors.action]}
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
                {
                  maxWidth: isWideWeb ? 1200 : 1080,
                  paddingHorizontal: isWideWeb ? 28 : 18,
                  paddingTop: isWideWeb ? 28 : 20,
                  paddingBottom: contentPaddingBottom,
                  gap: isWideWeb ? 24 : 20,
                },
                contentContainerStyle,
              ]}>
              {children}
            </View>
          )}
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
    alignSelf: 'center',
  },
  ambientTop: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: '72%',
    height: 420,
    opacity: 0.72,
  },
  ambientBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: '62%',
    height: 360,
    opacity: 0.34,
  },
});
