import { Redirect, router } from 'expo-router';
import { Image, StyleSheet, Text, View } from 'react-native';
import { LegalFooter } from '@/components/public/LegalFooter';
import { AppButton } from '@/components/ui/AppButton';
import { LoadingState } from '@/components/ui/LoadingState';
import { Screen } from '@/components/ui/Screen';
import { PublicSeoHead } from '@/components/seo/PublicSeoHead';
import { APP_NAME } from '@/constants/branding';
import { baseTheme, fonts } from '@/constants/theme';
import { useAppStore } from '@/store/app-store';
import { selectCurrentTeam, selectCurrentUser } from '@/store/selectors';

export default function IndexScreen() {
  const ready = useAppStore(state => state.ready);
  const user = useAppStore(selectCurrentUser);
  const team = useAppStore(selectCurrentTeam);
  if (ready && user) return <Redirect href={team ? '/home' : '/team-access'} />;
  return <Screen hideWebHeader contentContainerStyle={styles.screen}>
    <PublicSeoHead title="Professô FC | Gestão de times de futebol amador" description="Organize times, partidas e ferramentas para a sua rotina de futebol." canonicalPath="/" />
    {!ready ? <LoadingState /> : <View style={styles.entry}>
      <View style={styles.brand}><Image source={require('../../assets/images/favicon.png')} style={styles.symbol} /><Text style={styles.name}>{APP_NAME}</Text></View>
      <Text style={styles.eyebrow}>Futebol amador, em ordem</Text>
      <Text accessibilityRole="header" aria-level={1} style={styles.title}>Organize o futebol.{'\n'}Aproveite o jogo.</Text>
      <Text style={styles.description}>Times, partidas e ferramentas para a sua rotina de futebol.</Text>
      <View style={styles.actions}>
        <AppButton fullWidth size="lg" label="Criar conta" onPress={() => router.push('/register')} />
        <AppButton fullWidth size="lg" variant="secondary" label="Entrar" onPress={() => router.push('/login')} />
        <AppButton fullWidth size="lg" variant="ghost" label="Ver galeria" onPress={() => router.push('/teams-gallery')} />
      </View>
      <Text style={styles.note}>Uma conta para começar. Seu time quando precisar.</Text>
    </View>}
    <LegalFooter />
  </Screen>;
}
const styles = StyleSheet.create({
  screen: { flexGrow: 1, justifyContent: 'center', gap: 28, paddingBottom: 32, maxWidth: 660 },
  entry: { gap: 16, paddingVertical: 20 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  symbol: { width: 44, height: 44, borderRadius: 12 },
  name: { fontFamily: fonts.heading, fontWeight: '700', fontSize: 22, color: baseTheme.colors.text },
  eyebrow: { fontFamily: fonts.heading, fontWeight: '600', fontSize: 11, letterSpacing: 1.5, color: baseTheme.colors.action, textTransform: 'uppercase' },
  title: { fontFamily: fonts.heading, fontWeight: '700', fontSize: 32, lineHeight: 38, color: baseTheme.colors.text },
  description: { fontFamily: fonts.body, fontSize: 16, lineHeight: 24, color: baseTheme.colors.textMuted },
  actions: { gap: 12, marginTop: 12 },
  note: { fontFamily: fonts.body, fontSize: 13, lineHeight: 20, color: baseTheme.colors.textMuted },
});
