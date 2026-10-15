import { StyleSheet, Text, View } from 'react-native';
import { baseTheme, fonts } from '@/constants/theme';
import { router } from 'expo-router';
import { AppButton } from '@/components/ui/AppButton';

interface ToolHeroProps {
  eyebrow?: string; title: string; subtitle?: string; description?: string;
  badges?: string[]; actions?: { label: string; href: string; variant?: 'primary' | 'secondary' | 'ghost' }[]; hideSideCard?: boolean;
}
export function ToolHero({ title, subtitle, description, actions = [] }: ToolHeroProps) {
  return <View style={styles.header}>
    <Text accessibilityRole="header" aria-level={1} style={styles.title}>{title}</Text>
    <Text style={styles.description}>{description ?? subtitle}</Text>
    {actions.length ? <View style={styles.actions}>{actions.map(action => <AppButton key={action.href} label={action.label}
      variant={action.variant ?? 'primary'} onPress={() => router.push(action.href as never)} />)}</View> : null}
  </View>;
}
const styles = StyleSheet.create({
  header: { gap: 8 },
  title: { fontFamily: fonts.heading, fontSize: 28, lineHeight: 34, fontWeight: '700', color: baseTheme.colors.text },
  description: { fontFamily: fonts.body, fontSize: 16, lineHeight: 24, color: baseTheme.colors.textMuted },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
