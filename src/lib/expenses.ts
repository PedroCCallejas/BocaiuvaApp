/**
 * Cálculo puro de despesas do time: rateio, saldo por jogador e resumo.
 *
 * Nada aqui toca banco, store ou React — só entra dado e sai número.
 * Todo valor trafega em **centavos**; a conversão para reais fica em
 * `src/lib/money.ts` e acontece apenas na borda da tela.
 *
 * ## Convivência com o custo do campo
 *
 * O custo do campo já existia dentro da partida (`match.fieldCost` /
 * `match.fieldPayment`) e é usado em dezenas de pontos do app. Em vez de
 * migrar aquele modelo, esta camada o **adapta** para o formato unificado
 * (`UnifiedExpense`). O resto do app passa a ler somente daqui, então uma
 * eventual migração futura muda apenas o adaptador, não as telas.
 */

import type { Expense, Match } from '@/types/domain';

import { centsFromAmount } from '@/lib/money';

/** Origem de uma despesa no formato unificado. */
export type UnifiedExpenseSource = 'field-cost' | 'expense';

/** Uma despesa já normalizada, venha ela do custo do campo ou da coleção nova. */
export interface UnifiedExpense {
  id: string;
  source: UnifiedExpenseSource;
  teamId: string;
  categoryId: string | null;
  categoryLabel: string | null;
  matchId: string | null;
  description: string | null;
  date: string;
  totalAmountCents: number;
  paidByPlayerId: string | null;
  participantPlayerIds: string[];
  extraSharesCount: number;
  settledPlayerIds: string[];
  sharesCents: Record<string, number>;
  /** Parte que cabe a convidados sem cadastro, somada. */
  extraSharesCents: number;
}

export interface ExpenseShareResult {
  /** Quanto cabe a cada participante identificado. */
  sharesCents: Record<string, number>;
  /** Soma das cotas de convidados sem cadastro. */
  extraSharesCents: number;
  /** Soma de tudo — sempre igual ao total da despesa. */
  distributedCents: number;
}

export interface PlayerBalance {
  playerId: string;
  /** Total que cabe ao jogador em despesas ainda não acertadas. */
  owedCents: number;
  /** Total que ele já acertou. */
  settledCents: number;
  /** Total que ele adiantou pagando despesas do grupo. */
  paidForGroupCents: number;
  /** `paidForGroupCents - owedCents`: positivo = tem a receber. */
  netCents: number;
  expenseIds: string[];
}

export interface ExpensesSummary {
  totalCents: number;
  settledCents: number;
  pendingCents: number;
  expenseCount: number;
  byCategory: Array<{
    categoryId: string | null;
    categoryLabel: string | null;
    totalCents: number;
    expenseCount: number;
  }>;
  balances: PlayerBalance[];
}

export interface ExpenseFilters {
  year?: number | null;
  month?: number | null;
  categoryId?: string | null;
  matchId?: string | null;
  /** `true` só vinculadas a partida, `false` só avulsas, undefined para todas. */
  linkedToMatch?: boolean;
}

const FIELD_COST_CATEGORY_LABEL = 'Campo';

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value >= 0;
}

function sanitizeParticipants(participantPlayerIds: string[]): string[] {
  // Ids repetidos inflariam o número de cotas e o total nunca fecharia.
  return [...new Set(participantPlayerIds.filter((id) => typeof id === 'string' && id.length > 0))];
}

/**
 * Divide `totalCents` igualmente entre as cotas, distribuindo a sobra de
 * centavos uma a uma para os primeiros participantes. A soma das partes é
 * sempre exatamente o total — nunca falta nem sobra um centavo.
 *
 * Exemplo: 100 centavos entre 3 pessoas → 34, 33, 33.
 */
export function splitEqualCents(totalCents: number, shareCount: number): number[] {
  if (!isPositiveInteger(totalCents) || !isPositiveInteger(shareCount) || shareCount === 0) {
    return [];
  }

  const base = Math.floor(totalCents / shareCount);
  const remainder = totalCents - base * shareCount;

  return Array.from({ length: shareCount }, (_, index) => (index < remainder ? base + 1 : base));
}

/**
 * Calcula quanto cabe a cada participante de uma despesa.
 *
 * No modo `manual`, os valores informados são respeitados e qualquer
 * diferença para o total é absorvida pelo primeiro participante — assim a
 * soma continua fechando mesmo com um rateio manual incompleto.
 */
