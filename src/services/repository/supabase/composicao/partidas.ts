/**
 * Camada de partidas: liga o contrato do app às funções do Postgres.
 *
 * As quatro tabelas (`matches`, `attendance`, `lineups`, `match_stats`) migram
 * juntas porque o `finishMatch` grava partida e estatística numa operação só.
 *
 * O que continua no Firestore: as **notificações**. Já eram best-effort —
 * encerrar a partida não pode falhar porque o aviso falhou.
 */

import { splitEqualCents } from '@/lib/expenses';
import { amountFromCents } from '@/lib/money';
import { exigirTimeAtivo } from '@/services/repository/supabase/composicao/comum';
import { criarFatia } from '@/services/repository/supabase/fatias';
import {
  apagarPartida,
  atualizarPartida,
  buscarPartidas,
  criarPartida,
  definirMvpManual,
  definirPresenca,
  encerrarPartida,
  salvarCustoDoCampo,
  salvarEscalacao,
  salvarEstatistica,
  PARTIDAS_VAZIAS,
} from '@/services/repository/supabase/partidas';
import type { AppRepository } from '@/services/repository/types';

export const fatiaDePartidas = criarFatia({
  nome: 'partidas',
  vazio: PARTIDAS_VAZIAS,
  async ler() {
    const teamId = await exigirTimeAtivo();
    return await buscarPartidas(teamId);
  },
  aplicar: (snapshot, valor) => ({
    ...snapshot,
    matches: valor.matches,
    attendance: valor.attendance,
    lineups: valor.lineups,
    matchStats: valor.matchStats,
  }),
});

/**
 * Quem entra na lista de presença de uma partida nova.
 *
 * Só jogador ativo e não apagado. Incluir inativo encheria a lista de gente que
 * não joga mais, e o admin teria que ignorar linha por linha.
 */
function jogadoresParaConvocar(fatia: { players?: { id: string; status: string; deletedAt?: string | null }[] }) {
  return (fatia.players ?? [])
    .filter((jogador) => !jogador.deletedAt && jogador.status !== 'inactive')
    .map((jogador) => jogador.id);
}

export function comPartidas(base: AppRepository): AppRepository {
  return {
    ...base,

    async createMatch(input, creatorUserId) {
      const snapshot = await base.getSnapshot();

      const partida = await criarPartida({
        teamId: input.teamId,
        actorUserId: creatorUserId,
        date: input.date,
        time: input.time,
        venue: input.venue,
        locationUrl: input.locationUrl,
        opponentName: input.opponentName,
        opponentLogoUrl: input.opponentLogoUrl,
        opponentTeamId: input.opponentTeamId,
        opponentTeamName: input.opponentTeamName,
        opponentTeamLogoUrl: input.opponentTeamLogoUrl,
        opponentSource: input.opponentSource,
        linePlayersCount: input.linePlayersCount,
        matchType: input.matchType,
        notes: input.notes,
        seasonId: input.seasonId,
        playerIds: jogadoresParaConvocar({
          players: snapshot.players.filter((jogador) => jogador.teamId === input.teamId),
        }),
      });

      await fatiaDePartidas.recarregar();
      return partida;
    },

    async updateMatch(matchId, input) {
      const partida = await atualizarPartida(matchId, {
        date: input.date,
        time: input.time,
        venue: input.venue,
        location_url: input.locationUrl,
        opponent_name: input.opponentName,
        opponent_logo_url: input.opponentLogoUrl,
        line_players_count: input.linePlayersCount,
        match_type: input.matchType,
        notes: input.notes,
        season_id: input.seasonId,
      });

      await fatiaDePartidas.recarregar();
      return partida;
    },

    async updateMatchMetadata(matchId, input) {
      await atualizarPartida(matchId, {
        date: input.date,
        time: input.time,
        venue: input.venue,
        location_url: input.locationUrl,
        match_type: input.matchType,
      });

      await fatiaDePartidas.recarregar();
    },

    async finishMatch(input, actorUserId) {
      const partida = await encerrarPartida({
        matchId: input.matchId,
        scoreboard: {
          team: input.teamScore,
          opponent: input.opponentScore,
          ownGoalsForTeam: input.ownGoalsForTeam ?? 0,
          result:
            input.teamScore > input.opponentScore
              ? 'win'
              : input.teamScore < input.opponentScore
                ? 'loss'
                : 'draw',
        },
        // O formulário de encerramento só coleta gol, assistência e se jogou.
        // Cartão e observação existem no banco mas não são preenchidos aqui —
        // inventar zero é o correto: é o que o Firestore já grava hoje.
        stats: input.playerStats.map((stat) => ({
          playerId: stat.playerId,
          played: stat.played ?? true,
          goals: stat.goals ?? 0,
          assists: stat.assists ?? 0,
          yellowCards: 0,
          redCards: 0,
        })),
      });

      // O custo do campo vem no mesmo formulário, mas é outra tabela.
      if (input.fieldCost && input.fieldCost.totalAmount > 0) {
        const divisao = Math.max(1, input.fieldCost.splitCount || 1);
        const porPessoa = splitEqualCents(
          Math.round(input.fieldCost.totalAmount * 100),
          divisao,
        );

        await salvarCustoDoCampo({
          matchId: input.matchId,
          totalAmount: input.fieldCost.totalAmount,
          splitCount: divisao,
          amountPerPlayer: amountFromCents(porPessoa[0] ?? 0),
          note: input.fieldCost.note,
          actorUserId,
        });
      }

      await fatiaDePartidas.recarregar();
      return partida;
    },

    async updateFinishedMatchStats(input, actorUserId) {
      // Mesma operação do encerramento: substitui o conjunto de estatísticas.
      return await this.finishMatch(input, actorUserId);
    },

    async deleteMatch(matchId, actorUserId) {
      await apagarPartida(matchId, actorUserId);
      await fatiaDePartidas.recarregar();
    },

    async setManualMvp(matchId, playerId, actorUserId) {
      const partida = await definirMvpManual(matchId, playerId, actorUserId);
      await fatiaDePartidas.recarregar();
      return partida;
    },

    async updateAttendance(input, actorUserId) {
      const teamId = await exigirTimeAtivo();

      const presenca = await definirPresenca({
        teamId,
        matchId: input.matchId,
        playerId: input.playerId,
        status: input.status,
        userId: actorUserId,
      });

      await fatiaDePartidas.recarregar();
      return presenca;
    },

    async adminSetMatchAttendance(matchId, playerId, status) {
      const teamId = await exigirTimeAtivo();

      const presenca = await definirPresenca({ teamId, matchId, playerId, status });

      // Quem passou a constar como ausente não deve seguir com estatística de
      // jogo — senão continuaria no ranking sem ter jogado.
      if (status !== 'confirmed') {
        await salvarEstatistica({
          teamId,
          matchId,
          playerId,
          played: false,
        });
      }

      await fatiaDePartidas.recarregar();
      return presenca;
    },

    async saveLineup(input) {
      const teamId = await exigirTimeAtivo();

      const escalacao = await salvarEscalacao({
        teamId,
        matchId: input.matchId,
        formationKey: input.formationKey,
        starters: input.starters,
        benchPlayerIds: input.benchPlayerIds,
      });

      await fatiaDePartidas.recarregar();
      return escalacao;
    },
  };
}
