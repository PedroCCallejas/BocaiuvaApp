/**
 * Encaixa o financeiro do Supabase no repositório existente.
 *
 * Composição por cima, não edição: o `firebase-repository` não é tocado. Ele
 * sustenta o app inteiro hoje, e mexer nele para migrar um módulo colocaria os
 * outros quinze em risco sem necessidade.
 *
 * O que este arquivo faz é substituir oito métodos e a fatia financeira do
 * snapshot. Todo o resto continua vindo do Firestore, sem saber que algo mudou.
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
  criarErroDoRepositorio,
  traduzirErroDoPostgres,
} from '@/services/repository/supabase/erros';
import type { AppRepository, AppSnapshot } from '@/services/repository/types';
import type { Expense, ExpenseCategory } from '@/types/domain';

interface FatiaFinanceira {
  expenses: Expense[];
  expenseCategories: ExpenseCategory[];
}

const VAZIO: FatiaFinanceira = { expenses: [], expenseCategories: [] };

/**
 * Time ativo da pessoa autenticada.
 *
 * Vem do banco, não de estado guardado aqui. Guardar o time numa variável de
 * módulo criaria uma segunda fonte da verdade que sai de sincronia quando a
 * pessoa troca de time — e o sintoma seria despesa gravada no time errado.
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
    throw criarErroDoRepositorio(
      'Escolha um time antes de continuar.',
      'failed-precondition',
    );
  }

  return teamId;
}

/**
 * Lê a fatia financeira.
 *
 * Falha aqui não derruba o app: o financeiro é uma aba só, e ficar sem ela é
 * muito melhor do que a tela inicial não abrir. O erro aparece no console e o
 * resto do snapshot segue vindo do Firestore.
 */
async function lerFatiaFinanceira(): Promise<FatiaFinanceira> {
  try {
    const teamId = await buscarTimeAtivo();

    if (!teamId) {
      return VAZIO;
    }

    const [expenseCategories, expenses] = await Promise.all([
      buscarCategoriasDeDespesa(teamId),
      buscarDespesas(teamId),
    ]);

    return { expenses, expenseCategories };
  } catch (erro) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn('[supabase] financeiro indisponivel', erro);
    }

    return VAZIO;
  }
}

/**
 * Cache da fatia, invalidado a cada escrita.
 *
 * O snapshot é emitido a cada mudança que chega do Firestore — dezenas de
 * vezes numa sessão. Buscar o financeiro em toda emissão seria uma requisição
 * por emissão, para um dado que só muda quando o admin mexe nele.
 */
let fatiaEmCache: FatiaFinanceira | null = null;
let leituraEmVoo: Promise<FatiaFinanceira> | null = null;

/** Último snapshot do Firestore e para onde reemitir, quando o tempo real está ligado. */
let ultimoSnapshotBase: AppSnapshot | null = null;
let emitirParaOApp: ((snapshot: AppSnapshot) => void) | null = null;

async function obterFatia(): Promise<FatiaFinanceira> {
  if (fatiaEmCache) {
    return fatiaEmCache;
  }

  // Emissões em sequência não podem virar várias requisições iguais.
  leituraEmVoo ??= lerFatiaFinanceira().then((fatia) => {
    fatiaEmCache = fatia;
    leituraEmVoo = null;
    return fatia;
  });

  return await leituraEmVoo;
}

/**
 * Relê o financeiro e avisa a tela na hora.
 *
 * Só invalidar o cache não bastava: a fatia ficava nula e a próxima emissão
 * vinda do Firestore saía com o financeiro VAZIO — as despesas sumiam da tela
 * depois de marcar alguém como quitado, que foi exatamente o que apareceu no
 * teste.
 *
 * O tempo real é do Firestore e ele não tem como saber que o Postgres mudou.
 * Quem escreveu precisa avisar.
 */
async function recarregarFatia(): Promise<FatiaFinanceira> {
  leituraEmVoo = null;
  const fatia = await lerFatiaFinanceira();
  fatiaEmCache = fatia;

  if (ultimoSnapshotBase && emitirParaOApp) {
    emitirParaOApp(comFinanceiro(ultimoSnapshotBase, fatia));
  }

  return fatia;
}

function comFinanceiro(base: AppSnapshot, fatia: FatiaFinanceira): AppSnapshot {
  return { ...base, expenses: fatia.expenses, expenseCategories: fatia.expenseCategories };
}

/**
 * Devolve o repositório base com o financeiro apontando para o Postgres.
 *
 * Só os oito métodos e o snapshot mudam. `actorUserId` continua na assinatura
 * por causa do contrato, mas não é usado para autorizar: quem autoriza é a RLS,
 * lendo o JWT. Confiar num id vindo do cliente seria autorização de mentira.
 */
export function comFinanceiroNoSupabase(base: AppRepository): AppRepository {
  const composto: AppRepository = {
    ...base,

    async getSnapshot() {
      const [snapshot, fatia] = await Promise.all([base.getSnapshot(), obterFatia()]);
      return comFinanceiro(snapshot, fatia);
    },

    async createExpense(input, actorUserId) {
      const despesa = await criarDespesa(await exigirTimeAtivo(), input, actorUserId);
      await recarregarFatia();
      return despesa;
    },

    async updateExpense(expenseId, input) {
      const despesa = await atualizarDespesa(expenseId, input);
      await recarregarFatia();
      return despesa;
    },

    async deleteExpense(expenseId) {
      await apagarDespesa(expenseId);
      await recarregarFatia();
    },

    async setExpenseSettlement(expenseId, playerId, settled) {
      const despesa = await definirQuitacao(expenseId, playerId, settled);
      await recarregarFatia();
      return despesa;
    },

    async createExpenseCategory(input) {
      const categoria = await criarCategoria(await exigirTimeAtivo(), input);
      await recarregarFatia();
      return categoria;
    },

    async updateExpenseCategory(categoryId, input) {
      const categoria = await atualizarCategoria(categoryId, input);
      await recarregarFatia();
      return categoria;
    },

    async deleteExpenseCategory(categoryId) {
      await arquivarCategoria(categoryId);
      await recarregarFatia();
    },
  };

  // O tempo real continua sendo do Firestore. Cada emissão recebe a fatia
  // financeira do Postgres antes de chegar na tela — sem isso o app mostraria
  // o financeiro vazio a cada atualização vinda do outro banco.
  if (base.subscribeSnapshot) {
    composto.subscribeSnapshot = async (currentUserId, handlers) =>
      await base.subscribeSnapshot!(currentUserId, {
        ...handlers,
        onSnapshot: (snapshot) => {
          // Guardados para o reenvio depois de uma escrita no Postgres: o
          // tempo real do Firestore não tem como saber que o outro banco mudou.
          ultimoSnapshotBase = snapshot;
          emitirParaOApp = handlers.onSnapshot;

          handlers.onSnapshot(comFinanceiro(snapshot, fatiaEmCache ?? VAZIO));

          if (!fatiaEmCache) {
            // Primeira emissão sai sem o financeiro; assim que ele chega, o
            // app é avisado de novo. Melhor a aba aparecer um instante depois
            // do que segurar a tela inteira esperando por ela.
            void obterFatia().then((fatia) => {
              handlers.onSnapshot(comFinanceiro(snapshot, fatia));
            });
          }
        },
      });
  }

  return composto;
}

/** Só para teste: zera o cache e o destino do reenvio entre casos. */
export function limparCacheDoFinanceiro() {
  fatiaEmCache = null;
  leituraEmVoo = null;
  ultimoSnapshotBase = null;
  emitirParaOApp = null;
}
