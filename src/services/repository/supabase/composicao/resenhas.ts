/**
 * Camada de resenhas.
 *
 * Substitui só os métodos deste módulo; o resto continua vindo do Firestore
 * sem saber que algo mudou.
 */

import { exigirTimeAtivo } from '@/services/repository/supabase/composicao/comum';
import { criarFatia } from '@/services/repository/supabase/fatias';
import type { AppRepository } from '@/services/repository/types';
import {
  apagarResenha,
  atualizarResenha,
  buscarResenhas,
  criarResenha,
} from '@/services/repository/supabase/resenhas';
import { buscarTimeAtivo } from '@/services/repository/supabase/composicao/comum';

// ── Resenhas ───────────────────────────────────────────────────────────────

export const fatiaDasResenhas = criarFatia({
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

export function comResenhas(base: AppRepository): AppRepository {
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

