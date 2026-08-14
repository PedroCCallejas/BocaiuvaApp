/**
 * Exclusão permanente de jogador.
 *
 * Serve para o cadastro criado errado — nome trocado, duplicado, teste. Não
 * serve para quem saiu do time: para esse caso existe a inativação, que
 * preserva gols, presenças e notas.
 *
 * Apagar um jogador com histórico deixaria súmulas apontando para um id que
 * não existe mais, e estatísticas antigas passariam a mentir. Por isso a
 * exclusão é bloqueada assim que aparece qualquer vínculo.
 */

import type {
  AttendanceRecord,
  Expense,
  Lineup,
  Match,
  MatchStat,
  MvpVote,
  PlayerRating,
} from '@/types/domain';

export interface PlayerDeletionBlocker {
  kind:
    | 'match-stats'
    | 'attendance'
    | 'mvp-votes'
    | 'ratings'
    | 'lineups'
    | 'field-payments'
    | 'expenses';
  count: number;
  label: string;
}

export interface PlayerDeletionCheck {
  allowed: boolean;
  blockers: PlayerDeletionBlocker[];
  /** Mensagem pronta para a tela quando a exclusão está bloqueada. */
  message: string | null;
}

export interface PlayerDeletionSources {
  matchStats?: MatchStat[];
  attendance?: AttendanceRecord[];
  mvpVotes?: MvpVote[];
  playerRatings?: PlayerRating[];
  lineups?: Lineup[];
  matches?: Match[];
  expenses?: Expense[];
}

function countLineupAppearances(lineups: Lineup[], playerId: string) {
  return lineups.filter(
    (lineup) =>
      lineup.starters?.some((node) => node.playerId === playerId) ||
      lineup.benchPlayerIds?.includes(playerId),
  ).length;
}

function countFieldPaymentAppearances(matches: Match[], playerId: string) {
  return matches.filter(
    (match) =>
      match.fieldPayment?.payerPlayerIds?.includes(playerId) ||
      match.fieldPayment?.exemptPlayerIds?.includes(playerId),
  ).length;
}

function countExpenseAppearances(expenses: Expense[], playerId: string) {
  return expenses.filter(
    (expense) =>
      !expense.deletedAt &&
      (expense.participantPlayerIds?.includes(playerId) ||
        expense.settledPlayerIds?.includes(playerId) ||
        expense.paidByPlayerId === playerId),
  ).length;
}

/**
 * O jogador pode ser apagado de vez? Devolve também o que impede, para a
 * tela explicar em vez de só recusar.
 */
export function checkPlayerDeletion(
  playerId: string,
  sources: PlayerDeletionSources,
): PlayerDeletionCheck {
  const {
    matchStats = [],
    attendance = [],
    mvpVotes = [],
    playerRatings = [],
    lineups = [],
    matches = [],
    expenses = [],
  } = sources;

  const candidates: PlayerDeletionBlocker[] = [
    {
      kind: 'match-stats',
      count: matchStats.filter((stat) => stat.playerId === playerId).length,
      label: 'súmula de partida',
    },
    {
      kind: 'attendance',
      // Presença `pending` é só o convite criado automaticamente quando o
      // jogador entra no elenco — não é histórico. Contá-la impediria apagar
      // justamente o cadastro recém-criado por engano, que é o caso de uso.
      count: attendance.filter(
        (record) => record.playerId === playerId && record.status !== 'pending',
      ).length,
      label: 'resposta de presença',
    },
    {
      kind: 'mvp-votes',
      count: mvpVotes.filter(
        (vote) => vote.targetPlayerId === playerId || vote.voterPlayerId === playerId,
      ).length,
      label: 'voto de MVP',
    },
    {
      kind: 'ratings',
      count: playerRatings.filter(
        (rating) => rating.targetPlayerId === playerId || rating.raterPlayerId === playerId,
      ).length,
      label: 'avaliação',
    },
    {
      kind: 'lineups',
      count: countLineupAppearances(lineups, playerId),
      label: 'escalação',
    },
    {
      kind: 'field-payments',
      count: countFieldPaymentAppearances(matches, playerId),
      label: 'controle de pagamento do campo',
    },
    {
      kind: 'expenses',
      count: countExpenseAppearances(expenses, playerId),
      label: 'despesa',
    },
  ];

  const blockers = candidates.filter((blocker) => blocker.count > 0);

  if (blockers.length === 0) {
    return { allowed: true, blockers: [], message: null };
  }

  const details = blockers
    .map((blocker) => {
      // Pluraliza o substantivo principal, não a última palavra:
      // "2 respostas de presença", não "2 resposta de presenças".
      const [head, ...rest] = blocker.label.split(' ');
      const pluralHead = blocker.count > 1 ? `${head}s` : head;
      return `${blocker.count} ${[pluralHead, ...rest].join(' ')}`;
    })
    .join(', ');

  return {
    allowed: false,
    blockers,
    message:
      `Esse jogador já tem histórico no time (${details}). ` +
      'Apagar o cadastro deixaria esses registros sem dono. Use "Inativar jogador" ' +
      'para tirá-lo do elenco preservando o histórico.',
  };
}
