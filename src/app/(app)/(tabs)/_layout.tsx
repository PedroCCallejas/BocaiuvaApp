import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { Platform, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAppStore } from '@/store/app-store';
import { selectCanManageTeam } from '@/store/selectors';

export default function TabsLayout() {
  const theme = useAppTheme();
  const canManageTeam = useAppStore(selectCanManageTeam);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const isWeb = Platform.OS === 'web';

  // Sete abas em tela estreita nao cabem com o tamanho padrao: o rotulo era
  // cortado no meio da palavra e o icone encostava na borda. Abaixo de 400px
  // encolhemos icone e fonte para tudo caber inteiro.
  const isCompact = !isWeb && width < 400;
  const iconSize = isCompact ? 20 : 24;
  const labelFontSize = isCompact ? 9 : 10;

  // Altura explicita: sem ela o rotulo some atras da area segura em aparelho
  // com barra de gestos.
  const barHeight = isWeb ? 72 : 58 + insets.bottom;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.colors.backgroundElevated,
          borderTopColor: theme.colors.border,
          borderTopWidth: 1,
          height: barHeight,
          paddingBottom: isWeb ? 10 : Math.max(insets.bottom, 6),
          paddingTop: isWeb ? 8 : 6,
        },
        tabBarItemStyle: {
          borderRadius: isCompact ? 10 : 14,
          marginHorizontal: isWeb ? 4 : 1,
          marginVertical: isWeb ? 5 : 2,
          paddingHorizontal: 0,
        },
        tabBarActiveBackgroundColor: theme.colors.primaryFaint,
        tabBarActiveTintColor: theme.colors.action,
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarHideOnKeyboard: true,
        tabBarLabelStyle: {
          fontFamily: fonts.heading,
          fontSize: labelFontSize,
          fontWeight: '800',
          // Sem isso o texto quebra em duas linhas e some sob a borda.
          marginBottom: isWeb ? 0 : 2,
        },
        tabBarIconStyle: {
          marginTop: isWeb ? 0 : 2,
        },
      }}>
      <Tabs.Screen
        name="home"
        options={{
          title: 'Início',
          tabBarIcon: ({ color }) => <Ionicons name="home" color={color} size={iconSize} />,
        }}
      />
      <Tabs.Screen
        name="players"
        options={{
          title: isCompact ? 'Elenco' : 'Jogadores',
          tabBarIcon: ({ color }) => <Ionicons name="people" color={color} size={iconSize} />,
        }}
      />
      <Tabs.Screen
        name="matches"
        options={{
          title: isCompact ? 'Jogos' : 'Partidas',
          tabBarIcon: ({ color }) => <Ionicons name="calendar" color={color} size={iconSize} />,
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          // "Estatísticas" nao cabe em tela estreita e era cortado no meio.
          title: isCompact ? 'Stats' : 'Estatísticas',
          tabBarIcon: ({ color }) => (
            <Ionicons name="stats-chart" color={color} size={iconSize} />
          ),
        }}
      />
      <Tabs.Screen
        name="rankings"
        options={{
          title: isCompact ? 'Ranking' : 'Rankings',
          tabBarIcon: ({ color }) => <Ionicons name="trophy" color={color} size={iconSize} />,
        }}
      />
      <Tabs.Screen
        name="financeiro"
        options={{
          title: isCompact ? 'Caixa' : 'Financeiro',
          // `href: null` remove a aba da barra para quem não administra o time.
          // A própria tela já redireciona quem não tem permissão.
          href: canManageTeam ? undefined : null,
          tabBarIcon: ({ color }) => <Ionicons name="wallet" color={color} size={iconSize} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Conta',
          tabBarIcon: ({ color }) => <Ionicons name="person" color={color} size={iconSize} />,
        }}
      />
    </Tabs>
  );
}