export function calculateExpenseShares(
  expense: Pick<
    Expense,
    | 'totalAmountCents'
    | 'splitMode'
    | 'participantPlayerIds'
    | 'extraSharesCount'
    | 'manualSharesCents'
  >,
): ExpenseShareResult {
  const totalCents = isPositiveInteger(expense.totalAmountCents) ? expense.totalAmountCents : 0;
  const participants = sanitizeParticipants(expense.participantPlayerIds ?? []);
  const extraShares = isPositiveInteger(expense.extraSharesCount) ? expense.extraSharesCount : 0;

  const empty: ExpenseShareResult = {
    sharesCents: {},
    extraSharesCents: 0,
    distributedCents: 0,
  };

  if (totalCents === 0) {
    return empty;
  }

  if (expense.splitMode === 'manual') {
    const manual = expense.manualSharesCents ?? {};
    const sharesCents: Record<string, number> = {};

    for (const playerId of participants) {
      const value = manual[playerId];
      sharesCents[playerId] = isPositiveInteger(value) ? value : 0;
    }

    const assigned = Object.values(sharesCents).reduce((sum, value) => sum + value, 0);
    const difference = totalCents - assigned;

    if (difference !== 0 && participants.length > 0) {
      const first = participants[0] as string;
      sharesCents[first] = Math.max(0, (sharesCents[first] ?? 0) + difference);
    }

    const distributedCents = Object.values(sharesCents).reduce((sum, value) => sum + value, 0);

    return { sharesCents, extraSharesCents: 0, distributedCents };
  }

  const shareCount = participants.length + extraShares;

  if (shareCount === 0) {
    return empty;
  }

  const parts = splitEqualCents(totalCents, shareCount);
  const sharesCents: Record<string, number> = {};

  participants.forEach((playerId, index) => {
    sharesCents[playerId] = parts[index] ?? 0;
  });

  const extraSharesCents = parts
    .slice(participants.length)
    .reduce((sum, value) => sum + value, 0);

  return {
    sharesCents,
    extraSharesCents,
    distributedCents: parts.reduce((sum, value) => sum + value, 0),
  };
}

/** Normaliza uma despesa da coleção nova para o formato unificado. */
export function toUnifiedExpense(
  expense: Expense,
  categoryLabel?: string | null,
): UnifiedExpense {
  const shares = calculateExpenseShares(expense);

  return {
    id: expense.id,
    source: 'expense',
    teamId: expense.teamId,
    categoryId: expense.categoryId,
    categoryLabel: categoryLabel ?? null,
    matchId: expense.matchId ?? null,
    description: expense.description ?? null,
    date: expense.date,
    totalAmountCents: isPositiveInteger(expense.totalAmountCents) ? expense.totalAmountCents : 0,
    paidByPlayerId: expense.paidByPlayerId ?? null,
    participantPlayerIds: sanitizeParticipants(expense.participantPlayerIds ?? []),
    extraSharesCount: isPositiveInteger(expense.extraSharesCount) ? expense.extraSharesCount : 0,
    settledPlayerIds: sanitizeParticipants(expense.settledPlayerIds ?? []),
    sharesCents: shares.sharesCents,
    extraSharesCents: shares.extraSharesCents,
  };
}

/**
 * Adapta o custo do campo de uma partida para o formato unificado.
 *
 * Este é o único ponto que conhece o modelo legado. Retorna `null` quando a
 * partida não tem custo lançado.
 */
export function fieldCostToUnifiedExpense(match: Match): UnifiedExpense | null {
  const fieldCost = match.fieldCost;

  if (!fieldCost || !Number.isFinite(fieldCost.totalAmount) || fieldCost.totalAmount <= 0) {
    return null;
  }

  const totalAmountCents = centsFromAmount(fieldCost.totalAmount);
  const payment = match.fieldPayment ?? null;
  const payerPlayerIds = sanitizeParticipants(payment?.payerPlayerIds ?? []);
  const splitCount = isPositiveInteger(fieldCost.splitCount) ? fieldCost.splitCount : 0;

  // No modelo legado não existe lista de participantes: o que se sabe é
  // quantas cotas foram divididas e quem já pagou. As cotas sem dono viram
  // "extras", preservando o total.
  const extraSharesCount = Math.max(0, splitCount - payerPlayerIds.length);
  const parts = splitEqualCents(totalAmountCents, splitCount || payerPlayerIds.length || 1);
  const sharesCents: Record<string, number> = {};

  payerPlayerIds.forEach((playerId, index) => {
    sharesCents[playerId] = parts[index] ?? 0;
  });

  return {
    id: `field-cost:${match.id}`,
    source: 'field-cost',
    teamId: match.teamId,
    categoryId: null,
    categoryLabel: FIELD_COST_CATEGORY_LABEL,
    matchId: match.id,
    description: fieldCost.note ?? null,
    date: match.date,
    totalAmountCents,
    paidByPlayerId: null,
    participantPlayerIds: payerPlayerIds,
    extraSharesCount,
    // No modelo legado, estar na lista de pagantes já significa acertado.
    settledPlayerIds: payerPlayerIds,
    sharesCents,
    extraSharesCents: parts.slice(payerPlayerIds.length).reduce((sum, value) => sum + value, 0),
  };
}

