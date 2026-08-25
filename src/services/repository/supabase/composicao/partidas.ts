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
import {
  buildMatchFieldCost,
  buildMatchFieldPayment,
  getMatchFieldPaymentSummary,
} from '@/lib/field-cost';
import {
  jogadoresDeLinhaPadrao,
  resolverJogadoresDoJogoAntigo,
  validarCabecalhoDoJogoAntigo,
} from '@/lib/finished-match';
import { calculateMatchResult } from '@/lib/match';
import { fatiaDoElenco } from '@/services/repository/supabase/composicao/elenco';
import { buscarJogadores } from '@/services/repository/supabase/elenco';
import { amountFromCents } from '@/lib/money';
import { exigirTimeAtivo } from '@/services/repository/supabase/composicao/comum';
import { criarErroDoRepositorio } from '@/services/repository/supabase/erros';
import { criarFatia } from '@/services/repository/supabase/fatias';
import {
  apagarPartida,
  atualizarPartida,
  buscarPartidaPorId,
  buscarPartidas,
  criarPartida,
  definirMvpManual,
  definirPresenca,
  encerrarPartida,
  limparCustoDoCampo,
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

    async previewLegacyMatchImport() {
      // A prévia só serve para a importação, e a importação está fora. Deixar a
      // prévia funcionando sozinha mostraria um plano que não dá para executar.
      throw criarErroDoRepositorio(
        'A importação de jogos antigos está temporariamente indisponível.',
        'failed-precondition',
      );
    },

    async importLegacyMatches() {
      // Importa dezenas de partidas de uma vez. Sem transação por cima do lote,
      // uma falha no meio deixaria metade do histórico dentro e metade fora —
      // e o admin sem saber onde parou.
      //
      // Registrar jogo antigo um a um continua funcionando e cobre o caso real.
      throw criarErroDoRepositorio(
        'A importação de jogos antigos está temporariamente indisponível. ' +
          'Use "Registrar jogo antigo" para lançar uma partida por vez.',
        'failed-precondition',
      );
    },

    async registerFinishedMatch(input, actorUserId) {
      const teamId = await exigirTimeAtivo();
      const fatia = await fatiaDoElenco.obter();
      const criarErro = (mensagem: string) =>
        criarErroDoRepositorio(mensagem, 'failed-precondition');

      const adversario = validarCabecalhoDoJogoAntigo({
        opponentName: input.opponentName,
        teamScore: input.teamScore,
        opponentScore: input.opponentScore,
        linePlayersCount: input.linePlayersCount,
        criarErro,
      });

      // Mesmas regras do Firestore, da lib compartilhada: jogador do time,
      // sem repetição, sem estatística para ausente, gols cabendo no placar.
      const jogadores = resolverJogadoresDoJogoAntigo({
        players: input.players,
        teamPlayers: fatia.players.filter((jogador) => jogador.teamId === teamId),
        teamScore: input.teamScore,
        criarErro,
      });

      const partida = await criarPartida({
        teamId,
        actorUserId,
        date: input.date,
        time: input.time ?? '',
        venue: input.venue ?? '',
        locationUrl: input.locationUrl ?? null,
        opponentName: adversario,
        opponentLogoUrl: input.opponentLogoUrl ?? null,
        linePlayersCount: input.linePlayersCount ?? jogadoresDeLinhaPadrao(input.matchType),
        matchType: input.matchType,
        notes: input.notes ?? null,
        seasonId: input.seasonId ?? null,
        playerIds: jogadores.map((item) => item.player.id),
      });

      // `criar_partida` cria a presença como 'pending'. Num jogo que já
      // aconteceu isso não faz sentido: quem entrou na lista jogou, quem não
      // entrou faltou.
      for (const item of jogadores) {
        await definirPresenca({
          teamId,
          matchId: partida.id,
          playerId: item.player.id,
          status: item.played ? 'confirmed' : 'absent',
          userId: item.player.linkedUserId ?? null,
        });
      }

      const encerrada = await encerrarPartida({
        matchId: partida.id,
        scoreboard: {
          team: input.teamScore,
          opponent: input.opponentScore,
          result: calculateMatchResult(input.teamScore, input.opponentScore),
        },
        stats: jogadores.map((item) => ({
          playerId: item.player.id,
          played: item.played,
          started: item.started,
          goals: item.goals,
          assists: item.assists,
          // O cadastro de jogo antigo não pede cartão nem observação: ninguém
          // lembra disso meses depois, e inventar zero é mais honesto do que
          // pedir para chutar.
          yellowCards: 0,
          redCards: 0,
          notes: null,
        })),
      });

      await fatiaDePartidas.recarregar();
      return encerrada;
    },

    async updateMatchFieldCost(matchId, input, actorUserId) {
      const atual = await buscarPartidaPorId(matchId);

      if (atual.deletedAt) {
        throw criarErroDoRepositorio(
          'Não é possível alterar o valor de uma partida excluída.',
          'failed-precondition',
        );
      }

      if (!input) {
        const semCusto = await limparCustoDoCampo(matchId);
        await fatiaDePartidas.recarregar();
        return semCusto;
      }

      // As contas moram em `field-cost.ts` e são as mesmas do Firestore. Refazer
      // a divisão aqui daria dois resultados possíveis para o mesmo campo.
      const custo = buildMatchFieldCost({
        values: input,
        updatedAt: new Date().toISOString(),
        updatedByUserId: actorUserId,
      });

      // Diminuir a divisão não pode deixar mais gente marcada como paga do que
      // cotas existentes — o rateio ficaria devendo a si mesmo.
      if (
        atual.fieldPayment &&
        getMatchFieldPaymentSummary(custo, atual.fieldPayment).totalPaidCount > custo.splitCount
      ) {
        throw criarErroDoRepositorio(
          'A nova divisão do campo não comporta a quantidade de pagantes já marcada.',
          'failed-precondition',
        );
      }

      const salva = await salvarCustoDoCampo({
        matchId,
        totalAmount: custo.totalAmount,
        splitCount: custo.splitCount,
        amountPerPlayer: custo.amountPerPlayer,
        note: custo.note,
        // O pagamento sobrevive à mudança de valor: quem já pagou continua
        // pago, e reescrever isso obrigaria o admin a remarcar todo mundo.
        pixKey: atual.fieldPayment?.pixKey ?? null,
        responsibleName: atual.fieldPayment?.responsibleName ?? null,
        paidGuestCount: atual.fieldPayment?.paidGuestCount ?? 0,
        payerPlayerIds: atual.fieldPayment?.payerPlayerIds ?? [],
        exemptPlayerIds: atual.fieldPayment?.exemptPlayerIds ?? [],
        actorUserId,
      });

      await fatiaDePartidas.recarregar();
      return salva;
    },

    async updateMatchFieldPayment(matchId, input, actorUserId) {
      const atual = await buscarPartidaPorId(matchId);

      if (!atual.fieldCost) {
        throw criarErroDoRepositorio(
          'Informe o valor do campo antes de controlar pagamentos.',
          'failed-precondition',
        );
      }

      if (!input.fieldPayment) {
        // Limpar o controle não apaga o valor do campo: são coisas diferentes.
        const semPagamento = await salvarCustoDoCampo({
          matchId,
          totalAmount: atual.fieldCost.totalAmount,
          splitCount: atual.fieldCost.splitCount,
          amountPerPlayer: atual.fieldCost.amountPerPlayer,
          note: atual.fieldCost.note,
          pixKey: null,
          responsibleName: null,
          paidGuestCount: 0,
          payerPlayerIds: [],
          exemptPlayerIds: [],
          actorUserId,
        });

        await fatiaDePartidas.recarregar();
        return semPagamento;
      }

      const fatia = await fatiaDePartidas.obter();
      const confirmados = fatia.attendance
        .filter((item) => item.matchId === matchId && item.status === 'confirmed')
        .map((item) => item.playerId);

      // Valida antes de gravar: só confirmado pode ser marcado, ninguém é pago
      // e isento ao mesmo tempo, e o total de pagantes cabe nas cotas.
      const pagamento = buildMatchFieldPayment({
        values: input.fieldPayment,
        fieldCost: atual.fieldCost,
        confirmedPlayerIds: confirmados,
        updatedAt: new Date().toISOString(),
        updatedByUserId: actorUserId,
      });

      const salvo = await salvarCustoDoCampo({
        matchId,
        totalAmount: atual.fieldCost.totalAmount,
        splitCount: atual.fieldCost.splitCount,
        amountPerPlayer: atual.fieldCost.amountPerPlayer,
        note: atual.fieldCost.note,
        pixKey: pagamento.pixKey,
        responsibleName: pagamento.responsibleName,
        paidGuestCount: pagamento.paidGuestCount,
        payerPlayerIds: pagamento.payerPlayerIds,
        exemptPlayerIds: pagamento.exemptPlayerIds,
        actorUserId,
      });

      await fatiaDePartidas.recarregar();
      return salvo;
    },

    async createMatch(input, creatorUserId) {
      // O elenco vem do banco, não do snapshot.
      //
      // Antes lia `base.getSnapshot().players`, e `base` é a pilha ABAIXO da
      // camada de elenco — nunca enxergou o Postgres. Enquanto o Firestore
      // ainda entregava jogadores, funcionava por acidente. No dia em que ele
      // parou de ler `players`, a lista virou vazia e a partida nasceu sem
      // ninguém convocado: o admin teve que marcar 14 pessoas na mão, e quem
      // ele esqueceu não apareceu nem como pendente.
      //
      // Ler direto da tabela não depende de ordem de camada. E é a mesma tabela
      // que a chave estrangeira de `attendance` exige.
      const elenco = await buscarJogadores(input.teamId);

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
        playerIds: jogadoresParaConvocar({ players: elenco }),
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
        stats: input.playerStats.map((stat) => ({
          playerId: stat.playerId,
          played: stat.played ?? true,
          goals: stat.goals ?? 0,
          assists: stat.assists ?? 0,
          yellowCards: stat.yellowCards ?? 0,
          redCards: stat.redCards ?? 0,
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
