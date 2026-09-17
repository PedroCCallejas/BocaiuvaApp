import { formatDateBR } from '@/lib/date';
import type { MatchFieldPayment, Team } from '@/types/domain';

export const MATCH_WEEKDAY_OPTIONS = [
  { value: 1, label: 'Segunda' },
  { value: 2, label: 'Terça' },
  { value: 3, label: 'Quarta' },
  { value: 4, label: 'Quinta' },
  { value: 5, label: 'Sexta' },
  { value: 6, label: 'Sábado' },
  { value: 7, label: 'Domingo' },
] as const;

function pad(value: number) {
  return String(value).padStart(2, '0');
}

export function localDateToIso(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function nextWeekdayDateIso(isoWeekday: number, from = new Date()) {
  if (!Number.isInteger(isoWeekday) || isoWeekday < 1 || isoWeekday > 7) {
    throw new Error('O dia da semana deve estar entre 1 e 7.');
  }

  const currentIsoWeekday = from.getDay() === 0 ? 7 : from.getDay();
  const difference = (isoWeekday - currentIsoWeekday + 7) % 7 || 7;
  const nextDate = new Date(
    from.getFullYear(),
    from.getMonth(),
    from.getDate() + difference,
    12,
  );

  return localDateToIso(nextDate);
}

export function buildNewMatchDefaults(
  team: Pick<Team, 'homeFieldName' | 'homeFieldLocationUrl' | 'defaultMatchWeekday'> | null,
  from = new Date(),
) {
  const date = team?.defaultMatchWeekday
    ? nextWeekdayDateIso(team.defaultMatchWeekday, from)
    : localDateToIso(from);

  return {
    date: formatDateBR(date),
    venue: team?.homeFieldName?.trim() || 'Campo principal',
    locationUrl: team?.homeFieldLocationUrl?.trim() || '',
  };
}

export function buildDefaultFieldPayment(
  team: Pick<Team, 'defaultPixKey' | 'defaultPaymentResponsibleName'> | null,
  payment?: MatchFieldPayment | null,
) {
  return {
    pixKey: payment?.pixKey ?? team?.defaultPixKey?.trim() ?? '',
    responsibleName:
      payment?.responsibleName ?? team?.defaultPaymentResponsibleName?.trim() ?? '',
  };
}
