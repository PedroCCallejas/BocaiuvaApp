import type { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';
import { usePathname, router } from 'expo-router';
import { AppNavigation } from '@/components/navigation/AppNavigation';
import { LegalFooter } from '@/components/public/LegalFooter';
import { AppButton } from '@/components/ui/AppButton';
import { Screen } from '@/components/ui/Screen';
import { ToolSeoHead } from './ToolSeoHead';
import { NoIndexHead } from '@/components/seo/NoIndexHead';
import { ToolHero } from './ToolHero';

type ToolAction = { label: string; href: string; variant?: 'primary' | 'secondary' | 'ghost' };
interface ToolPageShellProps extends PropsWithChildren {
  title: string; subtitle: string; description?: string; actions?: ToolAction[];
  heroBadges?: string[]; eyebrow?: string; compactHero?: boolean; seoTitle?: string; seoDescription?: string;
}
export function ToolPageShell({ title, subtitle, description, children }: ToolPageShellProps) {
  const pathname = usePathname();
  return <Screen hideWebHeader contentContainerStyle={styles.screen}>
    <NoIndexHead />
    <ToolSeoHead title={`${title} | Professô FC`} description={description ?? subtitle} path={pathname} />
    <AppNavigation />
    {pathname !== '/ferramentas' ? <View style={styles.back}><AppButton size="sm" variant="ghost" label="← Ferramentas" onPress={() => router.push('/ferramentas')} /></View> : null}
    <ToolHero title={title} subtitle={subtitle} description={description} />
    {children}
    <LegalFooter />
  </Screen>;
}
const styles = StyleSheet.create({ screen: { gap: 20, paddingTop: 12, paddingBottom: 32 }, back: { alignItems: 'flex-start' } });
