import type { PropsWithChildren } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, usePathname } from 'expo-router';

import { Screen } from '@/components/ui/Screen';
import { APP_NAME } from '@/constants/branding';
import { fonts } from '@/constants/theme';

import { ToolBadge } from './ToolBadge';
import { ToolHero } from './ToolHero';
import { ToolSection } from './ToolSection';
import { ToolSeoHead } from './ToolSeoHead';
import { TOOL_COLORS, TOOL_HERO_BADGES } from './tool-theme';

type ToolAction = {
  label: string;
  href: string;
  variant?: 'primary' | 'secondary' | 'ghost';
};

type NavItem = {
  label: string;
  href: string;
};

const NAV_ITEMS: NavItem[] = [
  { label: 'Hub', href: '/ferramentas' },
  { label: 'Sorteador', href: '/ferramentas/sorteador-de-times' },
  { label: 'Cronometro', href: '/ferramentas/cronometro-pelada' },
  { label: 'Lista', href: '/ferramentas/rodizio-de-times' },
  { label: 'Campeonato', href: '/ferramentas/campeonato-rapido' },
];

const FOOTER_ITEMS: NavItem[] = [
  { label: 'Ferramentas', href: '/ferramentas' },
  { label: 'Privacidade', href: '/privacidade' },
  { label: 'Termos', href: '/termos' },
  { label: 'Suporte', href: '/suporte' },
  { label: 'Entrar', href: '/login' },
];

interface ToolPageShellProps extends PropsWithChildren {
  title: string;
  subtitle: string;
  description?: string;
  actions?: ToolAction[];
  heroBadges?: string[];
  eyebrow?: string;
  compactHero?: boolean;
  seoTitle?: string;
  seoDescription?: string;
}

function isActivePath(currentPath: string, href: string) {
  return currentPath === href || currentPath.startsWith(`${href}/`);
}

export function ToolPageShell({
  title,
  subtitle,
  description,
  actions,
  children,
  heroBadges = [...TOOL_HERO_BADGES],
  eyebrow,
  compactHero = false,
  seoTitle,
  seoDescription,
}: ToolPageShellProps) {
  const pathname = usePathname();

  return (
    <Screen
      hideWebHeader
      style={styles.screen}
      contentContainerStyle={styles.contentContainer}>
      <ToolSeoHead
        title={seoTitle ?? `${title} | ${APP_NAME}`}
        description={seoDescription ?? description ?? subtitle}
        path={pathname}
      />
      <View style={styles.navCard}>
        <View style={styles.brandRow}>
          <Pressable onPress={() => router.push('/ferramentas' as never)} style={styles.brandBlock}>
            <Text style={styles.brandName}>Ferramentas da Pelada</Text>
            <Text style={styles.brandSubtitle}>Area publica do {APP_NAME} para quadra, society e futsal.</Text>
          </Pressable>
          <ToolBadge label="por Bocaiuva App" tone="muted" />
        </View>

        <View style={styles.navLinks}>
          {NAV_ITEMS.map((item) => {
            const active = isActivePath(pathname, item.href);
            return (
              <Pressable
                key={item.href}
                onPress={() => router.push(item.href as never)}
                style={[
                  styles.navLink,
                  active ? styles.navLinkActive : null,
                ]}>
                <Text style={[styles.navLabel, active ? styles.navLabelActive : null]}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <ToolHero
        eyebrow={eyebrow}
        title={title}
        subtitle={subtitle}
        description={description}
        badges={compactHero ? [] : heroBadges}
        actions={compactHero ? [] : actions}
        hideSideCard={compactHero}
      />

      {children}

      <ToolSection
        kicker="Area publica"
        title="Feita para a turma que quer jogar logo"
        description="Essas ferramentas ficam abertas para qualquer pessoa organizar a pelada em poucos segundos. Quando o grupo quiser historico, ranking, presenca e gestao do elenco, o app completo continua separado.">
        <View style={styles.footerLinks}>
          {FOOTER_ITEMS.map((item) => (
            <Pressable
              key={`footer-${item.href}`}
              onPress={() => router.push(item.href as never)}
              style={styles.footerLink}>
              <Text style={styles.footerLinkText}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
      </ToolSection>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: TOOL_COLORS.background,
  },
  contentContainer: {
    gap: 26,
    paddingTop: 16,
    paddingBottom: 44,
  },
  navCard: {
    borderWidth: 1,
    borderColor: TOOL_COLORS.border,
    borderRadius: 28,
    backgroundColor: TOOL_COLORS.card,
    padding: 18,
    gap: 18,
  },
  brandRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  brandBlock: {
    gap: 5,
    maxWidth: 720,
  },
  brandName: {
    fontFamily: fonts.display,
    fontSize: 30,
    fontWeight: '900',
    color: TOOL_COLORS.text,
  },
  brandSubtitle: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    color: TOOL_COLORS.textMuted,
  },
  navLinks: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  navLink: {
    borderWidth: 1,
    borderColor: TOOL_COLORS.border,
    backgroundColor: TOOL_COLORS.cardAlt,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  navLinkActive: {
    backgroundColor: TOOL_COLORS.accentSoft,
    borderColor: TOOL_COLORS.borderStrong,
  },
  navLabel: {
    fontFamily: fonts.heading,
    fontSize: 13,
    fontWeight: '700',
    color: TOOL_COLORS.textMuted,
  },
  navLabelActive: {
    color: TOOL_COLORS.text,
  },
  footerLinks: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  footerLink: {
    paddingVertical: 4,
  },
  footerLinkText: {
    fontFamily: fonts.heading,
    fontSize: 13,
    fontWeight: '700',
    color: TOOL_COLORS.accentLight,
  },
});
