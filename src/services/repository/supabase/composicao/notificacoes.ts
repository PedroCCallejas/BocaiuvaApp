/**
 * Camada de notificações.
 *
 * Fecha a migração, e existe por um motivo concreto: com `partidas` no Postgres
 * e as notificações no Firestore, encerrar um jogo parou de gerar aviso. A
 * partida ia para um banco e o aviso para o outro, que não conhecia a partida —
 * sem erro, sem nada na tela.
 *
 * Quem cria os avisos de fim de jogo é a camada de partidas, que é onde o
 * evento acontece. Aqui ficam a leitura e o "marcar como lido".
 */

import { buscarTimeAtivo, exigirTimeAtivo } from '@/services/repository/supabase/composicao/comum';
import {
  buscarNotificacoes,
  marcarNotificacaoComoLida,
  marcarTodasComoLidas,
} from '@/services/repository/supabase/notificacoes';
import { criarFatia } from '@/services/repository/supabase/fatias';
import type { AppRepository } from '@/services/repository/types';

export const fatiaDeNotificacoes = criarFatia({
  nome: 'notificacoes',
  vazio: { notifications: [] },
  async ler() {
    const teamId = await buscarTimeAtivo();
    return { notifications: teamId ? await buscarNotificacoes(teamId) : [] };
  },
  aplicar: (snapshot, valor) => ({
    ...snapshot,
    notifications: valor.notifications,
  }),
});

export function comNotificacoes(base: AppRepository): AppRepository {
  return {
    ...base,

    async markNotificationAsRead(notificationId) {
      await marcarNotificacaoComoLida(notificationId);
      await fatiaDeNotificacoes.recarregar();
    },

    async markAllNotificationsAsRead() {
      await marcarTodasComoLidas(await exigirTimeAtivo());
      await fatiaDeNotificacoes.recarregar();
    },
  };
}
