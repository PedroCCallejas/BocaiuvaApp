import 'react-native-gesture-handler';

import { useEffect } from 'react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { fonts } from '@/constants/theme';
import { setupNotificationHandler } from '@/services/notifications';
import { useAppStore } from '@/store/app-store';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const ready = useAppStore((state) => state.ready);
  const bootstrap = useAppStore((state) => state.bootstrap);

  useEffect(() => {
    void setupNotificationHandler();
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (ready) {
      void SplashScreen.hideAsync();
    }
  }, [ready]);

  if (!ready) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#08150C' },
          headerTintColor: '#F3F7F3',
          headerShadowVisible: false,
          headerTitleStyle: {
            fontFamily: fonts.heading,
            fontWeight: '800',
          },
          contentStyle: {
            backgroundColor: '#051108',
          },
        }}
      />
    </SafeAreaProvider>
  );
}
