/**
 * Utilitário central de valores monetários em centavos (BRL).
 * Todo cálculo novo de financeiro deve passar por aqui — nunca usar
 * parseFloat direto nem aritmética de float sobre reais.
 *
 * O modelo persistido da partida (MatchFieldCost.totalAmount) guarda reais
 * com duas casas; a conversão reais ↔ centavos é feita apenas na borda,
 * sempre com arredondamento explícito.
 */

export const DEFAULT_MATCH_COST_CENTS = 18500;

export function isValidCents(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= 0
  );
}

export function centsFromAmount(amount: number): number {
  if (!Number.isFinite(amount)) {
    return 0;
  }

  return Math.round(amount * 100);
}

export function amountFromCents(cents: number): number {
  if (!isValidCents(cents)) {
    return 0;
  }

  return Math.round(cents) / 100;
}

export function formatCentsBRL(cents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountFromCents(cents));
}

/**
 * Converte texto digitado ("185,00", "R$ 185", "1.850,50") em centavos.
 * Retorna null para entrada vazia ou inválida; nunca retorna negativo.
 */
export function parseCurrencyInputToCents(value: string): number | null {
  const sanitized = value.replace(/[^\d,.-]/g, '').trim();

  if (!sanitized) {
    return null;
  }

  if (sanitized.includes('-')) {
    return null;
  }

  const lastComma = sanitized.lastIndexOf(',');
  const lastDot = sanitized.lastIndexOf('.');
  const decimalSeparatorIndex = Math.max(lastComma, lastDot);

  let integerPart: string;
  let decimalPart: string;

  if (decimalSeparatorIndex >= 0) {
    integerPart = sanitized.slice(0, decimalSeparatorIndex).replace(/[.,]/g, '');
    decimalPart = sanitized.slice(decimalSeparatorIndex + 1).replace(/[.,]/g, '');
  } else {
    integerPart = sanitized.replace(/[.,]/g, '');
    decimalPart = '';
  }

  if (decimalPart.length > 2) {
    // Separador era de milhar (ex.: "18.500") — trata tudo como inteiro.
    integerPart = `${integerPart}${decimalPart}`;
    decimalPart = '';
  }

  const normalizedDecimal = decimalPart.padEnd(2, '0').slice(0, 2);
  const integer = Number(integerPart || '0');
  const decimal = Number(normalizedDecimal || '0');

  if (!Number.isFinite(integer) || !Number.isFinite(decimal)) {
    return null;
  }

  return integer * 100 + decimal;
}

export function formatCentsForInput(cents: number): string {
  const amount = amountFromCents(cents);
  return amount.toFixed(2).replace('.', ',');
}
