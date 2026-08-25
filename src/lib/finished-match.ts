/**
 * Regras de registrar um jogo que já aconteceu.
 *
 * Extraído quando o Postgres precisou das mesmas validações. Elas já viviam
 * duplicadas entre `firebase-repository` e `mock-repository`; uma terceira
 * cópia garantiria que as três divergissem — e a que fica para trás é sempre a
 * que valida o dado de verdade.
 *
 * O erro vem por parâmetro porque cada repositório tem o seu formato: o
 * Firestore precisa de `failed-precondition` para a tela mostrar a mensagem em
 * vez de "erro inesperado", e o Postgres tem a própria fábrica.
 */

import type { MatchType, Player } from '@/types/domain';
import type { RegisterFinishedMatchPlayerInput } from '@/types/match-import';

/**
 * Jogadores de linha por modalidade, sem contar o goleiro.
 *
 * Só vale quando o cadastro não informa: é palpite para não travar o
 * formulário, e o admin corrige depois se o jogo foi diferente.
 */
export function jogadoresDeLinhaPadrao(matchType: MatchType): number {
  switch (matchType) {
    case 'futsal':
      return 4;
    case 'field':
      return 10;
    case 'society':
    case 'training':
    default:
      return 6;
  }
}

export interface JogadorResolvidoDaPartida extends RegisterFinishedMatchPlayerInput {
  player: Player;
  started: boolean;
}

export function resolverJogadoresDoJogoAntigo(input: {
  players: RegisterFinishedMatchPlayerInput[];
  teamPlayers: Player[];
  teamScore: number;
  criarErro: (mensagem: string) => Error;
}): JogadorResolvidoDaPartida[] {
  const { criarErro } = input;

  if (input.players.length === 0) {
    throw criarErro('Informe pelo menos um jogador para registrar a partida.');
  }

  const jogadoresPorId = new Map(input.teamPlayers.map((player) => [player.id, player]));
  const jaUsados = new Set<string>();

  const resolvidos = input.players.map<JogadorResolvidoDaPartida>((item) => {
    const player = jogadoresPorId.get(item.playerId);

    if (!player) {
      throw criarErro('Todos os jogadores precisam pertencer ao time atual.');
    }

    if (jaUsados.has(item.playerId)) {
      throw criarErro('Não repita o mesmo jogador mais de uma vez na partida.');
    }

    if (item.goals < 0 || item.assists < 0) {
      throw criarErro('Gols e assistências não podem ser negativos.');
    }

    if (!item.played && (item.goals > 0 || item.assists > 0)) {
      throw criarErro('Um jogador marcado como ausente não pode receber estatísticas.');
    }

    jaUsados.add(item.playerId);

    // Quem jogou é titular por padrão: no jogo antigo ninguém lembra quem
    // entrou depois, e obrigar a marcar travaria o cadastro.
    return { ...item, player, started: item.started ?? item.played };
  });

  const queJogaram = resolvidos.filter((item) => item.played);

  if (queJogaram.length === 0) {
    throw criarErro('A partida precisa ter pelo menos um jogador participante.');
  }

  const totalDeGols = queJogaram.reduce((soma, item) => soma + item.goals, 0);

  if (totalDeGols > input.teamScore) {
    throw criarErro('A soma de gols dos jogadores não pode ultrapassar o placar do time.');
  }

  return resolvidos;
}

/** Validações do cabeçalho da partida, independentes do elenco. */
export function validarCabecalhoDoJogoAntigo(input: {
  opponentName: string;
  teamScore: number;
  opponentScore: number;
  linePlayersCount?: number | null;
  criarErro: (mensagem: string) => Error;
}): string {
  const adversario = input.opponentName.trim();

  if (!adversario) {
    throw input.criarErro('Informe o adversario da partida.');
  }

  if (input.teamScore < 0 || input.opponentScore < 0) {
    throw input.criarErro('O placar não pode ter números negativos.');
  }

  if (
    input.linePlayersCount != null &&
    (input.linePlayersCount < 1 || input.linePlayersCount > 15)
  ) {
    throw input.criarErro('A quantidade de jogadores de linha precisa ficar entre 1 e 15.');
  }

  return adversario;
}
