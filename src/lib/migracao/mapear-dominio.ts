/**
 * Conversão linha do Postgres → objeto do domínio.
 *
 * É o caminho inverso de `mapear-postgres.ts`, e existe pelo mesmo motivo: é
 * onde o erro passa despercebido. Uma coluna lida errado não quebra nada — só
 * mostra o número errado na tela, e ninguém desconfia.
 *
 * Três diferenças que o Postgres impõe e o domínio não conhece:
 *
 * 1. `snake_case` nas colunas, `camelCase` no domínio;
 * 2. `timestamptz` volta como ISO com fuso; o domínio espera a string ISO;
 * 3. o rateio virou tabela (`expense_shares`), mas o domínio ainda espera três
 *    listas paralelas. A remontagem acontece aqui, num lugar só.
 */

import type {
  Expense,
  ExpenseCategory,
  ExpenseSplitMode,
  MatchDiaryEntry,
  MatchDiaryMood,
} from '@/types/domain';

type Linha = Record<string, unknown>;

export interface LinhaDeCota {
  expense_id?: unknown;
  player_id?: unknown;
  amount_cents?: unknown;
  settled_at?: unknown;
}

function texto(valor: unknown, padrao = ''): string {
  return typeof valor === 'string' && valor.trim().length > 0 ? valor : padrao;
}

function textoOuNulo(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim().length > 0 ? valor : null;
}

function inteiro(valor: unknown, padrao = 0): number {
  const numero =
    typeof valor === 'number' ? valor : typeof valor === 'string' ? Number(valor) : Number.NaN;

  return Number.isFinite(numero) ? Math.trunc(numero) : padrao;
}

/**
 * `timestamptz` volta como `2026-08-13T20:00:00+00:00`. O domínio compara e
 * ordena essas strings, então normalizar para o formato com `Z` evita duas
 * representações do mesmo instante convivendo no app.
 */
export function instanteOuNulo(valor: unknown): string | null {
  const bruto = textoOuNulo(valor);

  if (!bruto) {
    return null;
  }

  const data = new Date(bruto);
  return Number.isNaN(data.getTime()) ? null : data.toISOString();
}

export function instante(valor: unknown, padrao: string): string {
  return instanteOuNulo(valor) ?? padrao;
}

/** `date` volta como `YYYY-MM-DD`, que é o que o domínio usa. */
export function dataOuNulo(valor: unknown): string | null {
  const bruto = textoOuNulo(valor);

  if (!bruto) {
    return null;
  }

  return /^\d{4}-\d{2}-\d{2}/.test(bruto) ? bruto.slice(0, 10) : null;
}

function listaDeTextos(valor: unknown): string[] {
  return Array.isArray(valor)
    ? valor.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : [];
}

export function paraCategoriaDeDespesa(linha: Linha): ExpenseCategory {
  const agora = new Date().toISOString();

  return {
    id: texto(linha.id),
    teamId: texto(linha.team_id),
    label: texto(linha.label, 'Categoria'),
    archivedAt: instanteOuNulo(linha.archived_at),
    createdAt: instante(linha.created_at, agora),
    updatedAt: instante(linha.updated_at, agora),
  };
}

/**
 * Remonta a despesa a partir da linha e das cotas.
 *
 * `participantPlayerIds`, `settledPlayerIds` e `manualSharesCents` deixaram de
 * existir como colunas: viraram `expense_shares`. O domínio ainda espera as três
 * listas, então a reconstrução mora aqui — e some no dia em que as telas
 * passarem a consultar as cotas direto.
 *
 * A ordem das cotas importa: no rateio igual, o centavo que sobra vai para os
 * primeiros. Ordenar por `player_id` mantém o resultado estável entre leituras,
 * em vez de depender da ordem que o Postgres devolveu.
 */
