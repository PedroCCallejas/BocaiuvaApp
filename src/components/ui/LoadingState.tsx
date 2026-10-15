import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { baseTheme, fonts } from '@/constants/theme';

export function LoadingState({ title = 'Carregando seu espaço…', description = 'Preparando sua sessão.' }: { title?: string; description?: string }) {
  return <View accessibilityRole="progressbar" accessibilityLabel={title} accessibilityState={{ busy: true }} style={styles.container}>
    <ActivityIndicator size="large" color={baseTheme.colors.action} />
    <Text style={styles.title}>{title}</Text>
    <Text style={styles.description}>{description}</Text>
  </View>;
}
const styles = StyleSheet.create({
  container: { padding: 28, gap: 12, alignItems: 'center', justifyContent: 'center' },
  title: { color: baseTheme.colors.text, fontFamily: fonts.heading, fontSize: 20, fontWeight: '600', textAlign: 'center' },
  description: { color: baseTheme.colors.textMuted, fontFamily: fonts.body, fontSize: 15, textAlign: 'center' },
});
