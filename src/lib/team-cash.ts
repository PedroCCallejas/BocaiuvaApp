import { parseCurrencyInputToCents } from '@/lib/money';

export interface TeamCashEntry {
  id: string;
  team_id: string;
  week_start: string;
  amount_cents: number;
  description: string | null;
}

export function cashWeekStart(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Informe a data no formato AAAA-MM-DD.');
  const date = new Date(value + 'T12:00:00Z');
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value)
    throw new Error('Informe uma data válida.');
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  return date.toISOString().slice(0, 10);
}

export function cashAmount(value: string): number {
  if (!/^\s*(?:R\$\s*)?\d+(?:\.\d{3})*(?:,\d{1,2})?\s*$/.test(value))
    throw new Error('Informe um valor em reais, como 150,00.');
  const cents = parseCurrencyInputToCents(value);
  if (cents == null || !Number.isSafeInteger(cents) || cents <= 0 || cents > 2147483647)
    throw new Error('Informe um valor maior que zero dentro do limite permitido.');
  return cents;
}

export function cashTotal(entries: TeamCashEntry[]): number {
  return entries.reduce((sum, entry) => {
    const total = sum + entry.amount_cents;
    if (!Number.isSafeInteger(total)) throw new Error('O total ultrapassa o limite de cálculo.');
    return total;
  }, 0);
}
