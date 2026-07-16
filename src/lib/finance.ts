import { centsFromAmount } from '@/lib/money';
import type { Match, MatchStatus } from '@/types/domain';

export type FinanceStatusFilter = 'all' | 'finished' | 'open' | 'canceled';

export interface FinanceFilters {
  year?: number | null;
  month?: number | null;
  status?: FinanceStatusFilter;
}

export interface FinanceMatchRow {
  matchId: string;
  date: string;
  time: string;
  opponentName: string;
  status: MatchStatus;
  costCents: number | null;
  splitCount: number | null;
  includedInTotals: boolean;
}

export interface FinanceSummary {
  totalMatches: number;
  matchesWithCost: number;
  matchesWithoutCost: number;
  realizedCostCents: number;
  expectedCostCents: number;
  averageCostCents: number;
  rows: FinanceMatchRow[];
}

function getDateParts(date: string) {
  const [year, month] = date.split('-').map((value) => Number(value));
  return {
    year: Number.isFinite(year) ? year : 0,
    month: Number.isFinite(month) ? month : 0,
  };
}

export function getMatchCostCents(match: Pick<Match, 'fieldCost'>): number | null {
  if (
    !match.fieldCost ||
    !Number.isFinite(match.fieldCost.totalAmount) ||
    match.fieldCost.totalAmount < 0
  ) {
    return null;
  }

  return centsFromAmount(match.fieldCost.totalAmount);
}

function matchesStatusFilter(match: Match, status: FinanceStatusFilter) {
  switch (status) {
    case 'finished':
      return match.status === 'finished';
    case 'canceled':
      return match.status === 'canceled';
    case 'open':
      return match.status !== 'finished' && match.status !== 'canceled';
    case 'all':
    default:
      return true;
  }
}

/**
 * Resumo financeiro determinístico das partidas de um time.
 * Regras de totalização:
 * - partidas canceladas preservam o valor no histórico, mas ficam fora dos
 *   totais realizados/previstos;
 * - partidas sem valor NUNCA entram como zero: são contadas à parte;
 * - custo realizado = partidas encerradas com valor;
 * - custo previsto = partidas ainda abertas (scheduled/confirmed) com valor.
 */
export function buildFinanceSummary(
  matches: Match[],
  teamId: string,
  filters?: FinanceFilters,
): FinanceSummary {
  const status = filters?.status ?? 'all';
  const filtered = matches
    .filter((match) => match.teamId === teamId && !match.deletedAt)
    .filter((match) => {
      const parts = getDateParts(match.date);

      if (filters?.year != null && parts.year !== filters.year) {
        return false;
      }

      if (filters?.month != null && parts.month !== filters.month) {
        return false;
      }

      return matchesStatusFilter(match, status);
    })
    .sort((left, right) => right.date.localeCompare(left.date));

  const rows = filtered.map<FinanceMatchRow>((match) => {
    const costCents = getMatchCostCents(match);
    const includedInTotals = costCents != null && match.status !== 'canceled';

    return {
      matchId: match.id,
      date: match.date,
      time: match.time,
      opponentName: match.opponentName,
      status: match.status,
      costCents,
      splitCount: match.fieldCost?.splitCount ?? null,
      includedInTotals,
    };
  });

  const withCost = rows.filter((row) => row.costCents != null);
  const realizedRows = rows.filter(
    (row) => row.includedInTotals && row.status === 'finished',
  );
  const expectedRows = rows.filter(
    (row) => row.includedInTotals && row.status !== 'finished',
  );
  const realizedCostCents = realizedRows.reduce(
    (sum, row) => sum + (row.costCents ?? 0),
    0,
  );
  const expectedCostCents = expectedRows.reduce(
    (sum, row) => sum + (row.costCents ?? 0),
    0,
  );
  const includedRows = rows.filter((row) => row.includedInTotals);
  const includedTotal = includedRows.reduce((sum, row) => sum + (row.costCents ?? 0), 0);

  return {
    totalMatches: rows.length,
    matchesWithCost: withCost.length,
    matchesWithoutCost: rows.filter(
      (row) => row.costCents == null && row.status !== 'canceled',
    ).length,
    realizedCostCents,
    expectedCostCents,
    averageCostCents:
      includedRows.length > 0 ? Math.round(includedTotal / includedRows.length) : 0,
    rows,
  };
}

export function getAvailableFinanceYears(matches: Match[], teamId: string) {
  return [
    ...new Set(
      matches
        .filter((match) => match.teamId === teamId && !match.deletedAt)
        .map((match) => getDateParts(match.date).year),
    ),
  ]
    .filter((year) => year > 0)
    .sort((left, right) => right - left);
}
