import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, usePathname, useLocalSearchParams } from 'expo-router';
import { getSafeReturnPath } from '@/lib/navigation';
import { APP_NAME } from '@/constants/branding';
import { baseTheme, fonts } from '@/constants/theme';
import { useAppStore } from '@/store/app-store';
import { selectCurrentUser } from '@/store/selectors';

export function AppNavigation({ publicOnly = false }: { publicOnly?: boolean }) {
  const pathname = usePathname();
  const { next } = useLocalSearchParams<{ next?: string | string[] }>();
  const returnPath = getSafeReturnPath(next);
  const user = useAppStore(selectCurrentUser);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const signedIn = mounted && Boolean(user) && !publicOnly;
  const items = signedIn ? [
    { label: 'Início', href: '/' }, { label: 'Ferramentas', href: '/ferramentas' },
    { label: 'Meus times', href: '/team-access' }, { label: 'Conta', href: '/account' },
  ] : [{ label: 'Criar conta', href: '/register' }, { label: 'Entrar', href: '/login' }, { label: 'Galeria', href: '/teams-gallery' }];
  return <View style={styles.nav}>
    <Pressable accessibilityRole="link" accessibilityLabel={`${APP_NAME}, voltar ao início`} onPress={() => router.push('/')} style={styles.brand}>
      <Image source={require('../../../assets/images/favicon.png')} style={styles.symbol} />
      <Text style={styles.name}>{APP_NAME}</Text>
    </Pressable>
    <View style={styles.links}>{items.map(item => {
      const active = mounted && (item.href === '/' ? pathname === '/' || pathname === '/home' : pathname.startsWith(item.href));
      return <Pressable key={item.href} accessibilityRole="link" accessibilityLabel={item.label} accessibilityState={{ selected: active }}
        onPress={() => router.push(!signedIn && ['/login', '/register'].includes(item.href) && returnPath !== '/' ? { pathname: item.href as '/login' | '/register', params: { next: returnPath } } : item.href as never)} style={({ pressed }) => [styles.link, active && styles.active, pressed && styles.pressed]}>
        <Text style={[styles.label, active && styles.activeLabel]}>{item.label}</Text>
      </Pressable>;
    })}</View>
  </View>;
}
const styles = StyleSheet.create({
  nav: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: baseTheme.colors.border },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  symbol: { width: 32, height: 32, borderRadius: 8 },
  name: { fontFamily: fonts.heading, fontSize: 18, fontWeight: '700', color: baseTheme.colors.text },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  link: { minHeight: 44, paddingHorizontal: 12, paddingVertical: 12, borderRadius: 8, justifyContent: 'center' },
  active: { backgroundColor: baseTheme.colors.actionSoft },
  label: { fontFamily: fonts.heading, fontSize: 13, fontWeight: '500', color: baseTheme.colors.textMuted },
  activeLabel: { color: baseTheme.colors.action, fontWeight: '600' },
  pressed: { opacity: 0.8 },
});
