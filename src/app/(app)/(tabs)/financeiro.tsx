import { useMemo, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Redirect, router } from 'expo-router';

import { MetricCard } from '@/components/cards/MetricCard';
import { DebtDashboard } from '@/components/finance/DebtDashboard';
import { ExpenseFormModal, type ExpenseFormValues } from '@/components/finance/ExpenseFormModal';
import { ExpenseList } from '@/components/finance/ExpenseList';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { MATCH_STATUS_LABELS } from '@/constants/options';
import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { formatDateBR } from '@/lib/date';
import {
  buildExpensesSummary,
  buildPlayerDebtReport,
  collectTeamExpenses,
} from '@/lib/expenses';
import {
  buildFinanceSummary,
  getAvailableFinanceYears,
  type FinanceMatchRow,
  type FinanceStatusFilter,
} from '@/lib/finance';
import {
  DEFAULT_MATCH_COST_CENTS,
  amountFromCents,
  formatCentsBRL,
  formatCentsForInput,
  parseCurrencyInputToCents,
} from '@/lib/money';
import { useAppStore } from '@/store/app-store';
import {
  selectCanManageTeam,
  selectCurrentTeam,
  selectTeamMatches,
  selectTeamPlayers,
} from '@/store/selectors';

const STATUS_FILTER_OPTIONS: Array<{ key: FinanceStatusFilter; label: string }> = [
  { key: 'all', label: 'Todas' },
  { key: 'finished', label: 'Encerradas' },
  { key: 'open', label: 'Abertas' },
  { key: 'canceled', label: 'Canceladas' },
];

type FinanceSection = 'cobranca' | 'despesas' | 'partidas';

const SECTION_OPTIONS: Array<{ key: FinanceSection; label: string }> = [
  { key: 'cobranca', label: 'Cobrança' },
  { key: 'despesas', label: 'Despesas' },
  { key: 'partidas', label: 'Partidas' },
];

const MONTH_LABELS = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
];

function FilterChip({
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
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.filterChip,
        {
          backgroundColor: selected ? theme.colors.secondarySoft : theme.colors.surface,
          borderColor: selected ? theme.colors.secondary : theme.colors.border,
        },
      ]}>
      <Text style={[styles.filterChipText, { color: theme.colors.text }]}>{label}</Text>
    </Pressable>
  );
}

