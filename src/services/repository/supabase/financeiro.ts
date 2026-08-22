/**
 * Financeiro lendo e gravando no Postgres.
 *
 * Primeiro módulo a sair do Firestore. Foi escolhido por ser o mais novo, o
 * mais isolado e o de menos dado — se algo der errado, o estrago é pequeno e o
 * rollback é desligar `EXPO_PUBLIC_SUPABASE_MODULES`.
 *
 * O que muda em relação ao Firestore:
 *
 * - a permissão deixa de ser checada aqui e passa a ser da RLS. Não há
 *   `ensureTeamAdmin` neste arquivo: se a policy recusar, o banco recusa. Uma
 *   checagem a mais no cliente só criaria um segundo lugar para divergir;
 * - despesa e rateio entram por `salvar_despesa`, uma transação. Duas escritas
 *   soltas podiam deixar despesa sem cota;
 * - o rateio volta de `expense_shares` e é remontado nas três listas que o
 *   domínio espera.
 */

import { supabase } from '@/config/supabase/client';
import { splitEqualCents } from '@/lib/expenses';
import {
  paraCategoriaDeDespesa,
  paraCotasDaDespesa,
  paraDespesa,
} from '@/lib/migracao/mapear-dominio';
import {
  criarErroDoRepositorio,
  traduzirErroDoPostgres,
  type ErroDoRepositorio,
} from '@/services/repository/supabase/erros';
import type {
  CreateExpenseCategoryInput,
  CreateExpenseInput,
  UpdateExpenseCategoryInput,
  UpdateExpenseInput,
} from '@/services/repository/types';
import type { Expense, ExpenseCategory } from '@/types/domain';

function cliente() {
  if (!supabase) {
    throw criarErroDoRepositorio(
      'A conexão com o banco não está configurada.',
      'failed-precondition',
    );
  }

  return supabase;
}

function agora() {
  return new Date().toISOString();
}

/** Id no mesmo formato do Firestore, para os dois bancos conviverem. */
function novoId() {
  const alfabeto = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';

  for (let i = 0; i < 20; i += 1) {
    id += alfabeto[Math.floor(Math.random() * alfabeto.length)];
  }

  return id;
}

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

function exigirData(valor: string): string {
  const limpo = valor?.trim() ?? '';

  if (!DATA_ISO.test(limpo)) {
    throw criarErroDoRepositorio('Informe uma data válida.', 'failed-precondition');
  }

  return limpo;
}

function exigirCentavos(valor: number): number {
  if (!Number.isFinite(valor) || valor < 0 || !Number.isInteger(valor)) {
    throw criarErroDoRepositorio('Informe um valor válido.', 'failed-precondition');
  }

  return valor;
}

// ── Leitura ────────────────────────────────────────────────────────────────

export async function buscarCategoriasDeDespesa(teamId: string): Promise<ExpenseCategory[]> {
  const { data, error } = await cliente()
    .from('expense_categories')
    .select('*')
    .eq('team_id', teamId)
    .order('label');

  if (error) {
    throw traduzirErroDoPostgres(error, 'Não foi possível carregar as categorias agora.');
  }

  return (data ?? []).map(paraCategoriaDeDespesa);
}

/**
 * Despesas com o rateio junto.
 *
 * Duas consultas em vez de um join aninhado: o PostgREST devolveria as cotas
 * embutidas, mas o formato aninhado muda conforme a versão e deixa o
 * mapeamento refém disso. Duas leituras simples são previsíveis, e nesta
 * escala o custo é irrelevante.
 */
export async function buscarDespesas(teamId: string): Promise<Expense[]> {
  const supabaseClient = cliente();

  const { data: linhas, error } = await supabaseClient
    .from('expenses')
    .select('*')
    .eq('team_id', teamId)
    .order('date', { ascending: false });

  if (error) {
    throw traduzirErroDoPostgres(error, 'Não foi possível carregar as despesas agora.');
  }

  const ids = (linhas ?? [])
    .map((linha) => (linha as { id?: unknown }).id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);

  if (ids.length === 0) {
    return [];
  }

  const { data: cotas, error: erroDasCotas } = await supabaseClient
    .from('expense_shares')
    .select('*')
    .in('expense_id', ids);

  if (erroDasCotas) {
    throw traduzirErroDoPostgres(erroDasCotas, 'Não foi possível carregar o rateio agora.');
  }

  return (linhas ?? []).map((linha) => paraDespesa(linha, cotas ?? []));
}

