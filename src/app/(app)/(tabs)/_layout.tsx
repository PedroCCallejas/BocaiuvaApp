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

  // O que decide o tamanho e a LARGURA DA TELA, nunca a plataforma. O app roda
  // no navegador do celular, onde Platform.OS ja e 'web': amarrar o modo
  // compacto a plataforma fazia a correcao nunca valer justamente onde o
  // problema aparece.
  const isCompact = width < 420;
  const isVeryNarrow = width < 340;

  const iconSize = isVeryNarrow ? 18 : isCompact ? 20 : 24;
  const labelFontSize = isVeryNarrow ? 8 : isCompact ? 9 : 11;

  // Altura precisa somar a area segura em qualquer plataforma: o navegador do
  // celular tambem tem barra de gestos, e era ela que "comia" os rotulos.
  const baseHeight = isCompact ? 56 : 68;
  const bottomInset = Math.max(insets.bottom, isWeb ? 0 : 6);
  const barHeight = baseHeight + bottomInset;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.colors.backgroundElevated,
          borderTopColor: theme.colors.border,
          borderTopWidth: 1,
          height: barHeight,
          paddingBottom: bottomInset + 6,
          paddingTop: 6,
        },
        tabBarItemStyle: {
          borderRadius: isCompact ? 10 : 14,
          marginHorizontal: isCompact ? 1 : 4,
          marginVertical: isCompact ? 2 : 5,
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
          // Uma linha so: quebrando em duas, a segunda ficava sob a borda.
          lineHeight: labelFontSize + 3,
          marginBottom: 0,
          paddingBottom: 0,
        },
        tabBarIconStyle: {
          marginTop: 0,
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