export default function FinanceiroScreen() {
  const theme = useAppTheme();
  const team = useAppStore(selectCurrentTeam);
  const canManageTeam = useAppStore(selectCanManageTeam);
  const teamMatches = useAppStore(selectTeamMatches);
  const teamPlayers = useAppStore(selectTeamPlayers);
  const expenses = useAppStore((state) => state.snapshot.expenses);
  const attendance = useAppStore((state) => state.snapshot.attendance);
  const expenseCategories = useAppStore((state) => state.snapshot.expenseCategories);
  const createExpense = useAppStore((state) => state.createExpense);
  const updateExpense = useAppStore((state) => state.updateExpense);
  const deleteExpense = useAppStore((state) => state.deleteExpense);
  const setExpenseSettlement = useAppStore((state) => state.setExpenseSettlement);
  const createExpenseCategory = useAppStore((state) => state.createExpenseCategory);
  const updateMatchFieldCost = useAppStore((state) => state.updateMatchFieldCost);
  const setTeamDefaultMatchCost = useAppStore((state) => state.setTeamDefaultMatchCost);

  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<FinanceStatusFilter>('all');
  const [editingRow, setEditingRow] = useState<FinanceMatchRow | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editSplitCount, setEditSplitCount] = useState('');
  const [confirmFinishedEdit, setConfirmFinishedEdit] = useState(false);
  const [pendingClear, setPendingClear] = useState(false);
  const [savingCost, setSavingCost] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [defaultCostDraft, setDefaultCostDraft] = useState<string | null>(null);
  const [savingDefaultCost, setSavingDefaultCost] = useState(false);

  const availableYears = useMemo(
    () => (team ? getAvailableFinanceYears(teamMatches, team.id) : []),
    [team, teamMatches],
  );
  const summary = useMemo(
    () =>
      team
        ? buildFinanceSummary(teamMatches, team.id, {
            year: selectedYear,
            month: selectedYear != null ? selectedMonth : null,
            status: statusFilter,
          })
        : null,
    [team, teamMatches, selectedYear, selectedMonth, statusFilter],
  );

  // ── Despesas por categoria ──────────────────────────────────────────────
  const [activeSection, setActiveSection] = useState<FinanceSection>('cobranca');
  const [expenseModalVisible, setExpenseModalVisible] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [savingExpense, setSavingExpense] = useState(false);
  const [expenseError, setExpenseError] = useState<string | null>(null);

  const playerNames = useMemo(
    () =>
      Object.fromEntries(teamPlayers.map((player) => [player.id, player.nickname])) as Record<
        string,
        string
      >,
    [teamPlayers],
  );

  const matchLabels = useMemo(
    () =>
      Object.fromEntries(
        teamMatches.map((match) => [
          match.id,
          `${formatDateBR(match.date)} · ${match.opponentName}`,
        ]),
      ) as Record<string, string>,
    [teamMatches],
  );

  const categoryLabels = useMemo(
    () =>
      Object.fromEntries(
        expenseCategories.map((category) => [category.id, category.label]),
      ) as Record<string, string>,
    [expenseCategories],
  );

  const unifiedExpenses = useMemo(
    () =>
      team
        ? collectTeamExpenses({
            teamId: team.id,
            expenses,
            matches: teamMatches,
            attendance,
            players: teamPlayers,
            categoryLabels,
            filters: {
              year: selectedYear,
              month: selectedYear != null ? selectedMonth : null,
            },
          })
        : [],
    [attendance, categoryLabels, expenses, selectedMonth, selectedYear, team, teamMatches],
  );

  const expensesSummary = useMemo(
    () => buildExpensesSummary(unifiedExpenses),
    [unifiedExpenses],
  );

  const debtReport = useMemo(
    () => buildPlayerDebtReport(unifiedExpenses, { playerNames, matchLabels }),
    [matchLabels, playerNames, unifiedExpenses],
  );

  const editingExpense = editingExpenseId
    ? expenses.find((item) => item.id === editingExpenseId) ?? null
    : null;

  function openExpenseModal(expenseId: string | null) {
    setEditingExpenseId(expenseId);
    setExpenseError(null);
    setExpenseModalVisible(true);
  }

  async function handleSubmitExpense(values: ExpenseFormValues) {
    const totalAmountCents = parseCurrencyInputToCents(values.amountInput);

    if (totalAmountCents == null || totalAmountCents <= 0) {
      setExpenseError('Informe um valor maior que zero.');
      return;
    }

    try {
      setSavingExpense(true);
      setExpenseError(null);

      // Categoria nova digitada no formulário é criada antes da despesa,
      // para o admin não precisar cadastrar em duas etapas.
      let categoryId = values.categoryId;
      const newLabel = values.newCategoryLabel.trim();

      if (newLabel) {
        categoryId = await createExpenseCategory({ label: newLabel });
      }

      if (!categoryId) {
        setExpenseError('Escolha ou crie uma categoria.');
        return;
      }

      const payload = {
        categoryId,
        date: values.date.trim(),
        totalAmountCents,
        description: values.description.trim() || null,
        matchId: values.matchId,
        paidByPlayerId: values.paidByPlayerId,
        splitMode: values.splitMode,
        participantPlayerIds: values.participantPlayerIds,
        extraSharesCount: Number(values.extraSharesCount.replace(/[^\d]/g, '') || '0'),
      };

      if (editingExpenseId) {
        await updateExpense(editingExpenseId, payload);
      } else {
        await createExpense(payload);
      }

      setExpenseModalVisible(false);
      setEditingExpenseId(null);
    } catch (error) {
      setExpenseError(
        error instanceof Error ? error.message : 'Não foi possível salvar a despesa.',
      );
    } finally {
      setSavingExpense(false);
    }
  }

  function handleDeleteExpense(expenseId: string) {
    Alert.alert('Remover despesa', 'Essa despesa sai dos relatórios. Deseja continuar?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: () => {
          void deleteExpense(expenseId).catch((error: unknown) => {
            Alert.alert(
              'Não foi possível remover',
              error instanceof Error ? error.message : 'Tente novamente.',
            );
          });
        },
      },
    ]);
  }

  function handleToggleSettlement(expenseId: string, playerId: string, settled: boolean) {
    void setExpenseSettlement(expenseId, playerId, settled).catch((error: unknown) => {
      Alert.alert(
        'Não foi possível atualizar',
        error instanceof Error ? error.message : 'Tente novamente.',
      );
    });
  }

  if (!team) {
    return (
      <Screen>
        <EmptyState
          title="Financeiro indisponível"
          description="Somente administradores do time podem acessar o financeiro."
        />
      </Screen>
    );
  }

  if (!canManageTeam) {
    return <Redirect href="/home" />;
  }

  const currentDefaultCents = team.defaultMatchCostCents ?? null;
  const defaultCostInputValue =
    defaultCostDraft ??
    (currentDefaultCents != null ? formatCentsForInput(currentDefaultCents) : '');

  function openEditModal(row: FinanceMatchRow) {
    setEditingRow(row);
    setEditValue(
      row.costCents != null
        ? formatCentsForInput(row.costCents)
        : currentDefaultCents != null
          ? formatCentsForInput(currentDefaultCents)
          : '',
    );
    setEditSplitCount(String(row.splitCount ?? ''));
    setConfirmFinishedEdit(false);
    setPendingClear(false);
    setEditError(null);
  }

  function closeEditModal() {
    setEditingRow(null);
    setEditValue('');
    setEditSplitCount('');
    setConfirmFinishedEdit(false);
    setPendingClear(false);
    setEditError(null);
  }

  async function handleSaveCost(clear: boolean) {
    if (!editingRow || savingCost) {
      return;
    }

    if (editingRow.status === 'finished' && !confirmFinishedEdit) {
      setPendingClear(clear);
      setConfirmFinishedEdit(true);
      return;
    }

    let input: { totalAmount: number; splitCount: number; note?: string | null } | null =
      null;

    if (!clear) {
      const cents = parseCurrencyInputToCents(editValue);

      if (cents == null) {
        setEditError('Informe um valor válido, por exemplo 185,00.');
        return;
      }

      const splitCount = Number(editSplitCount.trim() || '0');

      if (!Number.isInteger(splitCount) || splitCount <= 0) {
        setEditError('Informe em quantas pessoas o valor será dividido.');
        return;
      }

      input = {
        totalAmount: amountFromCents(cents),
        splitCount,
        note: null,
      };
    }

    setSavingCost(true);
    setEditError(null);
    try {
      await updateMatchFieldCost(editingRow.matchId, input);
      closeEditModal();
    } catch (error) {
      setEditError(
        error instanceof Error ? error.message : 'Não foi possível salvar o valor.',
      );
    } finally {
      setSavingCost(false);
    }
  }

  const currentTeam = team;

  async function handleSaveDefaultCost() {
    if (savingDefaultCost) {
      return;
    }

    const trimmed = defaultCostInputValue.trim();
    const cents = trimmed ? parseCurrencyInputToCents(trimmed) : null;

    if (trimmed && cents == null) {
      Alert.alert('Valor inválido', 'Informe um valor válido, por exemplo 185,00.');
      return;
    }

    setSavingDefaultCost(true);
    try {
      await setTeamDefaultMatchCost(currentTeam.id, cents);
      setDefaultCostDraft(null);
    } catch (error) {
      Alert.alert(
        'Não foi possível salvar',
        error instanceof Error ? error.message : 'Tente novamente.',
      );
    } finally {
      setSavingDefaultCost(false);
    }
  }

  const availableMonths =
    selectedYear != null
      ? [
          ...new Set(
            teamMatches
              .filter((match) => match.date.startsWith(`${selectedYear}-`))
              .map((match) => Number(match.date.slice(5, 7))),
          ),
        ]
          .filter((month) => month >= 1 && month <= 12)
          .sort((left, right) => left - right)
      : [];

  return (
    <Screen>
      <View style={styles.hero}>
        <Text style={[styles.title, { color: theme.colors.text }]}>Financeiro</Text>
        <Text style={[styles.description, { color: theme.colors.textMuted }]}>
          Cobranças, despesas do time e o custo de cada partida em um lugar só.
        </Text>
      </View>

      <View style={styles.sectionTabs}>
        {SECTION_OPTIONS.map((option) => (
          <FilterChip
            key={option.key}
            label={option.label}
            selected={activeSection === option.key}
            onPress={() => setActiveSection(option.key)}
          />
        ))}
      </View>

      {activeSection === 'cobranca' ? (
        <DebtDashboard
          report={debtReport}
          pendingTotalCents={expensesSummary.pendingCents}
          onPressPlayer={(playerId) => router.push(`/players/${playerId}`)}
        />
      ) : null}

      {activeSection === 'despesas' ? (
        <View style={styles.expensesSection}>
          <SectionHeader
            title="Despesas do time"
            subtitle="Categoria livre, rateio manual e vínculo opcional com um jogo."
            actionLabel="Nova despesa"
            onAction={() => openExpenseModal(null)}
          />

          <View style={styles.metricsRow}>
            <MetricCard
              label="Total no período"
              value={formatCentsBRL(expensesSummary.totalCents)}
              helper={`${expensesSummary.expenseCount} lançamento(s)`}
            />
            <MetricCard
              label="Ainda pendente"
              value={formatCentsBRL(expensesSummary.pendingCents)}
              helper={`${formatCentsBRL(expensesSummary.settledCents)} já acertado`}
            />
          </View>

          {expensesSummary.byCategory.length > 0 ? (
            <View style={styles.categoryRow}>
              {expensesSummary.byCategory.map((entry) => (
                <View
                  key={entry.categoryId ?? entry.categoryLabel ?? 'sem-categoria'}
                  style={[
                    styles.categoryPill,
                    {
                      backgroundColor: theme.colors.surfaceMuted,
                      borderColor: theme.colors.border,
                    },
                  ]}>
                  <Text style={[styles.categoryLabel, { color: theme.colors.text }]}>
                    {entry.categoryLabel ?? 'Sem categoria'}
                  </Text>
                  <Text style={[styles.categoryValue, { color: theme.colors.textMuted }]}>
                    {formatCentsBRL(entry.totalCents)}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          <ExpenseList
            expenses={unifiedExpenses}
            playerNames={playerNames}
            matchLabels={matchLabels}
            onEdit={(expenseId) => openExpenseModal(expenseId)}
            onDelete={handleDeleteExpense}
            onToggleSettlement={handleToggleSettlement}
          />
        </View>
      ) : null}

      {activeSection !== 'partidas' ? null : (
      <>
      <View style={styles.metricsRow}>
        <MetricCard
          label="Partidas no período"
          value={String(summary?.totalMatches ?? 0)}
          helper={`${summary?.matchesWithCost ?? 0} com valor informado`}
        />
        <MetricCard
          label="Custo realizado"
          value={formatCentsBRL(summary?.realizedCostCents ?? 0)}
          helper="Partidas encerradas com valor"
        />
      </View>
      <View style={styles.metricsRow}>
        <MetricCard
          label="Custo previsto"
          value={formatCentsBRL(summary?.expectedCostCents ?? 0)}
          helper="Partidas ainda abertas com valor"
        />
        <MetricCard
          label="Valor médio"
          value={formatCentsBRL(summary?.averageCostCents ?? 0)}
          helper={
            summary && summary.matchesWithoutCost > 0
              ? `${summary.matchesWithoutCost} partida(s) sem valor`
              : 'Todas as partidas têm valor'
          }
        />
      </View>

      <View
        style={[
          styles.configCard,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
          },
        ]}>
        <SectionHeader
          title="Valor padrão da partida"
          subtitle={`Sugerido para novas partidas. Alterar o padrão não muda partidas antigas. Sugestão inicial: ${formatCentsBRL(DEFAULT_MATCH_COST_CENTS)}.`}
        />
        <View style={styles.configRow}>
          <View style={styles.configInput}>
            <AppInput
              label="Valor padrão"
              value={defaultCostInputValue}
              onChangeText={setDefaultCostDraft}
              placeholder={formatCentsForInput(DEFAULT_MATCH_COST_CENTS)}
              keyboardType="decimal-pad"
            />
          </View>
          <AppButton
            label="Salvar padrão"
            variant="secondary"
            onPress={() => void handleSaveDefaultCost()}
            loading={savingDefaultCost}
          />
        </View>
      </View>

      <SectionHeader title="Filtros" subtitle="Período e status da partida" />
      <View style={styles.filtersRow}>
        <FilterChip
          label="Geral"
          selected={selectedYear == null}
          onPress={() => {
            setSelectedYear(null);
            setSelectedMonth(null);
          }}
        />
        {availableYears.map((year) => (
          <FilterChip
            key={year}
            label={String(year)}
            selected={selectedYear === year}
            onPress={() => {
              setSelectedYear(year);
              setSelectedMonth(null);
            }}
          />
        ))}
      </View>
      {selectedYear != null && availableMonths.length > 0 ? (
        <View style={styles.filtersRow}>
          <FilterChip
            label="Ano todo"
            selected={selectedMonth == null}
            onPress={() => setSelectedMonth(null)}
          />
          {availableMonths.map((month) => (
            <FilterChip
              key={month}
              label={MONTH_LABELS[month - 1] ?? String(month)}
              selected={selectedMonth === month}
              onPress={() => setSelectedMonth(month)}
            />
          ))}
        </View>
      ) : null}
      <View style={styles.filtersRow}>
        {STATUS_FILTER_OPTIONS.map((option) => (
          <FilterChip
            key={option.key}
            label={option.label}
            selected={statusFilter === option.key}
            onPress={() => setStatusFilter(option.key)}
          />
        ))}
      </View>

      <SectionHeader
        title="Partidas"
        subtitle="Partidas canceladas ficam fora dos totais, mas mantêm o valor no histórico."
      />

      {summary && summary.rows.length === 0 ? (
        <EmptyState
          title="Nenhuma partida no período"
          description="Ajuste os filtros para ver outras partidas do time."
        />
      ) : null}

      {summary?.rows.map((row) => (
        <View
          key={row.matchId}
          style={[
            styles.matchRow,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}>
          <View style={styles.matchCopy}>
            <Text style={[styles.matchTitle, { color: theme.colors.text }]}>
              {formatDateBR(row.date)} — {row.opponentName}
            </Text>
            <Text style={[styles.matchSub, { color: theme.colors.textMuted }]}>
              {MATCH_STATUS_LABELS[row.status]}
              {row.status === 'canceled' && row.costCents != null
                ? ' · fora dos totais'
                : ''}
            </Text>
          </View>
          <View style={styles.matchValueColumn}>
            <Text
              style={[
                styles.matchValue,
                {
                  color:
                    row.costCents != null ? theme.colors.secondary : theme.colors.textMuted,
                },
              ]}>
              {row.costCents != null ? formatCentsBRL(row.costCents) : 'Valor não informado'}
            </Text>
            <AppButton
              label={row.costCents != null ? 'Editar' : 'Definir valor'}
              variant="secondary"
              onPress={() => openEditModal(row)}
            />
          </View>
        </View>
      ))}
      </>
      )}

      <ExpenseFormModal
        visible={expenseModalVisible}
        expense={editingExpense}
        categories={expenseCategories}
        players={teamPlayers}
        matches={teamMatches}
        saving={savingExpense}
        error={expenseError}
        onClose={() => {
          setExpenseModalVisible(false);
          setEditingExpenseId(null);
        }}
        onSubmit={(values) => void handleSubmitExpense(values)}
      />

      <Modal
        visible={editingRow !== null}
        animationType="fade"
        transparent
        onRequestClose={closeEditModal}>
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
              },
            ]}>
            <Text style={[styles.modalTitle, { color: theme.colors.text }]}>
              Valor da partida
            </Text>
            {editingRow ? (
              <Text style={[styles.modalSubtitle, { color: theme.colors.textMuted }]}>
                {formatDateBR(editingRow.date)} — {editingRow.opponentName} (
                {MATCH_STATUS_LABELS[editingRow.status]})
              </Text>
            ) : null}

            {confirmFinishedEdit ? (
              <>
                <Text style={[styles.modalWarning, { color: theme.colors.text }]}>
                  Esta partida já foi encerrada. Confirma a alteração do valor? Presença,
                  escalação e estatísticas não serão alteradas.
                </Text>
                <View style={styles.modalActions}>
                  <AppButton
                    label="Voltar"
                    variant="secondary"
                    onPress={() => setConfirmFinishedEdit(false)}
                  />
                  <AppButton
                    label={pendingClear ? 'Confirmar remoção' : 'Confirmar alteração'}
                    onPress={() => void handleSaveCost(pendingClear)}
                    loading={savingCost}
                  />
                </View>
              </>
            ) : (
              <>
                <AppInput
                  label="Valor total (R$)"
                  value={editValue}
                  onChangeText={setEditValue}
                  placeholder="185,00"
                  keyboardType="decimal-pad"
                />
                <AppInput
                  label="Dividir entre quantas pessoas"
                  value={editSplitCount}
                  onChangeText={(value) => setEditSplitCount(value.replace(/[^\d]/g, ''))}
                  placeholder="10"
                  keyboardType="number-pad"
                />
                {editError ? (
                  <Text style={[styles.modalError, { color: theme.colors.danger }]}>
                    {editError}
                  </Text>
                ) : null}
                <View style={styles.modalActions}>
                  <AppButton label="Cancelar" variant="secondary" onPress={closeEditModal} />
                  <AppButton
                    label="Salvar valor"
                    onPress={() => void handleSaveCost(false)}
                    loading={savingCost}
                  />
                </View>
                {editingRow?.costCents != null ? (
                  <AppButton
                    label="Remover valor da partida"
                    variant="danger"
                    onPress={() => void handleSaveCost(true)}
                    disabled={savingCost}
                    fullWidth
                  />
                ) : null}
              </>
            )}
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionTabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  expensesSection: {
    gap: 12,
  },
  categoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryPill: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 1,
  },
  categoryLabel: {
    fontFamily: fonts.heading,
    fontSize: 13,
    fontWeight: '700',
  },
  categoryValue: {
    fontFamily: fonts.body,
    fontSize: 11,
  },
  hero: {
    gap: 8,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 32,
    fontWeight: '900',
  },
  description: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 22,
  },
  metricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  configCard: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 16,
    gap: 14,
  },
  configRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
    flexWrap: 'wrap',
  },
  configInput: {
    flexGrow: 1,
    minWidth: 180,
  },
  filtersRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  filterChipText: {
    fontFamily: fonts.heading,
    fontSize: 13,
    fontWeight: '700',
  },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
  },
  matchCopy: {
    flex: 1,
    gap: 4,
  },
  matchTitle: {
    fontFamily: fonts.heading,
    fontSize: 15,
    fontWeight: '800',
  },
  matchSub: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
  },
  matchValueColumn: {
    alignItems: 'flex-end',
    gap: 8,
  },
  matchValue: {
    fontFamily: fonts.display,
    fontSize: 16,
    fontWeight: '900',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(10, 12, 16, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 480,
    borderWidth: 1,
    borderRadius: 24,
    padding: 20,
    gap: 14,
  },
  modalTitle: {
    fontFamily: fonts.heading,
    fontSize: 20,
    fontWeight: '800',
  },
  modalSubtitle: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
  },
  modalWarning: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 21,
  },
  modalError: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    flexWrap: 'wrap',
  },
});
