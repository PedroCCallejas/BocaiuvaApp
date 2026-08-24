/**
 * Encaixa os módulos já migrados no repositório existente.
 *
 * Composição por cima, nunca edição: o `firebase-repository` não é tocado. Ele
 * sustenta o app inteiro, e mexer nele para migrar um módulo colocaria os
 * outros em risco sem necessidade.
 *
 * Cada módulo substitui só os seus métodos e a sua fatia do snapshot. O resto
 * continua vindo do Firestore sem saber que algo mudou — é o que torna o
 * rollback independente por módulo.
 */

import { supabase } from '@/config/supabase/client';
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
import {
  apagarResenha,
  atualizarResenha,
  buscarResenhas,
  criarResenha,
} from '@/services/repository/supabase/resenhas';
import {
  criarErroDoRepositorio,
  traduzirErroDoPostgres,
} from '@/services/repository/supabase/erros';
import {
  aplicarTodasAsFatias,
  criarFatia,
  fatiasPendentes,
  registrarEmissao,
} from '@/services/repository/supabase/fatias';
import { moduloUsaSupabase } from '@/services/repository/modulos';
import type { AppRepository } from '@/services/repository/types';

/**
 * Time ativo da pessoa autenticada.
 *
 * Vem do banco, não de estado guardado aqui. Guardar numa variável criaria uma
 * segunda fonte da verdade que sai de sincronia quando a pessoa troca de time —
 * e o sintoma seria dado gravado no time errado.
 */
async function buscarTimeAtivo(): Promise<string | null> {
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from('users')
    .select('active_team_id')
    .maybeSingle();

  if (error) {
    throw traduzirErroDoPostgres(error, 'Não foi possível identificar seu time agora.');
  }

  const id = (data as { active_team_id?: unknown } | null)?.active_team_id;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

async function exigirTimeAtivo(): Promise<string> {
  const teamId = await buscarTimeAtivo();

  if (!teamId) {
    throw criarErroDoRepositorio('Escolha um time antes de continuar.', 'failed-precondition');
  }

  return teamId;
}

// ── Financeiro ─────────────────────────────────────────────────────────────

const fatiaDoFinanceiro = criarFatia({
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

function comFinanceiro(base: AppRepository): AppRepository {
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

// ── Resenhas ───────────────────────────────────────────────────────────────

const fatiaDasResenhas = criarFatia({
  nome: 'resenhas',
  vazio: { matchDiaryEntries: [] },
  async ler() {
    const teamId = await buscarTimeAtivo();
    return { matchDiaryEntries: teamId ? await buscarResenhas(teamId) : [] };
  },
  aplicar: (snapshot, valor) => ({
    ...snapshot,
    matchDiaryEntries: valor.matchDiaryEntries,
  }),
});

function comResenhas(base: AppRepository): AppRepository {
  return {
    ...base,

    async createMatchDiaryEntry(input) {
      const resenha = await criarResenha(await exigirTimeAtivo(), input);
      await fatiaDasResenhas.recarregar();
      return resenha;
    },

    async updateMatchDiaryEntry(entryId, input) {
      const resenha = await atualizarResenha(entryId, input);
      await fatiaDasResenhas.recarregar();
      return resenha;
    },

    async deleteMatchDiaryEntry(entryId) {
      await apagarResenha(entryId);
      await fatiaDasResenhas.recarregar();
    },
  };
}

// ── Montagem ───────────────────────────────────────────────────────────────

const CAMADAS = [
  { modulo: 'financeiro', aplicar: comFinanceiro },
  { modulo: 'resenhas', aplicar: comResenhas },
] as const;

/**
 * Empilha as camadas dos módulos ligados e costura o snapshot.
 *
 * A leitura e o tempo real são tratados uma vez só, no fim: qualquer módulo
 * novo entra na lista acima sem repetir esta parte.
 */
export function comModulosNoSupabase(base: AppRepository): AppRepository {
  const ligados = CAMADAS.filter((camada) => moduloUsaSupabase(camada.modulo));

  if (ligados.length === 0) {
    return base;
  }

  const composto = ligados.reduce<AppRepository>(
    (atual, camada) => camada.aplicar(atual),
    base,
  );

  const comSnapshot: AppRepository = {
    ...composto,

    async getSnapshot() {
      const [snapshot] = await Promise.all([
        base.getSnapshot(),
        Promise.all(fatiasPendentes().map((fatia) => fatia.obter())),
      ]);

      return aplicarTodasAsFatias(snapshot);
    },
  };

  if (base.subscribeSnapshot) {
    comSnapshot.subscribeSnapshot = async (currentUserId, handlers) =>
      await base.subscribeSnapshot!(currentUserId, {
        ...handlers,
        onSnapshot: (snapshot) => {
          registrarEmissao(snapshot, handlers.onSnapshot);
          handlers.onSnapshot(aplicarTodasAsFatias(snapshot));

          const pendentes = fatiasPendentes();

          if (pendentes.length > 0) {
            // A primeira emissão sai sem os módulos do Postgres; assim que
            // chegam, o app é avisado de novo. Melhor uma aba aparecer um
            // instante depois do que segurar a tela inteira esperando por ela.
            void Promise.all(pendentes.map((fatia) => fatia.obter())).then(() => {
              handlers.onSnapshot(aplicarTodasAsFatias(snapshot));
            });
          }
        },
      });
  }

  return comSnapshot;
}
