import { baseTheme } from '@/constants/theme';

const colors = baseTheme.colors;
export const TOOL_COLORS = {
  background: colors.background, field: colors.identity, fieldDark: colors.backgroundElevated,
  accent: colors.action, accentSoft: colors.actionSoft, accentStrong: colors.actionPressed,
  accentLight: colors.actionHover, highlight: colors.info, highlightSoft: colors.infoSoft,
  card: colors.surface, cardAlt: colors.surfaceMuted, cardMuted: colors.backgroundElevated,
  border: colors.border, borderStrong: colors.borderInput, text: colors.text,
  textMuted: colors.textMuted, textSoft: colors.textMuted, danger: colors.danger, dangerSoft: colors.dangerSoft,
};
export const TOOL_HERO_BADGES = [] as const;
