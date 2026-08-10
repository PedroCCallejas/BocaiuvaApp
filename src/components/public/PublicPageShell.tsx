import { useEffect, useState, type PropsWithChildren } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, usePathname } from 'expo-router';

import { AppButton } from '@/components/ui/AppButton';
import { Screen } from '@/components/ui/Screen';
import { PublicSeoHead } from '@/components/seo/PublicSeoHead';
import type { PublicSeoMetadata } from '@/lib/public-seo';
import { APP_NAME } from '@/constants/branding';
import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';

type PublicAction = {
  label: string;
  href: string;
  variant?: 'primary' | 'secondary' | 'ghost';
};

type PublicNavItem = {
  label: string;
  href: string;
};

const PUBLIC_NAV_ITEMS: PublicNavItem[] = [
  { label: 'Início', href: '/' },
  { label: 'Galeria pública', href: '/teams-gallery' },
  { label: 'Ferramentas', href: '/ferramentas' },
  { label: 'Entrar', href: '/login' },
  { label: 'Criar conta', href: '/register' },
  { label: 'Privacidade', href: '/privacidade' },
  { label: 'Termos', href: '/termos' },
  { label: 'Suporte', href: '/suporte' },
];

interface PublicPageShellProps extends PropsWithChildren {
  eyebrow?: string;
  title: string;
  description: string;
  seo?: PublicSeoMetadata;
  actions?: PublicAction[];
}

function isActivePath(currentPath: string, href: string) {
  if (href === '/') {
    return currentPath === '/';
  }

  return currentPath === href || currentPath.startsWith(`${href}/`);
}

export function PublicPageShell({
  eyebrow,
  title,
  description,
  seo,
  actions,
  children,
}: PublicPageShellProps) {
  const pathname = usePathname();
  const theme = useAppTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <Screen hideWebHeader contentContainerStyle={styles.screen}>
      {seo ? <PublicSeoHead {...seo} /> : null}
      <View
        style={[
          styles.navCard,
          {
            backgroundColor: theme.colors.backgroundElevated,
            borderColor: theme.colors.border,
          },
        ]}>
        <Pressable onPress={() => router.push('/')} style={styles.brandBlock}>
          <Text style={[styles.brandName, { color: theme.colors.text }]}>{APP_NAME}</Text>
          <Text style={[styles.brandSubtitle, { color: theme.colors.textMuted }]}>
            Plataforma para organização de times de futebol amador e society.
          </Text>
        </Pressable>

        <View style={styles.navLinks}>
          {PUBLIC_NAV_ITEMS.map((item) => {
            const active = mounted && isActivePath(pathname, item.href);

            return (
              <Pressable
                key={item.href}
                onPress={() => router.push(item.href as never)}
                style={[
                  styles.navLink,
                  {
                    backgroundColor: active
                      ? theme.colors.primarySoft
                      : theme.colors.backgroundElevated,
                    borderColor: active ? theme.colors.primary : theme.colors.border,
                  },
                ]}>
                <Text
                  style={[
                    styles.navLinkText,
                    { color: active ? theme.colors.text : theme.colors.textMuted },
                  ]}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View
        style={[
          styles.hero,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
          },
        ]}>
        <View style={[styles.heroAccent, { backgroundColor: theme.colors.action }]} />
        {eyebrow ? (
          <Text style={[styles.eyebrow, { color: theme.colors.secondary }]}>{eyebrow}</Text>
        ) : null}
        <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
        <Text style={[styles.description, { color: theme.colors.textMuted }]}>{description}</Text>
        {actions?.length ? (
          <View style={styles.actionsRow}>
            {actions.map((action) => (
              <AppButton
                key={`${action.href}-${action.label}`}
                label={action.label}
                variant={action.variant ?? 'primary'}
                onPress={() => router.push(action.href as never)}
              />
            ))}
          </View>
        ) : null}
      </View>

      {children}

      <View
        style={[
          styles.footerCard,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
          },
        ]}>
        <Text style={[styles.footerTitle, { color: theme.colors.text }]}>
          Professô FC para times que querem se organizar melhor
        </Text>
        <Text style={[styles.footerCopy, { color: theme.colors.textMuted }]}>
          A área pública explica o projeto, mostra perfis públicos liberados pelos próprios
          times e mantém dados privados fora da vitrine.
        </Text>
        <View style={styles.footerLinks}>
          {PUBLIC_NAV_ITEMS.filter((item) =>
            ['/teams-gallery', '/ferramentas', '/login', '/register', '/privacidade', '/termos', '/suporte'].includes(
              item.href,
            ),
          ).map((item) => (
            <Pressable
              key={`footer-${item.href}`}
              onPress={() => router.push(item.href as never)}
              style={styles.footerLinkButton}>
              <Text style={[styles.footerLinkText, { color: theme.colors.secondary }]}>
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    gap: 24,
    paddingTop: 18,
    paddingBottom: 36,
  },
  navCard: {
    borderWidth: 1,
    borderRadius: 28,
    padding: 18,
    gap: 18,
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  brandBlock: {
    gap: 4,
  },
  brandName: {
    fontFamily: fonts.display,
    fontSize: 28,
    fontWeight: '900',
  },
  brandSubtitle: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
  },
  navLinks: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  navLink: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  navLinkText: {
    fontFamily: fonts.heading,
    fontSize: 13,
    fontWeight: '700',
  },
  hero: {
    minHeight: 300,
    borderWidth: 1,
    borderRadius: 30,
    paddingHorizontal: 26,
    paddingVertical: 32,
    justifyContent: 'center',
    gap: 12,
    overflow: 'hidden',
  },
  heroAccent: {
    position: 'absolute',
    left: 0,
    top: 32,
    bottom: 32,
    width: 4,
    borderTopRightRadius: 999,
    borderBottomRightRadius: 999,
  },
  eyebrow: {
    fontFamily: fonts.heading,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 46,
    fontWeight: '900',
    lineHeight: 49,
    maxWidth: 920,
  },
  description: {
    fontFamily: fonts.body,
    fontSize: 16,
    lineHeight: 24,
    maxWidth: 860,
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingTop: 6,
  },
  footerCard: {
    borderWidth: 1,
    borderRadius: 28,
    padding: 20,
    gap: 10,
  },
  footerTitle: {
    fontFamily: fonts.heading,
    fontSize: 20,
    fontWeight: '800',
  },
  footerCopy: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 22,
  },
  footerLinks: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    paddingTop: 4,
  },
  footerLinkButton: {
    paddingVertical: 4,
  },
  footerLinkText: {
    fontFamily: fonts.heading,
    fontSize: 13,
    fontWeight: '700',
  },
});
