import type { PropsWithChildren } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { AppNavigation } from '@/components/navigation/AppNavigation';
import { AppButton } from '@/components/ui/AppButton';
import { Screen } from '@/components/ui/Screen';
import { PublicSeoHead } from '@/components/seo/PublicSeoHead';
import { LegalFooter } from '@/components/public/LegalFooter';
import type { PublicSeoMetadata } from '@/lib/public-seo';
import { baseTheme, fonts } from '@/constants/theme';

interface PublicPageShellProps extends PropsWithChildren {
  eyebrow?: string;
  title: string;
  description: string;
  seo?: PublicSeoMetadata;
  actions?: { label: string; href: string; variant?: 'primary' | 'secondary' | 'ghost' }[];
}
export function PublicPageShell({ eyebrow, title, description, seo, actions, children }: PublicPageShellProps) {
  return <Screen hideWebHeader contentContainerStyle={styles.screen}>
    {seo ? <PublicSeoHead {...seo} /> : null}
    <AppNavigation />
    <View style={styles.hero}>
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
      <Text accessibilityRole="header" aria-level={1} style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      {actions?.length ? <View style={styles.actions}>{actions.map(action => <AppButton key={action.href} label={action.label}
        variant={action.variant ?? 'primary'} onPress={() => router.push(action.href as never)} />)}</View> : null}
    </View>
    {children}
    <LegalFooter />
  </Screen>;
}
const styles = StyleSheet.create({
  screen: { gap: 24, paddingTop: 12, paddingBottom: 32 },
  hero: { gap: 10, paddingVertical: 16 },
  eyebrow: { fontFamily: fonts.heading, fontSize: 11, letterSpacing: 1.5, fontWeight: '600', color: baseTheme.colors.action, textTransform: 'uppercase' },
  title: { fontFamily: fonts.heading, fontSize: baseTheme.typography.page, lineHeight: 34, fontWeight: '700', color: baseTheme.colors.text },
  description: { fontFamily: fonts.body, fontSize: baseTheme.typography.bodyLarge, lineHeight: 24, color: baseTheme.colors.textMuted, maxWidth: 720 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
});
