/**
 * Camada de elenco: jogadores, vínculos e o contexto da sessão.
 *
 * É a última a migrar porque `team_members` é lido pelo bootstrap — a resposta
 * de "quem é você, de que time, com que permissão". Mover isso significa mover
 * `users` e `teams` junto, e por isso este módulo fecha a virada.
 *
 * Em troca, apaga quatro rotinas de reparo do índice espelhado do Firestore.
 */

import { createDefaultTeamRatingCriteria } from '@/lib/rating-criteria';
import { criarCriteriosPadrao } from '@/services/repository/supabase/avaliacoes';
import { exigirTimeAtivo } from '@/services/repository/supabase/composicao/comum';
import {
  apagarJogadorDeVez,
  atualizarJogador,
  atualizarTime,
  buscarContextoDaSessao,
  buscarJogadores,
  CONTEXTO_VAZIO,
  criarJogador,
  criarTime,
  definirCustoPadraoDoTime,
  definirTimeAtivo,
  desvincularConta,
  entrarComCodigo,
  gerarNovoCodigoDeConvite,
  inativarJogador,
  reativarJogador,
} from '@/services/repository/supabase/elenco';
import { criarErroDoRepositorio } from '@/services/repository/supabase/erros';
import { criarFatia } from '@/services/repository/supabase/fatias';
import type { AppRepository } from '@/services/repository/types';

/**
 * Contexto e elenco na mesma fatia.
 *
 * Vêm juntos porque a tela não serve para nada com um sem o outro: sem o
 * vínculo não se sabe o time, sem o time não há elenco.
 */
export const fatiaDoElenco = criarFatia({
  nome: 'elenco',
  vazio: { ...CONTEXTO_VAZIO, players: [] },
  async ler() {
    const contexto = await buscarContextoDaSessao();
    const ativo = contexto.user?.activeTeamId ?? null;

    return {
      ...contexto,
      players: ativo ? await buscarJogadores(ativo) : [],
    };
  },
  aplicar: (snapshot, valor) => ({
    ...snapshot,
    users: valor.user ? [valor.user] : snapshot.users,
    teams: valor.teams.length > 0 ? valor.teams : snapshot.teams,
    teamMembers: valor.teamMembers,
    players: valor.players,
  }),
});

/** Converte o input do contrato para as colunas do Postgres. */
function mudancasDoJogador(input: Record<string, unknown>): Record<string, unknown> {
  const mapa: Record<string, string> = {
    fullName: 'full_name',
    nickname: 'nickname',
    photoUrl: 'photo_url',
    presentationVideoUrl: 'presentation_video_url',
    introVideoUrl: 'intro_video_url',
    celebrationVideoUrl: 'celebration_video_url',
    jerseyNumber: 'jersey_number',
    primaryPosition: 'primary_position',
    secondaryPositions: 'secondary_positions',
    preferredPosition: 'preferred_position',
    dominantFoot: 'dominant_foot',
    status: 'status',
    bio: 'bio',
    allowSelfEditJerseyNumber: 'allow_self_edit_jersey_number',
    manualStats: 'manual_stats',
    feeExemption: 'fee_exemption',
    linkedUserId: 'linked_user_id',
  };

  const mudancas: Record<string, unknown> = {};

  for (const [campo, coluna] of Object.entries(mapa)) {
    if (input[campo] !== undefined) {
      mudancas[coluna] = input[campo];
    }
  }

  // E-mail sempre em minúsculas: a resolução por e-mail compara normalizado, e
  // cadastro com maiúscula já deixou gente sem conseguir votar.
  if (input.linkedEmail !== undefined) {
    const email = typeof input.linkedEmail === 'string' ? input.linkedEmail.trim() : '';
    mudancas.linked_email = email ? email.toLowerCase() : null;
  }

  return mudancas;
}

