import { Platform } from 'react-native';

import type { Team } from '@/types/domain';

const defaultPrimary = '#355067';
const defaultSecondary = '#DCE5EE';
const defaultAccent = '#8DB7D9';

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
    background: '#051108',
    backgroundElevated: '#0A1A11',
    surface: '#102118',
    surfaceMuted: '#13291D',
    border: 'rgba(255,255,255,0.08)',
    text: '#F3F7F3',
    textMuted: '#AFC1B5',
    success: '#35C26B',
    warning: '#F4C542',
    danger: '#FF6B6B',
    field: '#0B5E2D',
    fieldStripe: '#106E35',
    chip: 'rgba(255,255,255,0.08)',
  },
  spacing: {
    xs: 6,
    sm: 10,
    md: 16,
    lg: 20,
    xl: 28,
  },
  radius: {
    sm: 10,
    md: 16,
    lg: 24,
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

  return {
    ...baseTheme,
    colors: {
      ...baseTheme.colors,
      primary,
      secondary,
      accent,
      primarySoft: `${primary}33`,
      secondarySoft: `${secondary}33`,
      accentSoft: `${accent}33`,
    },
  };
}
