import { Pressable, StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '@/components/ui/EmptyState';
import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { formatDateBR } from '@/lib/date';
import type { UnifiedExpense } from '@/lib/expenses';
import { formatCentsBRL } from '@/lib/money';

interface ExpenseListProps {
  expenses: UnifiedExpense[];
  playerNames: Record<string, string>;
  matchLabels: Record<string, string>;
  onEdit: (expenseId: string) => void;
  onDelete: (expenseId: string) => void;
  onToggleSettlement: (expenseId: string, playerId: string, settled: boolean) => void;
}

export function ExpenseList({
  expenses,
  playerNames,
  matchLabels,
  onEdit,
  onDelete,
  onToggleSettlement,
}: ExpenseListProps) {
  const theme = useAppTheme();

  if (expenses.length === 0) {
    return (
      <EmptyState
        title="Nenhuma despesa neste período"
        description="Lance a primeira despesa do time: bola, água, cerveja, campo — o que fizer sentido."
      />
    );
  }

  return (
    <View style={styles.list}>
      {expenses.map((expense) => {
        // O custo do campo vem do modelo antigo da partida e é editado lá,
        // não aqui — por isso a linha aparece sem as ações de edição.
        const isLegacyFieldCost = expense.source === 'field-cost';
        const participantIds = Object.keys(expense.sharesCents);

        return (
          <View
            key={expense.id}
            style={[
              styles.card,
              { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
            ]}>
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderCopy}>
                <Text style={[styles.cardTitle, { color: theme.colors.text }]}>
                  {expense.categoryLabel ?? 'Despesa'}
                </Text>
                <Text style={[styles.cardMeta, { color: theme.colors.textMuted }]}>
                  {formatDateBR(expense.date)}
                  {expense.matchId
                    ? ` · ${matchLabels[expense.matchId] ?? 'jogo vinculado'}`
                    : ' · sem jogo'}
                  {expense.description ? ` · ${expense.description}` : ''}
                </Text>
              </View>
              <Text style={[styles.cardAmount, { color: theme.colors.text }]}>
                {formatCentsBRL(expense.totalAmountCents)}
              </Text>
            </View>

            {participantIds.length > 0 ? (
              <View style={styles.participants}>
                {participantIds.map((playerId) => {
                  const settled = expense.settledPlayerIds.includes(playerId);

                  return (
                    <Pressable
                      key={`${expense.id}-${playerId}`}
                      disabled={isLegacyFieldCost}
                      onPress={() => onToggleSettlement(expense.id, playerId, !settled)}
                      accessibilityRole="button"
                      accessibilityState={{ checked: settled }}
                      accessibilityLabel={`${playerNames[playerId] ?? 'Jogador'} ${
                        settled ? 'já acertou' : 'ainda deve'
                      } ${formatCentsBRL(expense.sharesCents[playerId] ?? 0)}`}
                      style={[
                        styles.participantChip,
                        {
                          backgroundColor: settled
                            ? theme.colors.surfaceRaised
                            : theme.colors.surfaceMuted,
                          borderColor: settled ? theme.colors.success : theme.colors.border,
                          opacity: isLegacyFieldCost ? 0.75 : 1,
                        },
                      ]}>
                      <Text
                        style={[
                          styles.participantName,
                          { color: settled ? theme.colors.success : theme.colors.text },
                        ]}>
                        {settled ? '✓ ' : ''}
                        {playerNames[playerId] ?? 'Jogador'}
                      </Text>
                      <Text style={[styles.participantValue, { color: theme.colors.textMuted }]}>
                        {formatCentsBRL(expense.sharesCents[playerId] ?? 0)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <Text style={[styles.cardMeta, { color: theme.colors.textSubtle }]}>
                Sem participantes no rateio.
              </Text>
            )}

            {expense.extraSharesCents > 0 ? (
              <Text style={[styles.cardMeta, { color: theme.colors.textSubtle }]}>
                {expense.extraSharesCount} convidado(s) ·{' '}
                {formatCentsBRL(expense.extraSharesCents)}
              </Text>
            ) : null}

            {isLegacyFieldCost ? (
              <Text style={[styles.cardMeta, { color: theme.colors.textSubtle }]}>
                Custo do campo — editado na tela da partida.
              </Text>
            ) : (
              <View style={styles.cardActions}>
                <Pressable onPress={() => onEdit(expense.id)} accessibilityRole="button">
                  <Text style={[styles.cardAction, { color: theme.colors.action }]}>Editar</Text>
                </Pressable>
                <Pressable onPress={() => onDelete(expense.id)} accessibilityRole="button">
                  <Text style={[styles.cardAction, { color: theme.colors.danger }]}>Remover</Text>
                </Pressable>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 12,
  },
  card: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    gap: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  cardHeaderCopy: {
    flex: 1,
    gap: 2,
  },
  cardTitle: {
    fontFamily: fonts.heading,
    fontSize: 16,
    fontWeight: '800',
  },
  cardMeta: {
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 17,
  },
  cardAmount: {
    fontFamily: fonts.heading,
    fontSize: 16,
    fontWeight: '800',
  },
  participants: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  participantChip: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 7,
    gap: 1,
  },
  participantName: {
    fontFamily: fonts.heading,
    fontSize: 13,
    fontWeight: '700',
  },
  participantValue: {
    fontFamily: fonts.body,
    fontSize: 11,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 16,
  },
  cardAction: {
    fontFamily: fonts.heading,
    fontSize: 13,
    fontWeight: '700',
  },
});
