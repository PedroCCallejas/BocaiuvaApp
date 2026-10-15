import { StyleSheet, Text, View } from 'react-native';
import { AppButton } from '@/components/ui/AppButton';
import { baseTheme, fonts } from '@/constants/theme';

export function ErrorState({ onRetry }: { onRetry: () => void }) {
  return <View accessibilityRole="alert" style={styles.container}>
    <Text style={styles.title}>Não conseguimos carregar.</Text>
    <Text style={styles.description}>Verifique a conexão e tente novamente.</Text>
    <AppButton label="Tentar novamente" onPress={onRetry} />
  </View>;
}
const styles = StyleSheet.create({
  container: { padding: 24, gap: 16, borderRadius: baseTheme.radius.md, backgroundColor: baseTheme.colors.surface, alignItems: 'center' },
  title: { color: baseTheme.colors.text, fontFamily: fonts.heading, fontSize: 20, fontWeight: '600', textAlign: 'center' },
  description: { color: baseTheme.colors.textMuted, fontFamily: fonts.body, fontSize: 15, textAlign: 'center' },
});
