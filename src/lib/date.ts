import type { Match } from '@/types/domain';

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
});

const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

export function matchDateTime(match: Pick<Match, 'date' | 'time'>) {
  return new Date(`${match.date}T${match.time}:00`);
}

export function formatMatchDate(match: Pick<Match, 'date' | 'time'>) {
  return dateFormatter.format(matchDateTime(match));
}

export function formatMatchDateTime(match: Pick<Match, 'date' | 'time'>) {
  return dateTimeFormatter.format(matchDateTime(match));
}

export function isMatchInFuture(match: Pick<Match, 'date' | 'time'>) {
  return matchDateTime(match).getTime() >= Date.now();
}

export function sortMatchesByDate(matches: Match[]) {
  return [...matches].sort(
    (left, right) => matchDateTime(left).getTime() - matchDateTime(right).getTime(),
  );
}