// ── Escrita ────────────────────────────────────────────────────────────────

/** Grava despesa e rateio de uma vez, pela RPC transacional. */
async function salvarDespesa(expense: Expense): Promise<Expense> {
  const { data, error } = await cliente().rpc('salvar_despesa', {
    p_expense: {
      id: expense.id,
      team_id: expense.teamId,
      category_id: expense.categoryId,
      match_id: expense.matchId,
      description: expense.description,
      date: expense.date,
      total_amount_cents: expense.totalAmountCents,
      paid_by_player_id: expense.paidByPlayerId,
      split_mode: expense.splitMode,
      extra_shares_count: expense.extraSharesCount ?? 0,
      created_by: expense.createdBy,
      deleted_at: expense.deletedAt,
      created_at: expense.createdAt,
    },
    p_cotas: paraCotasDaDespesa(expense, splitEqualCents),
  });

  if (error) {
    throw traduzirErroDoPostgres(error, 'Não foi possível salvar a despesa agora.');
  }

  // A RPC devolve a linha gravada; as cotas voltam do que acabamos de mandar,
  // então o objeto devolvido reflete o banco sem precisar de outra leitura.
  return paraDespesa(
    (data ?? {}) as Record<string, unknown>,
    paraCotasDaDespesa(expense, splitEqualCents),
  );
}

async function buscarDespesaPorId(expenseId: string): Promise<Expense> {
  const supabaseClient = cliente();

  const { data, error } = await supabaseClient
    .from('expenses')
    .select('*')
    .eq('id', expenseId)
    .maybeSingle();

  if (error) {
    throw traduzirErroDoPostgres(error, 'Não foi possível carregar a despesa agora.');
  }

  if (!data) {
    throw criarErroDoRepositorio('Despesa não encontrada.', 'not-found');
  }

  const { data: cotas, error: erroDasCotas } = await supabaseClient
    .from('expense_shares')
    .select('*')
    .eq('expense_id', expenseId);

  if (erroDasCotas) {
    throw traduzirErroDoPostgres(erroDasCotas, 'Não foi possível carregar o rateio agora.');
  }

  return paraDespesa(data, cotas ?? []);
}

export async function criarDespesa(
  teamId: string,
  input: CreateExpenseInput,
  actorUserId: string,
): Promise<Expense> {
  const instante = agora();
  const participantes = [...new Set(input.participantPlayerIds ?? [])];

  return await salvarDespesa({
    id: novoId(),
    teamId,
    categoryId: input.categoryId,
    matchId: input.matchId ?? null,
    description: input.description?.trim() || null,
    date: exigirData(input.date),
    totalAmountCents: exigirCentavos(input.totalAmountCents),
    paidByPlayerId: input.paidByPlayerId ?? null,
    splitMode: input.splitMode ?? 'equal',
    participantPlayerIds: participantes,
    extraSharesCount: exigirCentavos(input.extraSharesCount ?? 0),
    manualSharesCents: input.manualSharesCents ?? undefined,
    // Quitado de quem não participa não faz sentido: seria dívida inexistente
    // marcada como paga.
    settledPlayerIds: [...new Set(input.settledPlayerIds ?? [])].filter((playerId) =>
      participantes.includes(playerId),
    ),
    createdBy: actorUserId,
    deletedAt: null,
    createdAt: instante,
    updatedAt: instante,
  });
}

