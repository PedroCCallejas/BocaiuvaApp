import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { formatDateBR } from '@/lib/date';
import { calculateExpenseShares } from '@/lib/expenses';
import { formatCentsBRL, formatCentsForInput, parseCurrencyInputToCents } from '@/lib/money';
import type { Expense, ExpenseCategory, ExpenseSplitMode, Match, Player } from '@/types/domain';

export interface ExpenseFormValues {
  categoryId: string;
  newCategoryLabel: string;
  date: string;
  amountInput: string;
  description: string;
  matchId: string | null;
  paidByPlayerId: string | null;
  splitMode: ExpenseSplitMode;
  participantPlayerIds: string[];
  extraSharesCount: string;
}

interface ExpenseFormModalProps {
  visible: boolean;
  expense: Expense | null;
  categories: ExpenseCategory[];
  players: Player[];
  matches: Match[];
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (values: ExpenseFormValues) => void;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useAppTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? theme.colors.action : theme.colors.surfaceMuted,
          borderColor: selected ? theme.colors.action : theme.colors.border,
        },
      ]}>
      <Text
        style={[
          styles.chipLabel,
          { color: selected ? theme.colors.actionText : theme.colors.textMuted },
        ]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function ExpenseFormModal({
  visible,
  expense,
  categories,
  players,
  matches,
  saving,
  error,
  onClose,
  onSubmit,
}: ExpenseFormModalProps) {
  const theme = useAppTheme();

  const [categoryId, setCategoryId] = useState('');
  const [newCategoryLabel, setNewCategoryLabel] = useState('');
  const [date, setDate] = useState(todayIso());
  const [amountInput, setAmountInput] = useState('');
  const [description, setDescription] = useState('');
  const [linkToMatch, setLinkToMatch] = useState(false);
  const [matchId, setMatchId] = useState<string | null>(null);
  const [paidByPlayerId, setPaidByPlayerId] = useState<string | null>(null);
  const [splitMode, setSplitMode] = useState<ExpenseSplitMode>('equal');
  const [participantPlayerIds, setParticipantPlayerIds] = useState<string[]>([]);
  const [extraSharesCount, setExtraSharesCount] = useState('0');

  // Reabrir o modal precisa refletir a despesa escolhida, não o rascunho anterior.
  useEffect(() => {
    if (!visible) {
      return;
    }

    setCategoryId(expense?.categoryId ?? categories[0]?.id ?? '');
    setNewCategoryLabel('');
    setDate(expense?.date ?? todayIso());
    setAmountInput(expense ? formatCentsForInput(expense.totalAmountCents) : '');
    setDescription(expense?.description ?? '');
    setLinkToMatch(Boolean(expense?.matchId));
    setMatchId(expense?.matchId ?? null);
    setPaidByPlayerId(expense?.paidByPlayerId ?? null);
    setSplitMode(expense?.splitMode ?? 'equal');
    setParticipantPlayerIds(expense?.participantPlayerIds ?? []);
    setExtraSharesCount(String(expense?.extraSharesCount ?? 0));
  }, [visible, expense, categories]);

  const totalCents = parseCurrencyInputToCents(amountInput) ?? 0;
  const extraShares = Number(extraSharesCount.replace(/[^\d]/g, '') || '0');

  const preview = useMemo(
    () =>
      calculateExpenseShares({
        totalAmountCents: totalCents,
        splitMode: 'equal',
        participantPlayerIds,
        extraSharesCount: extraShares,
      }),
    [extraShares, participantPlayerIds, totalCents],
  );

  const perPersonCents = participantPlayerIds.length > 0
    ? preview.sharesCents[participantPlayerIds[0] as string] ?? 0
    : 0;

  const selectedMatch = matchId ? matches.find((item) => item.id === matchId) ?? null : null;

  function toggleParticipant(playerId: string) {
    setParticipantPlayerIds((current) =>
      current.includes(playerId)
        ? current.filter((item) => item !== playerId)
        : [...current, playerId],
    );
  }

  function useMatchAttendees(attendeePlayerIds: string[]) {
    setParticipantPlayerIds([...new Set(attendeePlayerIds)]);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.backdrop, { backgroundColor: theme.colors.scrim }]}>
        <View
          style={[
            styles.sheet,
            { backgroundColor: theme.colors.backgroundElevated, borderColor: theme.colors.border },
          ]}>
          <ScrollView contentContainerStyle={styles.sheetContent}>
            <SectionHeader
              title={expense ? 'Editar despesa' : 'Nova despesa'}
              subtitle="A despesa nasce solta. Vincule a um jogo só se quiser."
            />

            <Text style={[styles.fieldLabel, { color: theme.colors.textMuted }]}>Categoria</Text>
            <View style={styles.chipRow}>
              {categories
                .filter((category) => !category.archivedAt)
                .map((category) => (
                  <Chip
                    key={category.id}
                    label={category.label}
                    selected={categoryId === category.id && !newCategoryLabel}
                    onPress={() => {
                      setCategoryId(category.id);
                      setNewCategoryLabel('');
                    }}
                  />
                ))}
            </View>
            <AppInput
              label="Ou crie uma categoria nova"
              value={newCategoryLabel}
              onChangeText={setNewCategoryLabel}
              placeholder="Cerveja, bola, churrasco..."
            />

            <AppInput
              label="Valor"
              value={amountInput}
              onChangeText={setAmountInput}
              placeholder="0,00"
              keyboardType="decimal-pad"
            />

            <AppInput
              label="Data (AAAA-MM-DD)"
              value={date}
              onChangeText={setDate}
              placeholder={todayIso()}
            />

            <AppInput
              label="Descrição (opcional)"
              value={description}
              onChangeText={setDescription}
              placeholder="Detalhe que ajude a lembrar depois"
            />

            <View style={styles.switchRow}>
              <Chip
                label={linkToMatch ? 'Vinculada a um jogo' : 'Sem jogo vinculado'}
                selected={linkToMatch}
                onPress={() => {
                  setLinkToMatch((current) => !current);
                  setMatchId(null);
                }}
              />
            </View>

            {linkToMatch ? (
              <>
                <Text style={[styles.fieldLabel, { color: theme.colors.textMuted }]}>
                  Escolha o jogo
                </Text>
                <View style={styles.chipRow}>
                  {matches.slice(0, 12).map((match) => (
                    <Chip
                      key={match.id}
                      label={`${formatDateBR(match.date)} · ${match.opponentName}`}
                      selected={matchId === match.id}
                      onPress={() => setMatchId(match.id)}
                    />
                  ))}
                </View>
              </>
            ) : null}

            <Text style={[styles.fieldLabel, { color: theme.colors.textMuted }]}>
              Quem participa do rateio
            </Text>
            <Text style={[styles.fieldHelper, { color: theme.colors.textSubtle }]}>
              Marque quem consumiu. Não precisa ser quem jogou.
            </Text>
            <View style={styles.chipRow}>
              {players.map((player) => (
                <Chip
                  key={player.id}
                  label={player.nickname}
                  selected={participantPlayerIds.includes(player.id)}
                  onPress={() => toggleParticipant(player.id)}
                />
              ))}
            </View>

            <View style={styles.chipRow}>
              <Chip
                label="Marcar todos"
                selected={false}
                onPress={() => useMatchAttendees(players.map((player) => player.id))}
              />
              <Chip
                label="Limpar"
                selected={false}
                onPress={() => setParticipantPlayerIds([])}
              />
            </View>

            <AppInput
              label="Convidados sem cadastro"
              value={extraSharesCount}
              onChangeText={(value) => setExtraSharesCount(value.replace(/[^\d]/g, ''))}
              placeholder="0"
              keyboardType="number-pad"
            />

            <Text style={[styles.fieldLabel, { color: theme.colors.textMuted }]}>
              Quem pagou (opcional)
            </Text>
            <View style={styles.chipRow}>
              {players.map((player) => (
                <Chip
                  key={`payer-${player.id}`}
                  label={player.nickname}
                  selected={paidByPlayerId === player.id}
                  onPress={() =>
                    setPaidByPlayerId((current) => (current === player.id ? null : player.id))
                  }
                />
              ))}
            </View>

            {totalCents > 0 && participantPlayerIds.length + extraShares > 0 ? (
              <View
                style={[
                  styles.previewCard,
                  {
                    backgroundColor: theme.colors.surfaceMuted,
                    borderColor: theme.colors.borderStrong,
                  },
                ]}>
                <Text style={[styles.previewLabel, { color: theme.colors.textMuted }]}>
                  Prévia do rateio
                </Text>
                <Text style={[styles.previewValue, { color: theme.colors.text }]}>
                  {formatCentsBRL(perPersonCents)} por pessoa
                </Text>
                <Text style={[styles.fieldHelper, { color: theme.colors.textSubtle }]}>
                  {participantPlayerIds.length} jogador(es)
                  {extraShares > 0 ? ` + ${extraShares} convidado(s)` : ''} ·{' '}
                  {formatCentsBRL(totalCents)} no total
                  {selectedMatch ? ` · ${selectedMatch.opponentName}` : ''}
                </Text>
              </View>
            ) : null}

            {error ? (
              <Text style={[styles.error, { color: theme.colors.danger }]}>{error}</Text>
            ) : null}

            <View style={styles.actions}>
              <AppButton label="Cancelar" variant="secondary" onPress={onClose} />
              <AppButton
                label={expense ? 'Salvar despesa' : 'Adicionar despesa'}
                loading={saving}
                onPress={() =>
                  onSubmit({
                    categoryId,
                    newCategoryLabel,
                    date,
                    amountInput,
                    description,
                    matchId: linkToMatch ? matchId : null,
                    paidByPlayerId,
                    splitMode,
                    participantPlayerIds,
                    extraSharesCount,
                  })
                }
              />
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '92%',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderWidth: 1,
  },
  sheetContent: {
    padding: 20,
    gap: 14,
    paddingBottom: 40,
  },
  fieldLabel: {
    fontFamily: fonts.heading,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  fieldHelper: {
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 17,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipLabel: {
    fontFamily: fonts.heading,
    fontSize: 13,
    fontWeight: '700',
  },
  switchRow: {
    flexDirection: 'row',
    gap: 8,
  },
  previewCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 3,
  },
  previewLabel: {
    fontFamily: fonts.heading,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  previewValue: {
    fontFamily: fonts.heading,
    fontSize: 20,
    fontWeight: '800',
  },
  error: {
    fontFamily: fonts.body,
    fontSize: 13,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'flex-end',
    paddingTop: 4,
  },
});
