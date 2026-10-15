import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { baseTheme, fonts } from '@/constants/theme';

export function LegalFooter() {
  return <View style={styles.footer}>{[{ label: 'Privacidade', href: '/privacidade' }, { label: 'Termos', href: '/termos' }, { label: 'Suporte', href: '/suporte' }].map(item =>
    <Pressable key={item.href} accessibilityRole="link" accessibilityLabel={item.label} onPress={() => router.push(item.href as never)} style={styles.link}>
      <Text style={styles.label}>{item.label}</Text>
    </Pressable>)}
  </View>;
}
const styles = StyleSheet.create({
  footer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, paddingTop: 16, borderTopWidth: 1, borderTopColor: baseTheme.colors.border },
  link: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' },
  label: { fontFamily: fonts.body, fontSize: 13, color: baseTheme.colors.textMuted },
});
