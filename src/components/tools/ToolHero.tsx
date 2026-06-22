import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { fonts } from '@/constants/theme';

import { ToolBadge } from './ToolBadge';
import { ToolPrimaryButton } from './ToolPrimaryButton';
import { TOOL_COLORS } from './tool-theme';

type ToolHeroAction = {
  label: string;
  href: string;
  variant?: 'primary' | 'secondary' | 'ghost';
};

interface ToolHeroProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  description?: string;
  badges?: string[];
  actions?: ToolHeroAction[];
  hideSideCard?: boolean;
}

export function ToolHero({
  eyebrow = 'Ferramentas da Pelada',
  title,
  subtitle,
  description,
  badges = [],
  actions = [],
  hideSideCard = false,
}: ToolHeroProps) {
  return (
    <View style={styles.heroCard}>
      <View pointerEvents="none" style={styles.fieldGlow} />
      <View pointerEvents="none" style={styles.fieldStripePrimary} />
      <View pointerEvents="none" style={styles.fieldStripeSecondary} />

      <View style={styles.copyBlock}>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        {description ? <Text style={styles.description}>{description}</Text> : null}

        {badges.length ? (
          <View style={styles.badgesRow}>
            {badges.map((badge, index) => (
              <ToolBadge
                key={`${badge}-${index}`}
                label={badge}
                tone={index === 1 ? 'highlight' : 'accent'}
              />
            ))}
          </View>
        ) : null}

        {actions.length ? (
          <View style={styles.actionsRow}>
            {actions.map((action) => (
              <ToolPrimaryButton
                key={`${action.href}-${action.label}`}
                label={action.label}
                variant={action.variant ?? 'primary'}
                onPress={() => router.push(action.href as never)}
              />
            ))}
          </View>
        ) : null}
      </View>

      {!hideSideCard ? (
        <View style={styles.sideCard}>
          <Text style={styles.sideEyebrow}>Bora organizar</Text>
          <Text style={styles.sideTitle}>Quadra pronta</Text>
          <Text style={styles.sideCopy}>
            Sorteio, lista, cronometro e campeonato com visual proprio para quem joga toda semana.
          </Text>
          <Pressable onPress={() => router.push('/login' as never)} style={styles.sideLink}>
            <Text style={styles.sideLinkText}>Conhecer o app completo</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    position: 'relative',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: TOOL_COLORS.borderStrong,
    borderRadius: 32,
    backgroundColor: TOOL_COLORS.fieldDark,
    padding: 24,
    gap: 22,
  },
  fieldGlow: {
    position: 'absolute',
    top: -70,
    right: -30,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(34, 197, 94, 0.18)',
  },
  fieldStripePrimary: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '58%',
    width: 1,
    backgroundColor: 'rgba(167, 243, 208, 0.08)',
  },
  fieldStripeSecondary: {
    position: 'absolute',
    top: '50%',
    left: 24,
    right: 24,
    height: 1,
    backgroundColor: 'rgba(167, 243, 208, 0.08)',
  },
  copyBlock: {
    gap: 12,
  },
  eyebrow: {
    fontFamily: fonts.heading,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: TOOL_COLORS.highlight,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 42,
    fontWeight: '900',
    lineHeight: 44,
    color: TOOL_COLORS.text,
  },
  subtitle: {
    fontFamily: fonts.heading,
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 24,
    color: TOOL_COLORS.accentLight,
  },
  description: {
    maxWidth: 840,
    fontFamily: fonts.body,
    fontSize: 16,
    lineHeight: 25,
    color: TOOL_COLORS.textMuted,
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingTop: 4,
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingTop: 8,
  },
  sideCard: {
    borderWidth: 1,
    borderColor: 'rgba(250, 204, 21, 0.18)',
    borderRadius: 24,
    backgroundColor: 'rgba(7, 42, 24, 0.72)',
    padding: 18,
    gap: 8,
    maxWidth: 360,
  },
  sideEyebrow: {
    fontFamily: fonts.heading,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: TOOL_COLORS.highlight,
  },
  sideTitle: {
    fontFamily: fonts.heading,
    fontSize: 18,
    fontWeight: '800',
    color: TOOL_COLORS.text,
  },
  sideCopy: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 21,
    color: TOOL_COLORS.textMuted,
  },
  sideLink: {
    paddingTop: 4,
  },
  sideLinkText: {
    fontFamily: fonts.heading,
    fontSize: 13,
    fontWeight: '700',
    color: TOOL_COLORS.accentLight,
  },
});
