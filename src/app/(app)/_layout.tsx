import { Redirect, Stack, useSegments } from 'expo-router';
import { Platform } from 'react-native';

import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAppStore } from '@/store/app-store';
import { selectCurrentTeam, selectCurrentUser } from '@/store/selectors';

export default function AppLayout() {
  const theme = useAppTheme();
  const user = useAppStore(selectCurrentUser);
  const team = useAppStore(selectCurrentTeam);
  const segments = useSegments() as string[];

  if (!user) {
    return <Redirect href="/login" />;
  }

  const inTeamSetup = segments.some((segment) => segment === 'team-setup');
  const inTeamAccess = segments.some((segment) => segment === 'team-access');

  if (!team && !inTeamSetup && !inTeamAccess) {
    return <Redirect href={'/team-access' as never} />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: Platform.OS !== 'web',
        headerStyle: { backgroundColor: theme.colors.backgroundElevated },
        headerTintColor: theme.colors.text,
        headerShadowVisible: false,
        headerTitleStyle: {
          fontFamily: fonts.heading,
          fontWeight: '800',
        },
        contentStyle: {
          backgroundColor: theme.colors.background,
        },
      }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="team-access" options={{ title: 'Meus times' }} />
      <Stack.Screen name="team-setup" options={{ title: 'Criar novo time' }} />
      <Stack.Screen name="team-settings" options={{ title: 'Editar time' }} />
      <Stack.Screen
        name="team-rating-criteria"
        options={{ title: 'Critérios de avaliação' }}
      />
      <Stack.Screen name="team-invite" options={{ title: 'Convidar jogadores' }} />
      <Stack.Screen name="financeiro" options={{ title: 'Financeiro' }} />
      <Stack.Screen name="notifications" options={{ title: 'Notificações' }} />
      <Stack.Screen name="players/create" options={{ title: 'Novo jogador' }} />
      <Stack.Screen name="players/[playerId]" options={{ title: 'Jogador' }} />
      <Stack.Screen name="players/[playerId]/edit" options={{ title: 'Editar jogador' }} />
      <Stack.Screen name="matches/create" options={{ title: 'Nova partida' }} />
      <Stack.Screen
        name="matches/register-legacy"
        options={{ title: 'Registrar jogo antigo' }}
      />
      <Stack.Screen name="matches/import" options={{ title: 'Importar jogos' }} />
      <Stack.Screen name="matches/[matchId]" options={{ title: 'Detalhe da partida' }} />
      <Stack.Screen name="matches/[matchId]/edit" options={{ title: 'Editar partida' }} />
      <Stack.Screen name="matches/[matchId]/finish" options={{ title: 'Pós-jogo' }} />
      <Stack.Screen name="matches/[matchId]/mvp" options={{ title: 'Votação MVP' }} />
      <Stack.Screen name="matches/[matchId]/ratings" options={{ title: 'Notas da partida' }} />
      <Stack.Screen
        name="matches/[matchId]/diary-entry"
        options={{ title: 'Diário da partida' }}
      />
      <Stack.Screen name="lineup/[matchId]" options={{ title: 'Escalação visual' }} />
    </Stack>
  );
}
