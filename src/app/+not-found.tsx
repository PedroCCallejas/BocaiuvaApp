import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { NoIndexHead } from '@/components/seo/NoIndexHead';
import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';

export default function NotFoundScreen() {
  const theme = useAppTheme();
  return (
    <>
      <NoIndexHead />
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <Text style={[styles.title, { color: theme.colors.text }]}>Página não encontrada</Text>
        <Text style={[styles.description, { color: theme.colors.textMuted }]}>O endereço informado não existe ou não está mais disponível.</Text>
        <Link href="/" style={[styles.link, { color: theme.colors.secondary }]}>Voltar ao início</Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  title: { fontFamily: fonts.display, fontSize: 32, fontWeight: '900', textAlign: 'center' },
  description: { fontFamily: fonts.body, fontSize: 16, lineHeight: 24, textAlign: 'center' },
  link: { fontFamily: fonts.heading, fontSize: 16, fontWeight: '800', marginTop: 8 },
});