export async function atualizarDespesa(
  expenseId: string,
  input: UpdateExpenseInput,
): Promise<Expense> {
  const atual = await buscarDespesaPorId(expenseId);

  const participantes =
    input.participantPlayerIds !== undefined
      ? [...new Set(input.participantPlayerIds)]
      : atual.participantPlayerIds;

  const quitados =
    input.settledPlayerIds !== undefined ? input.settledPlayerIds : atual.settledPlayerIds;

  return await salvarDespesa({
    ...atual,
    categoryId: input.categoryId ?? atual.categoryId,
    matchId: input.matchId !== undefined ? input.matchId : atual.matchId,
    description:
      input.description !== undefined ? input.description?.trim() || null : atual.description,
    date: input.date !== undefined ? exigirData(input.date) : atual.date,
    totalAmountCents:
      input.totalAmountCents !== undefined
        ? exigirCentavos(input.totalAmountCents)
        : atual.totalAmountCents,
    paidByPlayerId:
      input.paidByPlayerId !== undefined ? input.paidByPlayerId : atual.paidByPlayerId,
    splitMode: input.splitMode ?? atual.splitMode,
    participantPlayerIds: participantes,
    extraSharesCount:
      input.extraSharesCount !== undefined
        ? exigirCentavos(input.extraSharesCount)
        : atual.extraSharesCount,
    manualSharesCents:
      input.manualSharesCents !== undefined
        ? input.manualSharesCents ?? undefined
        : atual.manualSharesCents,
    settledPlayerIds: [...new Set(quitados)].filter((playerId) =>
      participantes.includes(playerId),
    ),
    updatedAt: agora(),
  });
}

/** Soft delete, igual ao Firestore: o histórico financeiro não some. */
export async function apagarDespesa(expenseId: string): Promise<void> {
  const atual = await buscarDespesaPorId(expenseId);

  await salvarDespesa({ ...atual, deletedAt: agora(), updatedAt: agora() });
}

export async function definirQuitacao(
  expenseId: string,
  playerId: string,
  quitado: boolean,
): Promise<Expense> {
  const { error } = await cliente()
    .from('expense_shares')
    .update({ settled_at: quitado ? agora() : null })
    .eq('expense_id', expenseId)
    .eq('player_id', playerId);

  if (error) {
    throw traduzirErroDoPostgres(error, 'Não foi possível atualizar o acerto agora.');
  }

  return await buscarDespesaPorId(expenseId);
}

// ── Categorias ─────────────────────────────────────────────────────────────

export async function criarCategoria(
  teamId: string,
  input: CreateExpenseCategoryInput,
): Promise<ExpenseCategory> {
  const instante = agora();

  const { data, error } = await cliente()
    .from('expense_categories')
    .insert({
      id: novoId(),
      team_id: teamId,
      label: input.label.trim(),
      archived_at: null,
      created_at: instante,
      updated_at: instante,
    })
    .select()
    .single();

  if (error) {
    throw traduzirErroDoPostgres(error, 'Não foi possível criar a categoria agora.');
  }

  return paraCategoriaDeDespesa(data);
}

export async function atualizarCategoria(
  categoryId: string,
  input: UpdateExpenseCategoryInput,
): Promise<ExpenseCategory> {
  const mudancas: Record<string, unknown> = { updated_at: agora() };

  if (input.label !== undefined) {
    mudancas.label = input.label.trim();
  }

  // O contrato usa um booleano; a coluna guarda QUANDO foi arquivada. Desarquivar
  // volta para nulo em vez de apagar a linha.
  if (input.archived !== undefined) {
    mudancas.archived_at = input.archived ? agora() : null;
  }

  const { data, error } = await cliente()
    .from('expense_categories')
    .update(mudancas)
    .eq('id', categoryId)
    .select()
    .single();

  if (error) {
    throw traduzirErroDoPostgres(error, 'Não foi possível atualizar a categoria agora.');
  }

  return paraCategoriaDeDespesa(data);
}

/**
 * Arquiva em vez de apagar.
 *
 * As despesas antigas apontam para a categoria; apagar deixaria o histórico
 * sem nome. O banco também recusaria, porque `expenses.category_id` é FK sem
 * cascade — e essa recusa é proposital.
 */
export async function arquivarCategoria(categoryId: string): Promise<void> {
  const { error } = await cliente()
    .from('expense_categories')
    .update({ archived_at: agora(), updated_at: agora() })
    .eq('id', categoryId);

  if (error) {
    throw traduzirErroDoPostgres(error, 'Não foi possível arquivar a categoria agora.');
  }
}

export type { ErroDoRepositorio };