export function comElenco(base: AppRepository): AppRepository {
  return {
    ...base,

    async createTeam(input) {
      const time = await criarTime(input);

      // Os critérios padrão entram aqui, depois da RPC, porque agora o vínculo
      // de admin já existe e a policy `rating_criteria_write` deixa inserir.
      //
      // Se falhar, o time continua de pé: dá para criar os critérios na tela de
      // configuração. Derrubar a criação inteira por causa disso seria pior.
      try {
        await criarCriteriosPadrao(
          createDefaultTeamRatingCriteria(time.id, new Date().toISOString()),
        );
      } catch (erro) {
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          console.warn('[supabase] criterios padrao do time novo falharam', erro);
        }
      }

      await fatiaDoElenco.recarregar();
      return time;
    },

    async updateTeam(teamId, input) {
      const time = await atualizarTime(teamId, input as unknown as Record<string, unknown>);
      await fatiaDoElenco.recarregar();
      return time;
    },

    async setTeamDefaultMatchCost(teamId, defaultMatchCostCents) {
      // A permissão é da policy `teams_update` (`can_manage_team`). O que o
      // banco não sabe é o formato: centavos inteiros e não negativos.
      if (
        defaultMatchCostCents != null &&
        (!Number.isInteger(defaultMatchCostCents) || defaultMatchCostCents < 0)
      ) {
        throw criarErroDoRepositorio(
          'Informe um valor padrão em centavos maior ou igual a zero.',
          'failed-precondition',
        );
      }

      const time = await definirCustoPadraoDoTime(teamId, defaultMatchCostCents);
      await fatiaDoElenco.recarregar();
      return time;
    },

    async regenerateTeamInviteCode(teamId) {
      const time = await gerarNovoCodigoDeConvite(teamId);
      await fatiaDoElenco.recarregar();
      return time;
    },

    async createPlayer(input) {
      const jogador = await criarJogador(input.teamId, input as unknown as Record<string, unknown>);
      await fatiaDoElenco.recarregar();
      return jogador;
    },

    async updatePlayer(playerId, input) {
      const jogador = await atualizarJogador(
        playerId,
        mudancasDoJogador(input as unknown as Record<string, unknown>),
      );
      await fatiaDoElenco.recarregar();
      return jogador;
    },

    async unlinkPlayerAccount(playerId) {
      const jogador = await desvincularConta(playerId);
      await fatiaDoElenco.recarregar();
      return jogador;
    },

    async removePlayer(playerId) {
      // Inativa, não apaga: o histórico de jogos e estatísticas continua de pé,
      // e o ranking não perde os jogos em que a pessoa participou.
      const jogador = await inativarJogador(playerId);
      await fatiaDoElenco.recarregar();
      return jogador;
    },

    async reactivatePlayer(playerId) {
      const jogador = await reativarJogador(playerId);
      await fatiaDoElenco.recarregar();
      return jogador;
    },

    async deletePlayerPermanently(playerId) {
      await apagarJogadorDeVez(playerId);
      await fatiaDoElenco.recarregar();
    },

    async setActiveTeam(teamId) {
      const usuario = await definirTimeAtivo(teamId);

      // Trocar de time muda tudo que a tela mostra: o elenco é de outro time,
      // e as demais fatias precisam ser relidas junto.
      await fatiaDoElenco.recarregar();
      return usuario;
    },

    async joinTeamWithInviteCode(inviteCode) {
      const { vinculo, jaEraMembro } = await entrarComCodigo(inviteCode);

      // Entrar num time já o deixa ativo: é o que a pessoa quer ver a seguir.
      if (!jaEraMembro) {
        await definirTimeAtivo(vinculo.teamId);
      }

      await fatiaDoElenco.recarregar();

      return {
        alreadyMember: jaEraMembro,
        playerLink: {
          status: vinculo.playerId ? ('linked' as const) : ('unresolved' as const),
          playerId: vinculo.playerId ?? null,
        },
      } as Awaited<ReturnType<AppRepository['joinTeamWithInviteCode']>>;
    },
  };
}

export { exigirTimeAtivo };
