import { Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { AppButton } from '@/components/ui/AppButton';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { useTeamCash } from '@/hooks/use-team-cash';
import { useAppTheme } from '@/hooks/use-app-theme';
import { cashTotal } from '@/lib/team-cash';
import { formatCentsBRL } from '@/lib/money';

export function TeamCashCard({ teamId, userId }: { teamId: string; userId: string }) {
  const theme = useAppTheme();
  const { entries, loading, error, reload } = useTeamCash(teamId, userId);
  useFocusEffect(useCallback(() => { void reload(); }, [reload]));
  return <View style={{ gap: 12, padding: 20, borderRadius: 20, backgroundColor: theme.colors.surface }}>
    <SectionHeader title="Caixa do time" subtitle="Arrecadações semanais registradas pelo administrador" />
    <Text accessibilityLiveRegion="polite" style={{ color: theme.colors.text, fontSize: 28, fontWeight: '800' }}>
      {loading ? 'Carregando…' : error ? 'Caixa indisponível' : formatCentsBRL(cashTotal(entries))}
    </Text>
    {error ? <Text style={{ color: theme.colors.textMuted }}>{error}</Text> : null}
    <AppButton label="Ver caixa" variant="secondary" onPress={() => router.push('/caixa' as never)} />
  </View>;
}
