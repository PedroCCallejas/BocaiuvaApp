import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { MetricCard } from '@/components/cards/MetricCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { formatDateBR } from '@/lib/date';
import type { PlayerDebtReport, PlayerDebtReportRow } from '@/lib/expenses';
import { formatCentsBRL } from '@/lib/money';

interface DebtDashboardProps {
  report: PlayerDebtReport;
  pendingTotalCents: number;
  onPressPlayer?: (playerId: string) => void;
}

function DebtRow({
  row,
  expanded,
  onToggle,
  onPressPlayer,
}: {
  row: PlayerDebtReportRow;
  expanded: boolean;
  onToggle: () => void;
  onPressPlayer?: (playerId: string) => void;
}) {
  const theme = useAppTheme();

  return (
    <View
      style={[
        styles.debtCard,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
      ]}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={`${row.playerName} deve ${formatCentsBRL(row.totalOwedCents)}. Toque para ver o detalhe.`}
        style={styles.debtHeader}>
        <View style={styles.debtHeaderCopy}>
          <Text style={[styles.playerName, { color: theme.colors.text }]}>{row.playerName}</Text>
          <Text style={[styles.debtHelper, { color: theme.colors.textMuted }]}>
            {row.pendingItems.length} pendência(s)
            {row.paidForGroupCents > 0
              ? ` · adiantou ${formatCentsBRL(row.paidForGroupCents)}`
              : ''}
          </Text>
        </View>
        <View style={styles.debtHeaderValue}>
          <Text style={[styles.debtAmount, { color: theme.colors.danger }]}>
            {formatCentsBRL(row.totalOwedCents)}
          </Text>
          <Text style={[styles.debtToggle, { color: theme.colors.textMuted }]}>
            {expanded ? 'ocultar' : 'ver detalhe'}
          </Text>
        </View>
      </Pressable>

      {expanded ? (
        <View style={[styles.debtDetail, { borderTopColor: theme.colors.border }]}>
          {row.pendingItems.map((item) => (
            <View key={`${row.playerId}-${item.expenseId}`} style={styles.debtItem}>
              <View style={styles.debtItemCopy}>
                <Text style={[styles.debtItemTitle, { color: theme.colors.text }]}>
                  {item.categoryLabel ?? 'Despesa'}
                  {item.description ? ` · ${item.description}` : ''}
                </Text>
                <Text style={[styles.debtItemMeta, { color: theme.colors.textMuted }]}>
                  {formatDateBR(item.date)}
                  {item.matchLabel ? ` · ${item.matchLabel}` : ' · sem jogo vinculado'}
                </Text>
              </View>
              <Text style={[styles.debtItemValue, { color: theme.colors.text }]}>
                {formatCentsBRL(item.shareCents)}
              </Text>
            </View>
          ))}

          {row.netCents > 0 ? (
            <Text style={[styles.debtItemMeta, { color: theme.colors.success }]}>
              Considerando o que adiantou, o time deve {formatCentsBRL(row.netCents)} a ele.
            </Text>
          ) : null}

          {onPressPlayer ? (
            <Pressable
              onPress={() => onPressPlayer(row.playerId)}
              accessibilityRole="button"
              style={styles.debtLink}>
              <Text style={[styles.debtLinkText, { color: theme.colors.action }]}>
                Abrir ficha do jogador
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/**
 * Painel de cobrança do admin: quem está devendo, quanto, e em quais
 * despesas e jogos. O detalhe fica recolhido por padrão — a pergunta
 * mais frequente é "quem devo cobrar", não "por quê".
 */
export function DebtDashboard({
  report,
  pendingTotalCents,
  onPressPlayer,
}: DebtDashboardProps) {
  const theme = useAppTheme();
  const [expandedPlayerId, setExpandedPlayerId] = useState<string | null>(null);

  const topDebtor = report.rows[0] ?? null;

  return (
    <View style={styles.container}>
      <SectionHeader
        title="Quem está devendo"
        subtitle="Pendências por jogador, com a despesa e o jogo de origem."
      />

      <View style={styles.metricsRow}>
        <MetricCard
          label="Total a receber"
          value={formatCentsBRL(report.totalOwedCents)}
          helper={`${report.playersInDebtCount} jogador(es) com pendência`}
        />
        <MetricCard
          label="Pendente no período"
          value={formatCentsBRL(pendingTotalCents)}
          helper="Inclui cotas de convidados"
        />
      </View>

      {topDebtor ? (
        <View
          style={[
            styles.highlight,
            {
              backgroundColor: theme.colors.surfaceMuted,
              borderColor: theme.colors.borderStrong,
            },
          ]}>
          <Text style={[styles.highlightLabel, { color: theme.colors.textMuted }]}>
            Maior pendência
          </Text>
          <Text style={[styles.highlightValue, { color: theme.colors.text }]}>
            {topDebtor.playerName} · {formatCentsBRL(topDebtor.totalOwedCents)}
          </Text>
        </View>
      ) : null}

      {report.rows.length === 0 ? (
        <EmptyState
          title="Ninguém devendo por aqui"
          description="Quando alguém tiver cota pendente em alguma despesa, o nome aparece nesta lista."
        />
      ) : (
        report.rows.map((row) => (
          <DebtRow
            key={row.playerId}
            row={row}
            expanded={expandedPlayerId === row.playerId}
            onToggle={() =>
              setExpandedPlayerId((current) => (current === row.playerId ? null : row.playerId))
            }
            onPressPlayer={onPressPlayer}
          />
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  highlight: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 2,
  },
  highlightLabel: {
    fontFamily: fonts.heading,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  highlightValue: {
    fontFamily: fonts.heading,
    fontSize: 17,
    fontWeight: '800',
  },
  debtCard: {
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  debtHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  debtHeaderCopy: {
    flex: 1,
    gap: 2,
  },
  debtHeaderValue: {
    alignItems: 'flex-end',
    gap: 2,
  },
  playerName: {
    fontFamily: fonts.heading,
    fontSize: 15,
    fontWeight: '800',
  },
  debtHelper: {
    fontFamily: fonts.body,
    fontSize: 12,
  },
  debtAmount: {
    fontFamily: fonts.heading,
    fontSize: 16,
    fontWeight: '800',
  },
  debtToggle: {
    fontFamily: fonts.body,
    fontSize: 11,
  },
  debtDetail: {
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  debtItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  debtItemCopy: {
    flex: 1,
    gap: 2,
  },
  debtItemTitle: {
    fontFamily: fonts.heading,
    fontSize: 14,
    fontWeight: '700',
  },
  debtItemMeta: {
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 17,
  },
  debtItemValue: {
    fontFamily: fonts.heading,
    fontSize: 14,
    fontWeight: '800',
  },
  debtLink: {
    paddingTop: 2,
  },
  debtLinkText: {
    fontFamily: fonts.heading,
    fontSize: 13,
    fontWeight: '700',
  },
});
