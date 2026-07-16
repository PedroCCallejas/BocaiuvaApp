import 'react-native-gesture-handler';

import { useEffect } from 'react';
import { Stack, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { NoIndexHead } from '@/components/seo/NoIndexHead';
import { initializeAdMob } from '@/services/ads/admob-service';
import { setupNotificationHandler } from '@/services/notifications';
import { isIndexablePublicRoute } from '@/lib/seo-routes';
import { useAppStore } from '@/store/app-store';

void SplashScreen.preventAutoHideAsync();

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
  const segments = useSegments() as string[];
  const shouldNoIndex = !isIndexablePublicRoute(segments);

  useEffect(() => {
    void setupNotificationHandler();
    void initializeAdMob();
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (ready) {
      void SplashScreen.hideAsync();
    }
  }, [ready]);

  if (!ready && !isPublicRoute(segments)) {
    return <NoIndexHead />;
  }

  return (
    <SafeAreaProvider>
      {shouldNoIndex ? <NoIndexHead /> : null}
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: {
            backgroundColor: '#051108',
          },
        }}
      />
    </SafeAreaProvider>
  );
}
