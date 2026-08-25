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
import { buscarMeuVinculo } from '@/services/repository/supabase/elenco';
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
 * A RLS confere de novo do lado do banco — aqui é só para montar a linha.
 */
async function meuJogador(): Promise<{ teamId: string; playerId: string }> {
  // Time e vínculo vêm do banco, não do snapshot.
  //
  // Lia de `base.getSnapshot()`, e `base` é a pilha ABAIXO do elenco — o
  // `activeTeamId` vinha da cópia do Firestore, que congelou na virada. Quem
  // trocasse de time votaria no time antigo, e o vínculo lido seria o errado.
  const teamId = await exigirTimeAtivo();
  const meu = await buscarMeuVinculo(teamId);

  if (!meu?.playerId) {
    throw criarErroDoRepositorio(
      'Vincule sua conta a um jogador do time para continuar.',
      'permission-denied',
    );
  }

  return { teamId, playerId: meu.playerId };
}

export function comAvaliacoes(base: AppRepository): AppRepository {
  return {
    ...base,

    async submitMvpVote(input) {
      const { teamId, playerId } = await meuJogador();

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
      const { teamId, playerId } = await meuJogador();

      // Os critérios vêm da própria fatia, não do `base`.
      //
      // `ratingCriteria` é desta camada, e o Firestore parou de ler essa
      // coleção — `base.getSnapshot()` devolvia lista vazia. A avaliação era
      // gravada com `criteriaSnapshot` vazio, ou seja: nota salva sem registro
      // de como foi composta. Silencioso e irrecuperável depois.
      const fatia = await fatiaDeAvaliacoes.obter();
      const ativos = fatia.ratingCriteria.filter(
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
      const fatia = await fatiaDeAvaliacoes.obter();

      // Entra no fim da lista, na ordem em que o admin criou. Contando pelo
      // `base` — que perdeu `ratingCriteria` — todo critério novo nascia com
      // ordem 0 e a tela embaralhava.
      const ordem = fatia.ratingCriteria.filter(
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
