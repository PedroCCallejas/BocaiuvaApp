/**
 * Camada de avaliações: voto de MVP, notas e critérios.
 *
 * Anda junto com partidas: as policies validam contra `matches` e `attendance`,
 * então voto e partida precisam estar no mesmo banco.
 */

import {
  buildRatingCriteriaSnapshot,
  calculateOverallFromCriteriaScores,
} from '@/lib/rating-criteria';
import { exigirTimeAtivo } from '@/services/repository/supabase/composicao/comum';
import {
  atualizarCriterio,
  avaliarJogador,
  buscarAvaliacoes,
  criarCriterio,
  desativarCriterio,
  recalcularMvpDaPartida,
  votarNoMvp,
  AVALIACOES_VAZIAS,
} from '@/services/repository/supabase/avaliacoes';
import { criarErroDoRepositorio } from '@/services/repository/supabase/erros';
import { criarFatia } from '@/services/repository/supabase/fatias';
import type { AppRepository } from '@/services/repository/types';

export const fatiaDeAvaliacoes = criarFatia({
  nome: 'avaliacoes',
  vazio: AVALIACOES_VAZIAS,
  async ler() {
    return await buscarAvaliacoes(await exigirTimeAtivo());
  },
  aplicar: (snapshot, valor) => ({
    ...snapshot,
    mvpVotes: valor.mvpVotes,
    playerRatings: valor.playerRatings,
    ratingCriteria: valor.ratingCriteria,
  }),
});

/**
 * Qual jogador é quem está usando o app.
 *
 * Vem do snapshot, que já traz o vínculo resolvido pela camada de elenco. A RLS
 * confere de novo do lado do banco — aqui é só para montar a linha.
 */
async function meuJogador(base: AppRepository): Promise<{ teamId: string; playerId: string }> {
  const snapshot = await base.getSnapshot();
  const teamId = snapshot.users[0]?.activeTeamId ?? null;
  const vinculo = snapshot.teamMembers.find((membro) => membro.teamId === teamId);

  if (!teamId || !vinculo?.playerId) {
    throw criarErroDoRepositorio(
      'Vincule sua conta a um jogador do time para continuar.',
      'permission-denied',
    );
  }

  return { teamId, playerId: vinculo.playerId };
}

export function comAvaliacoes(base: AppRepository): AppRepository {
  return {
    ...base,

    async submitMvpVote(input) {
      const { teamId, playerId } = await meuJogador(base);

      const voto = await votarNoMvp({
        teamId,
        matchId: input.matchId,
        voterPlayerId: playerId,
        targetPlayerId: input.targetPlayerId,
      });

      // Apuração na sequência, no mesmo banco. No Firestore isto era escrita
      // separada e best-effort, que falhava para jogador comum e mostrava erro
      // depois de o voto já ter entrado.
      await recalcularMvpDaPartida(input.matchId);
      await fatiaDeAvaliacoes.recarregar();

      return voto;
    },

    async submitPlayerRating(input) {
      const { teamId, playerId } = await meuJogador(base);
      const snapshot = await base.getSnapshot();

      const ativos = snapshot.ratingCriteria.filter(
        (criterio) => criterio.teamId === teamId && criterio.active,
      );
      const criteriaSnapshot = buildRatingCriteriaSnapshot(ativos);

      const avaliacao = await avaliarJogador({
        teamId,
        matchId: input.matchId,
        raterPlayerId: playerId,
        targetPlayerId: input.targetPlayerId,
        criteriaScores: input.criteriaScores,
        criteriaSnapshot,
        // A média é calculada com a mesma função do Firestore: critério
        // negativo inverte, e reimplementar aqui daria duas contas diferentes.
        overall: calculateOverallFromCriteriaScores({
          criteriaScores: input.criteriaScores,
          criteriaSnapshot,
        }),
      });

      await fatiaDeAvaliacoes.recarregar();
      return avaliacao;
    },

    async createRatingCriterion(input) {
      const teamId = await exigirTimeAtivo();
      const snapshot = await base.getSnapshot();

      // Entra no fim da lista, na ordem em que o admin criou.
      const ordem = snapshot.ratingCriteria.filter(
        (criterio) => criterio.teamId === teamId,
      ).length;

      const criterio = await criarCriterio(teamId, input, ordem);
      await fatiaDeAvaliacoes.recarregar();
      return criterio;
    },

    async updateRatingCriterion(criterionId, input) {
      const mudancas: Record<string, unknown> = {};

      if (input.label !== undefined) mudancas.label = input.label.trim();
      if (input.description !== undefined) mudancas.description = input.description;
      if (input.type !== undefined) mudancas.type = input.type;
      if (input.active !== undefined) mudancas.active = input.active;
      if (input.weight !== undefined && input.weight && input.weight > 0) {
        mudancas.weight = input.weight;
      }

      const criterio = await atualizarCriterio(criterionId, mudancas);
      await fatiaDeAvaliacoes.recarregar();
      return criterio;
    },

    async deleteRatingCriterion(criterionId) {
      // Desativa em vez de apagar: as avaliações antigas continuam explicáveis
      // e a contagem de uso não quebra.
      await desativarCriterio(criterionId);
      await fatiaDeAvaliacoes.recarregar();
    },
  };
}
