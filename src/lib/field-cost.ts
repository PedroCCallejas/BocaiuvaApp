import type { MatchFieldCost, MatchFieldPayment } from '@/types/domain';
import type {
  MatchFieldCostInput,
  MatchFieldPaymentInput,
} from '@/services/repository/types';

function roundToTwoDecimals(value: number) {
  return Math.round(value * 100) / 100;
}

function normalizeOptionalText(value?: string | null) {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

export function formatCurrencyBRL(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

export function sanitizeCurrencyInput(value: string) {
  return value.replace(/[^\d,.-]/g, '');
}

export function parseCurrencyInputToNumber(value: string) {
  const sanitized = sanitizeCurrencyInput(value).trim();

  if (!sanitized) {
    return null;
  }

  const lastComma = sanitized.lastIndexOf(',');
  const lastDot = sanitized.lastIndexOf('.');
  const decimalSeparatorIndex = Math.max(lastComma, lastDot);

  const normalized =
    decimalSeparatorIndex >= 0
      ? `${sanitized.slice(0, decimalSeparatorIndex).replace(/[.,]/g, '')}.${sanitized
          .slice(decimalSeparatorIndex + 1)
          .replace(/[.,]/g, '')}`
      : sanitized.replace(/[.,]/g, '');

  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function buildMatchFieldCost(input: {
  values: MatchFieldCostInput;
  updatedAt: string;
  updatedByUserId: string;
}): MatchFieldCost {
  if (!Number.isFinite(input.values.totalAmount) || input.values.totalAmount < 0) {
    throw new Error('Informe um valor total do campo maior ou igual a zero.');
  }

  if (!Number.isFinite(input.values.splitCount) || input.values.splitCount <= 0) {
    throw new Error('Informe em quantas pessoas o valor do campo sera dividido.');
  }

  const totalAmount = roundToTwoDecimals(input.values.totalAmount);
  const splitCount = Math.trunc(input.values.splitCount);
  const amountPerPlayer = roundToTwoDecimals(totalAmount / splitCount);
  const note = input.values.note?.trim() ?? '';

  return {
    totalAmount,
    splitCount,
    amountPerPlayer,
    currency: 'BRL',
    note: note.length > 0 ? note : null,
    updatedAt: input.updatedAt,
    updatedByUserId: input.updatedByUserId,
  };
}

export interface MatchFieldPaymentSummary {
  paidPlayerCount: number;
  paidGuestCount: number;
  totalPaidCount: number;
  totalReceived: number;
  pendingCount: number;
  pendingAmount: number;
}

export function getMatchFieldPaymentSummary(
  fieldCost: MatchFieldCost,
  fieldPayment?: MatchFieldPayment | null,
): MatchFieldPaymentSummary {
  const paidPlayerCount = [...new Set(fieldPayment?.payerPlayerIds ?? [])].length;
  const paidGuestCount = Math.max(0, Math.trunc(fieldPayment?.paidGuestCount ?? 0));
  const totalPaidCount = paidPlayerCount + paidGuestCount;
  const totalReceived = roundToTwoDecimals(totalPaidCount * fieldCost.amountPerPlayer);
  const pendingCount = Math.max(fieldCost.splitCount - totalPaidCount, 0);
  const pendingAmount = Math.max(
    0,
    roundToTwoDecimals(fieldCost.totalAmount - totalReceived),
  );

  return {
    paidPlayerCount,
    paidGuestCount,
    totalPaidCount,
    totalReceived,
    pendingCount,
    pendingAmount,
  };
}

export function buildMatchFieldPayment(input: {
  values: MatchFieldPaymentInput;
  fieldCost: MatchFieldCost;
  confirmedPlayerIds: string[];
  updatedAt: string;
  updatedByUserId: string;
}): MatchFieldPayment {
  const confirmedPlayerIds = new Set(input.confirmedPlayerIds);
  const payerPlayerIds = [...new Set(input.values.payerPlayerIds)];
  const exemptPlayerIds = [...new Set(input.values.exemptPlayerIds ?? [])];

  for (const playerId of payerPlayerIds) {
    if (!confirmedPlayerIds.has(playerId)) {
      throw new Error('Somente jogadores confirmados podem ser marcados como pagos.');
    }
  }

  for (const playerId of exemptPlayerIds) {
    if (!confirmedPlayerIds.has(playerId)) {
      throw new Error('Somente jogadores confirmados podem ser marcados como não pagantes.');
    }

    // Pagou e não paga são estados excludentes: aceitar os dois deixaria o
    // rateio ambíguo e o total nunca fecharia.
    if (payerPlayerIds.includes(playerId)) {
      throw new Error('Um jogador não pode estar como pago e como não pagante ao mesmo tempo.');
    }
  }

  const paidGuestCount = Math.max(0, Math.trunc(input.values.paidGuestCount ?? 0));
  const summary = getMatchFieldPaymentSummary(input.fieldCost, {
    payerPlayerIds,
    paidGuestCount,
  });

  if (summary.totalPaidCount > input.fieldCost.splitCount) {
    // Mensagem precisa dizer os números e o caminho da correção: o admin
    // marca todo mundo que jogou e não entende por que o salvamento falha.
    throw new Error(
      `Você marcou ${summary.totalPaidCount} pagante(s), mas o campo está dividido em ` +
        `${input.fieldCost.splitCount} cota(s). Ajuste a divisão em "Editar valor do campo" ` +
        'ou marque quem não entra no rateio como "Não paga".',
    );
  }

  return {
    payerPlayerIds,
    exemptPlayerIds,
    paidGuestCount,
    pixKey: normalizeOptionalText(input.values.pixKey),
    responsibleName: normalizeOptionalText(input.values.responsibleName),
    updatedAt: input.updatedAt,
    updatedByUserId: input.updatedByUserId,
  };
}

export interface FieldCostSplitCheck {
  confirmedCount: number;
  exemptCount: number;
  payingCount: number;
  splitCount: number;
  /** Cotas que sobram para convidados sem cadastro. Negativo = faltam cotas. */
  differenceFromSplit: number;
  balanced: boolean;
}

/**
 * Compara quem realmente paga com a divisão informada no pós-jogo.
 *
 * O admin digita "dividir entre 10" e 12 confirmam presença: a diferença
 * precisa aparecer na tela para ele decidir quem fica de fora, em vez de o
 * app escolher sozinho e inventar dois devedores.
 */
export function checkFieldCostSplit(input: {
  splitCount: number;
  confirmedPlayerIds: string[];
  exemptPlayerIds?: string[];
  paidGuestCount?: number;
}): FieldCostSplitCheck {
  const confirmed = [...new Set(input.confirmedPlayerIds)];
  const exempt = [...new Set(input.exemptPlayerIds ?? [])].filter((playerId) =>
    confirmed.includes(playerId),
  );
  const payingCount = confirmed.length - exempt.length;
  const splitCount = Math.max(0, Math.trunc(input.splitCount));
  const guests = Math.max(0, Math.trunc(input.paidGuestCount ?? 0));

  return {
    confirmedCount: confirmed.length,
    exemptCount: exempt.length,
    payingCount,
    splitCount,
    differenceFromSplit: splitCount - payingCount - guests,
    balanced: splitCount - payingCount - guests === 0,
  };
}