export function paraDespesa(linha: Linha, cotas: LinhaDeCota[] = []): Expense {
  const agora = new Date().toISOString();
  const id = texto(linha.id);

  const minhasCotas = cotas
    .filter((cota) => texto(cota.expense_id) === id)
    .map((cota) => ({
      playerId: texto(cota.player_id),
      amountCents: inteiro(cota.amount_cents),
      settledAt: instanteOuNulo(cota.settled_at),
    }))
    .filter((cota) => cota.playerId.length > 0)
    .sort((esquerda, direita) => esquerda.playerId.localeCompare(direita.playerId));

  const splitMode: ExpenseSplitMode =
    linha.split_mode === 'manual' ? 'manual' : 'equal';

  const manualSharesCents: Record<string, number> = {};

  for (const cota of minhasCotas) {
    manualSharesCents[cota.playerId] = cota.amountCents;
  }

  return {
    id,
    teamId: texto(linha.team_id),
    categoryId: texto(linha.category_id),
    matchId: textoOuNulo(linha.match_id),
    description: textoOuNulo(linha.description),
    date: dataOuNulo(linha.date) ?? agora.slice(0, 10),
    totalAmountCents: inteiro(linha.total_amount_cents),
    paidByPlayerId: textoOuNulo(linha.paid_by_player_id),
    splitMode,
    participantPlayerIds: minhasCotas.map((cota) => cota.playerId),
    extraSharesCount: inteiro(linha.extra_shares_count),
    // Só faz sentido no modo manual. No igual, o valor é derivado do total e
    // devolver o mapa faria a tela achar que houve rateio à mão.
    manualSharesCents: splitMode === 'manual' ? manualSharesCents : undefined,
    settledPlayerIds: minhasCotas
      .filter((cota) => cota.settledAt !== null)
      .map((cota) => cota.playerId),
    createdBy: textoOuNulo(linha.created_by),
    deletedAt: instanteOuNulo(linha.deleted_at),
    createdAt: instante(linha.created_at, agora),
    updatedAt: instante(linha.updated_at, agora),
  };
}

const HUMORES: MatchDiaryMood[] = ['funny', 'highlight', 'warning', 'praise', 'neutral'];

/**
 * Resenha da partida.
 *
 * `authorName` é cópia denormalizada de propósito: vive na resenha para o
 * histórico não mudar quando a pessoa troca o nome depois.
 */
export function paraResenha(linha: Linha): MatchDiaryEntry {
  const agora = new Date().toISOString();
  const humor = textoOuNulo(linha.mood);

  return {
    id: texto(linha.id),
    teamId: texto(linha.team_id),
    matchId: texto(linha.match_id),
    authorUserId: texto(linha.author_user_id),
    authorName: texto(linha.author_name),
    title: textoOuNulo(linha.title),
    content: texto(linha.content),
    mentionedPlayerIds: listaDeTextos(linha.mentioned_player_ids),
    visibility: 'team',
    pinned: linha.pinned === true,
    // Valor fora da lista renderizaria um ícone inexistente na tela.
    mood: humor && HUMORES.includes(humor as MatchDiaryMood) ? (humor as MatchDiaryMood) : null,
    emoji: textoOuNulo(linha.emoji),
    createdAt: instante(linha.created_at, agora),
    updatedAt: instante(linha.updated_at, agora),
  };
}

/**
 * Cotas a gravar para uma despesa.
 *
 * Inverso de `paraDespesa`. No modo manual respeita o valor informado; no igual
 * distribui o total entre participantes e cotas extras, com o resto indo para
 * os primeiros — a mesma regra de `splitEqualCents`, para a soma fechar.
 */
export function paraCotasDaDespesa(
  expense: Expense,
  dividirIgual: (totalCents: number, shareCount: number) => number[],
): { expense_id: string; player_id: string; amount_cents: number; settled_at: string | null }[] {
  const participantes = [...new Set(expense.participantPlayerIds)];

  if (participantes.length === 0) {
    return [];
  }

  const quitados = new Set(expense.settledPlayerIds);
  const agora = new Date().toISOString();
  const divisoes = participantes.length + Math.max(0, expense.extraSharesCount ?? 0);
  const iguais = dividirIgual(expense.totalAmountCents, divisoes);

  return participantes.map((playerId, indice) => {
    const manual =
      expense.splitMode === 'manual' ? expense.manualSharesCents?.[playerId] : undefined;

    return {
      expense_id: expense.id,
      player_id: playerId,
      amount_cents: Math.max(0, Math.trunc(manual ?? iguais[indice] ?? 0)),
      settled_at: quitados.has(playerId) ? agora : null,
    };
  });
}
