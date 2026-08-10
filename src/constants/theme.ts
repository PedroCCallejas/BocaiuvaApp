import { Platform } from 'react-native';

import { buildActionPalette } from '@/lib/color-contrast';
import type { Team } from '@/types/domain';

const defaultPrimary = '#1E6A45';
const defaultSecondary = '#D7FF64';
const defaultAccent = '#6EDBFF';

export const fonts = {
  display: Platform.select({
    ios: 'Avenir Next Condensed',
    android: 'sans-serif-condensed',
    default: 'System',
  }),
  heading: Platform.select({
    ios: 'Avenir Next',
    android: 'sans-serif-medium',
    default: 'System',
  }),
  body: Platform.select({
    ios: 'Avenir',
    android: 'sans-serif',
    default: 'System',
  }),
};

export const baseTheme = {
  colors: {
    background: '#070A0D',
    backgroundElevated: '#0B1016',
    surface: '#111820',
    surfaceMuted: '#17212B',
    surfaceRaised: '#1C2834',
    border: 'rgba(232,239,244,0.10)',
    borderStrong: 'rgba(232,239,244,0.18)',
    text: '#F7F9F8',
    textMuted: '#A2AFBA',
    textSubtle: '#75828D',
    success: '#5DE38B',
    warning: '#FFC857',
    danger: '#FF717D',
    action: '#D7FF64',
    actionPressed: '#C4EC52',
    actionText: '#0A1208',
    focus: '#D7FF64',
    scrim: 'rgba(2,4,6,0.78)',
    field: '#0B5E2D',
    fieldStripe: '#106E35',
    chip: 'rgba(255,255,255,0.07)',
  },
  spacing: {
    xxs: 4,
    xs: 6,
    sm: 10,
    md: 16,
    lg: 20,
    xl: 28,
    xxl: 36,
  },
  radius: {
    sm: 12,
    md: 18,
    lg: 26,
    xl: 32,
    pill: 999,
  },
  typography: {
    display: 32,
    title: 22,
    subtitle: 18,
    body: 15,
    caption: 13,
    micro: 11,
  },
};

export type AppTheme = ReturnType<typeof createTeamTheme>;

export function createTeamTheme(
  team?: Pick<Team, 'primaryColor' | 'secondaryColor' | 'accentColor'> | null,
) {
  const primary = team?.primaryColor ?? defaultPrimary;
  const secondary = team?.secondaryColor ?? defaultSecondary;
  const accent = team?.accentColor ?? defaultAccent;

  // A cor de ação (botão primário, foco) sai da identidade do time sempre que
  // ela comportar texto legível. O gradiente antigo ia de `primary` a `secondary`,
  // que em quase todos os presets vai de escuro a claro — nenhuma cor de texto
  // fixa passava em AA. Aqui escolhemos uma única cor sólida e legível, testando
  // accent → secondary → primary, e só caímos no verde-limão padrão se nenhuma servir.
  const actionPalette = buildActionPalette(
    [accent, secondary, primary],
    baseTheme.colors.action,
    baseTheme.colors.background,
  );

  return {
    ...baseTheme,
    colors: {
      ...baseTheme.colors,
      primary,
      secondary,
      accent,
      ...actionPalette,
      primarySoft: `${primary}33`,
      primaryFaint: `${primary}18`,
      secondarySoft: `${secondary}33`,
      secondaryFaint: `${secondary}18`,
      accentSoft: `${accent}33`,
      accentFaint: `${accent}18`,
    },
  };
}
