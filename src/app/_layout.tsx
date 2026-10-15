import 'react-native-gesture-handler';

import { useEffect, useState } from 'react';
import { Stack, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { NoIndexHead } from '@/components/seo/NoIndexHead';
import { installWebAlert } from '@/lib/alert';
import { setupNotificationHandler } from '@/services/notifications';
import { isIndexablePublicRoute } from '@/lib/seo-routes';
import { useAppStore } from '@/store/app-store';
import { baseTheme } from '@/constants/theme';

// `Alert.alert` do react-native-web nao exibe nada: sem isto, todo erro
// reportado ao usuario desaparece silenciosamente no navegador.
installWebAlert();

function isPublicRoute(segments: string[]) {
  if (segments.length === 0) {
    return true;
  }

  return [
    'login',
    'register',
    'forgot-password',
    'teams-gallery',
    'teams',
    'ferramentas',
    'privacidade',
    'termos',
    'suporte',
  ].includes(segments[0] ?? '');
}

export default function RootLayout() {
  const ready = useAppStore((state) => state.ready);
  const bootstrap = useAppStore((state) => state.bootstrap);
  const [startupError, setStartupError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const segments = useSegments() as string[];
  const shouldNoIndex = !isIndexablePublicRoute(segments);

  useEffect(() => {
    void setupNotificationHandler();
  }, []);

  useEffect(() => {
    let active = true;
    void bootstrap().catch(() => { if (active) setStartupError(true); });
    return () => { active = false; };
  }, [bootstrap, attempt]);

  if (!ready && (startupError || !isPublicRoute(segments))) {
    const publicPage = ['teams-gallery', 'teams', 'privacidade', 'termos', 'suporte'].includes(segments[0] ?? '');
    if (!publicPage) return <SafeAreaProvider><NoIndexHead /><View style={{ flex: 1, backgroundColor: baseTheme.colors.background, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
      {startupError ? <ErrorState onRetry={() => { setStartupError(false); setAttempt(value => value + 1); }} /> : <LoadingState />}
    </View></SafeAreaProvider>;
  }

  return (
    <SafeAreaProvider>
      {shouldNoIndex ? <NoIndexHead /> : null}
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: {
            backgroundColor: baseTheme.colors.background,
          },
        }}
      />
    </SafeAreaProvider>
  );
}
