import type { Match, Team } from '@/types/domain';
import type { PlayerAggregateStats, TeamAggregateStats } from '@/lib/stats';

export interface ProfessoTip {
  id: string;
  label: 'Dica do Professô' | 'Análise do Professô' | 'Recado do Professô';
  title: string;
  message: string;
}

interface AttendanceSummaryLike {
  confirmed: number;
  absent: number;
  pending: number;
}

interface BuildProfessoTipInput {
  team: Pick<Team, 'name'>;
  canManageTeam: boolean;
  teamStats: TeamAggregateStats;
  upcomingMatch?: Pick<Match, 'id' | 'date' | 'time' | 'opponentName' | 'linePlayersCount'> | null;
  upcomingAttendance?: AttendanceSummaryLike | null;
  finishedMatches: Pick<Match, 'date' | 'time' | 'scoreboard' | 'status'>[];
  playerStats: PlayerAggregateStats[];
}

function getUndefeatedStreak(matches: BuildProfessoTipInput['finishedMatches']) {
  const ordered = [...matches]
    .filter((match) => match.status === 'finished' && match.scoreboard)
    .sort((left, right) => `${left.date}T${left.time}`.localeCompare(`${right.date}T${right.time}`));

  let streak = 0;

  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    const result = ordered[index].scoreboard?.result;

    if (result === 'loss') {
      break;
    }

    if (result === 'win' || result === 'draw') {
      streak += 1;
    }
  }

  return streak;
}

function isMatchClose(match?: BuildProfessoTipInput['upcomingMatch'] | null) {
  if (!match) {
    return false;
  }

  const candidate = new Date(`${match.date}T${match.time || '00:00'}:00`);

  if (Number.isNaN(candidate.getTime())) {
    return false;
  }

  const distance = candidate.getTime() - Date.now();
  return distance >= 0 && distance <= 48 * 60 * 60 * 1000;
}

export function buildProfessoHomeTip(input: BuildProfessoTipInput): ProfessoTip | null {
  const topScorer = [...input.playerStats]
    .filter((item) => item.goals > 0)
    .sort((left, right) => right.goals - left.goals)[0];
  const undefeatedStreak = getUndefeatedStreak(input.finishedMatches);
  const confirmedCount = input.upcomingAttendance?.confirmed ?? 0;
  const pendingCount = input.upcomingAttendance?.pending ?? 0;
  const requiredPlayers = input.upcomingMatch?.linePlayersCount ?? 0;

  if (
    input.canManageTeam &&
    input.upcomingMatch &&
    isMatchClose(input.upcomingMatch) &&
    confirmedCount < Math.max(requiredPlayers, 6)
  ) {
    return {
      id: 'few-confirmations',
      label: 'Dica do Professô',
      title: 'Vale cobrar a resposta do elenco',
      message:
        pendingCount > 0
          ? `${pendingCount} jogador(es) ainda não responderam para o jogo contra ${input.upcomingMatch.opponentName}.`
          : `Ainda faltam confirmações para o jogo contra ${input.upcomingMatch.opponentName}.`,
    };
  }

  if (undefeatedStreak >= 3) {
    return {
      id: 'undefeated-run',
      label: 'Análise do Professô',
      title: `${input.team.name} vive boa fase`,
      message: `O time está invicto há ${undefeatedStreak} partida(s). Bom momento para manter o padrão.`,
    };
  }

  if (topScorer && topScorer.goals >= 3) {
    return {
      id: 'top-scorer',
      label: 'Recado do Professô',
      title: `${topScorer.player.nickname} está em destaque`,
      message: `${topScorer.player.nickname} já soma ${topScorer.goals} gol(s) e puxa a artilharia do time.`,
    };
  }

  if (input.teamStats.totalMatches === 0) {
    return {
      id: 'first-match',
      label: 'Dica do Professô',
      title: 'Hora de dar vida ao histórico',
      message: 'Quando as primeiras partidas forem encerradas, o app começa a mostrar destaques, médias e evolução do time.',
    };
  }

  if (input.upcomingMatch) {
    return {
      id: 'next-match',
      label: 'Recado do Professô',
      title: 'Próximo compromisso no radar',
      message: `A próxima missão já está marcada contra ${input.upcomingMatch.opponentName}. Bora deixar o elenco pronto.`,
    };
  }

  return null;
}
