/**
 * Camada de financeiro.
 *
 * Substitui só os métodos deste módulo; o resto continua vindo do Firestore
 * sem saber que algo mudou.
 */

import { exigirTimeAtivo } from '@/services/repository/supabase/composicao/comum';
import { criarFatia } from '@/services/repository/supabase/fatias';
import type { AppRepository } from '@/services/repository/types';
import {
  apagarDespesa,
  arquivarCategoria,
  atualizarCategoria,
  atualizarDespesa,
  buscarCategoriasDeDespesa,
  buscarDespesas,
  criarCategoria,
  criarDespesa,
  definirQuitacao,
} from '@/services/repository/supabase/financeiro';
import { buscarTimeAtivo } from '@/services/repository/supabase/composicao/comum';

// ── Financeiro ─────────────────────────────────────────────────────────────

export const fatiaDoFinanceiro = criarFatia({
  nome: 'financeiro',
  vazio: { expenses: [], expenseCategories: [] },
  async ler() {
    const teamId = await buscarTimeAtivo();

    if (!teamId) {
      return { expenses: [], expenseCategories: [] };
    }

    const [expenseCategories, expenses] = await Promise.all([
      buscarCategoriasDeDespesa(teamId),
      buscarDespesas(teamId),
    ]);

    return { expenses, expenseCategories };
  },
  aplicar: (snapshot, valor) => ({
    ...snapshot,
    expenses: valor.expenses,
    expenseCategories: valor.expenseCategories,
  }),
});

export function comFinanceiro(base: AppRepository): AppRepository {
  return {
    ...base,

    async createExpense(input, actorUserId) {
      const despesa = await criarDespesa(await exigirTimeAtivo(), input, actorUserId);
      await fatiaDoFinanceiro.recarregar();
      return despesa;
    },

    async updateExpense(expenseId, input) {
      const despesa = await atualizarDespesa(expenseId, input);
      await fatiaDoFinanceiro.recarregar();
      return despesa;
    },

    async deleteExpense(expenseId) {
      await apagarDespesa(expenseId);
      await fatiaDoFinanceiro.recarregar();
    },

    async setExpenseSettlement(expenseId, playerId, settled) {
      const despesa = await definirQuitacao(expenseId, playerId, settled);
      await fatiaDoFinanceiro.recarregar();
      return despesa;
    },

    async createExpenseCategory(input) {
      const categoria = await criarCategoria(await exigirTimeAtivo(), input);
      await fatiaDoFinanceiro.recarregar();
      return categoria;
    },

    async updateExpenseCategory(categoryId, input) {
      const categoria = await atualizarCategoria(categoryId, input);
      await fatiaDoFinanceiro.recarregar();
      return categoria;
    },

    async deleteExpenseCategory(categoryId) {
      await arquivarCategoria(categoryId);
      await fatiaDoFinanceiro.recarregar();
    },
  };
}