function matchesFilters(expense: UnifiedExpense, filters: ExpenseFilters): boolean {
  const [year, month] = expense.date.split('-').map((part) => Number(part));

  if (filters.year != null && year !== filters.year) {
    return false;
  }

  if (filters.month != null && month !== filters.month) {
    return false;
  }

  if (filters.categoryId != null && expense.categoryId !== filters.categoryId) {
    return false;
  }

  if (filters.matchId != null && expense.matchId !== filters.matchId) {
    return false;
  }

  if (filters.linkedToMatch === true && !expense.matchId) {
    return false;
  }

  if (filters.linkedToMatch === false && expense.matchId) {
    return false;
  }

  return true;
}

/**
 * Junta despesas novas e custos de campo num único conjunto ordenado por
 * data (mais recente primeiro). É por aqui que as telas devem ler.
 */
export function collectTeamExpenses(input: {
  teamId: string;
  expenses?: Expense[];
  matches?: Match[];
  categoryLabels?: Record<string, string>;
  includeFieldCosts?: boolean;
  filters?: ExpenseFilters;
}): UnifiedExpense[] {
  const {
    teamId,
    expenses = [],
    matches = [],
    categoryLabels = {},
    includeFieldCosts = true,
    filters = {},
  } = input;

  const fromExpenses = expenses
    .filter((expense) => expense.teamId === teamId && !expense.deletedAt)
    .map((expense) => toUnifiedExpense(expense, categoryLabels[expense.categoryId] ?? null));

  const fromFieldCosts = includeFieldCosts
    ? matches
        .filter((match) => match.teamId === teamId && !match.deletedAt)
        .map((match) => fieldCostToUnifiedExpense(match))
        .filter((expense): expense is UnifiedExpense => expense !== null)
    : [];

  return [...fromExpenses, ...fromFieldCosts]
    .filter((expense) => matchesFilters(expense, filters))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/** Saldo por jogador: quanto deve, quanto já acertou e quanto adiantou. */
export function buildPlayerBalances(expenses: UnifiedExpense[]): PlayerBalance[] {
  const byPlayer = new Map<string, PlayerBalance>();

  const ensure = (playerId: string) => {
    const current = byPlayer.get(playerId);

    if (current) {
      return current;
    }

    const created: PlayerBalance = {
      playerId,
      owedCents: 0,
      settledCents: 0,
      paidForGroupCents: 0,
      netCents: 0,
      expenseIds: [],
    };

    byPlayer.set(playerId, created);
    return created;
  };

  for (const expense of expenses) {
    for (const [playerId, shareCents] of Object.entries(expense.sharesCents)) {
      const balance = ensure(playerId);

      if (expense.settledPlayerIds.includes(playerId)) {
        balance.settledCents += shareCents;
      } else {
        balance.owedCents += shareCents;
      }

      if (!balance.expenseIds.includes(expense.id)) {
        balance.expenseIds.push(expense.id);
      }
    }

    if (expense.paidByPlayerId) {
      const payer = ensure(expense.paidByPlayerId);
      payer.paidForGroupCents += expense.totalAmountCents;

      if (!payer.expenseIds.includes(expense.id)) {
        payer.expenseIds.push(expense.id);
      }
    }
  }

  return [...byPlayer.values()]
    .map((balance) => ({
      ...balance,
      netCents: balance.paidForGroupCents - balance.owedCents,
    }))
    .sort((a, b) => b.owedCents - a.owedCents);
}

/** Uma pendência específica: o que o jogador deve, de qual despesa e de qual jogo. */
export interface PlayerDebtItem {
  expenseId: string;
  source: UnifiedExpenseSource;
  categoryLabel: string | null;
  description: string | null;
  date: string;
  matchId: string | null;
  matchLabel: string | null;
  shareCents: number;
}

/** Linha do painel de cobrança: um jogador e tudo que ele deve. */
export interface PlayerDebtReportRow {
  playerId: string;
  playerName: string;
  totalOwedCents: number;
  totalSettledCents: number;
  paidForGroupCents: number;
  netCents: number;
  pendingItems: PlayerDebtItem[];
}

export interface PlayerDebtReport {
  rows: PlayerDebtReportRow[];
  totalOwedCents: number;
  playersInDebtCount: number;
}

/**
 * Monta o painel de cobrança do admin: quem deve, quanto, e exatamente em quais
 * despesas e jogos. Ordena pelo maior devedor — a informação que o admin
 * procura primeiro é quem está mais atrasado.
 */
export function buildPlayerDebtReport(
  expenses: UnifiedExpense[],
  options: {
    playerNames?: Record<string, string>;
    matchLabels?: Record<string, string>;
    includeSettledPlayers?: boolean;
  } = {},
): PlayerDebtReport {
  const { playerNames = {}, matchLabels = {}, includeSettledPlayers = false } = options;
  const balances = buildPlayerBalances(expenses);
  const expensesById = new Map(expenses.map((expense) => [expense.id, expense]));

  const rows: PlayerDebtReportRow[] = balances.map((balance) => {
    const pendingItems: PlayerDebtItem[] = [];

    for (const expenseId of balance.expenseIds) {
      const expense = expensesById.get(expenseId);

      if (!expense || expense.settledPlayerIds.includes(balance.playerId)) {
        continue;
      }

      const shareCents = expense.sharesCents[balance.playerId] ?? 0;

      if (shareCents <= 0) {
        continue;
      }

      pendingItems.push({
        expenseId: expense.id,
        source: expense.source,
        categoryLabel: expense.categoryLabel,
        description: expense.description,
        date: expense.date,
        matchId: expense.matchId,
        matchLabel: expense.matchId ? matchLabels[expense.matchId] ?? null : null,
        shareCents,
      });
    }

    pendingItems.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

    return {
      playerId: balance.playerId,
      playerName: playerNames[balance.playerId] ?? 'Jogador',
      totalOwedCents: balance.owedCents,
      totalSettledCents: balance.settledCents,
      paidForGroupCents: balance.paidForGroupCents,
      netCents: balance.netCents,
      pendingItems,
    };
  });

  const visibleRows = includeSettledPlayers
    ? rows
    : rows.filter((row) => row.totalOwedCents > 0);

  return {
    rows: visibleRows.sort((a, b) => b.totalOwedCents - a.totalOwedCents),
    totalOwedCents: rows.reduce((sum, row) => sum + row.totalOwedCents, 0),
    playersInDebtCount: rows.filter((row) => row.totalOwedCents > 0).length,
  };
}

/** Resumo pronto para a tela: totais, quebra por categoria e saldos. */
export function buildExpensesSummary(expenses: UnifiedExpense[]): ExpensesSummary {
  let totalCents = 0;
  let settledCents = 0;

  const categoryMap = new Map<string, ExpensesSummary['byCategory'][number]>();

  for (const expense of expenses) {
    totalCents += expense.totalAmountCents;

    for (const [playerId, shareCents] of Object.entries(expense.sharesCents)) {
      if (expense.settledPlayerIds.includes(playerId)) {
        settledCents += shareCents;
      }
    }

    const key = expense.categoryId ?? `source:${expense.source}`;
    const current = categoryMap.get(key);

    if (current) {
      current.totalCents += expense.totalAmountCents;
      current.expenseCount += 1;
    } else {
      categoryMap.set(key, {
        categoryId: expense.categoryId,
        categoryLabel: expense.categoryLabel,
        totalCents: expense.totalAmountCents,
        expenseCount: 1,
      });
    }
  }

  return {
    totalCents,
    settledCents,
    pendingCents: Math.max(0, totalCents - settledCents),
    expenseCount: expenses.length,
    byCategory: [...categoryMap.values()].sort((a, b) => b.totalCents - a.totalCents),
    balances: buildPlayerBalances(expenses),
  };
}
