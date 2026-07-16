import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { AppButton } from '@/components/ui/AppButton';
import { MATCH_STATUS_LABELS } from '@/constants/options';
import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { formatDateBR } from '@/lib/date';
import { formatStatNumber } from '@/lib/stats';
import type { PlayerStatBreakdownMetric } from '@/lib/player-stat-breakdown';

export type BreakdownMetricKey = 'games' | 'goals' | 'assists';

const METRIC_TITLES: Record<BreakdownMetricKey, string> = {
  games: 'Jogos',
  goals: 'Gols',
  assists: 'Assistências',
};

const METRIC_UNITS: Record<BreakdownMetricKey, { singular: string; plural: string }> = {
  games: { singular: 'jogo', plural: 'jogos' },
  goals: { singular: 'gol', plural: 'gols' },
  assists: { singular: 'assistência', plural: 'assistências' },
};

interface PlayerStatBreakdownModalProps {
  visible: boolean;
  metricKey: BreakdownMetricKey | null;
  metric: PlayerStatBreakdownMetric | null;
  playerNickname: string;
  showAdminDetails: boolean;
  onClose: () => void;
}

function formatAmount(metricKey: BreakdownMetricKey, amount: number) {
  const units = METRIC_UNITS[metricKey];
  return `${formatStatNumber(amount, 0)} ${amount === 1 ? units.singular : units.plural}`;
}

export function PlayerStatBreakdownModal({
  visible,
  metricKey,
  metric,
  playerNickname,
  showAdminDetails,
  onClose,
}: PlayerStatBreakdownModalProps) {
  const theme = useAppTheme();

  if (!metricKey || !metric) {
    return null;
  }

  const title = METRIC_TITLES[metricKey];
  const hasManualAdjustment = metric.manualAdjustment !== 0;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={[styles.title, { color: theme.colors.text }]}>
                {title} de {playerNickname}
              </Text>
              <Text style={[styles.total, { color: theme.colors.secondary }]}>
                Total: {formatStatNumber(metric.total, 0)}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Fechar detalhamento"
              onPress={onClose}
              style={[styles.closeButton, { borderColor: theme.colors.border }]}>
              <Text style={[styles.closeButtonText, { color: theme.colors.text }]}>✕</Text>
            </Pressable>
          </View>

          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {metric.matches.length === 0 && !hasManualAdjustment ? (
              <Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>
                Nenhuma partida encerrada compõe este total ainda.
              </Text>
            ) : null}

            {metric.matches.map((item) => (
              <Pressable
                key={`${item.matchId}`}
                accessibilityRole="button"
                accessibilityLabel={`Abrir partida contra ${item.opponentName} em ${formatDateBR(item.date)}`}
                onPress={() => {
                  onClose();
                  router.push(`/matches/${item.matchId}` as never);
                }}
                style={({ pressed }) => [
                  styles.matchRow,
                  {
                    backgroundColor: theme.colors.background,
                    borderColor: pressed ? theme.colors.secondary : theme.colors.border,
                  },
                ]}>
                <View style={styles.matchCopy}>
                  <Text style={[styles.matchTitle, { color: theme.colors.text }]}>
                    {formatDateBR(item.date)} — {item.opponentName}
                  </Text>
                  <Text style={[styles.matchSub, { color: theme.colors.textMuted }]}>
                    {item.scoreboard
                      ? `Placar ${item.scoreboard.team} x ${item.scoreboard.opponent} · `
                      : ''}
                    {MATCH_STATUS_LABELS[item.matchStatus]}
                  </Text>
                </View>
                <Text style={[styles.matchAmount, { color: theme.colors.secondary }]}>
                  {formatAmount(metricKey, item.amount)}
                </Text>
              </Pressable>
            ))}

            {hasManualAdjustment ? (
              <View
                style={[
                  styles.matchRow,
                  {
                    backgroundColor: theme.colors.background,
                    borderColor: theme.colors.border,
                  },
                ]}>
                <View style={styles.matchCopy}>
                  <Text style={[styles.matchTitle, { color: theme.colors.text }]}>
                    Ajuste manual / histórico importado
                  </Text>
                  <Text style={[styles.matchSub, { color: theme.colors.textMuted }]}>
                    Registrado no cadastro do jogador, fora das partidas do app.
                  </Text>
                </View>
                <Text style={[styles.matchAmount, { color: theme.colors.secondary }]}>
                  {metric.manualAdjustment > 0 ? '+' : ''}
                  {formatStatNumber(metric.manualAdjustment, 0)}
                </Text>
              </View>
            ) : null}

            {showAdminDetails && hasManualAdjustment ? (
              <Text style={[styles.adminHint, { color: theme.colors.textMuted }]}>
                Total calculado das partidas: {formatStatNumber(metric.computedTotal, 0)} ·
                Ajuste manual: {metric.manualAdjustment > 0 ? '+' : ''}
                {formatStatNumber(metric.manualAdjustment, 0)}
              </Text>
            ) : null}
          </ScrollView>

          <AppButton label="Fechar" variant="secondary" onPress={onClose} fullWidth />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(10, 12, 16, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '85%',
    borderWidth: 1,
    borderRadius: 24,
    padding: 20,
    gap: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerCopy: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 20,
    fontWeight: '800',
  },
  total: {
    fontFamily: fonts.display,
    fontSize: 16,
    fontWeight: '900',
  },
  closeButton: {
    borderWidth: 1,
    borderRadius: 999,
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontFamily: fonts.heading,
    fontSize: 15,
    fontWeight: '800',
  },
  list: {
    flexGrow: 0,
  },
  listContent: {
    gap: 10,
  },
  emptyText: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    paddingVertical: 16,
  },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
  },
  matchCopy: {
    flex: 1,
    gap: 2,
  },
  matchTitle: {
    fontFamily: fonts.heading,
    fontSize: 14,
    fontWeight: '700',
  },
  matchSub: {
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 17,
  },
  matchAmount: {
    fontFamily: fonts.display,
    fontSize: 14,
    fontWeight: '900',
  },
  adminHint: {
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
    paddingTop: 4,
  },
});
