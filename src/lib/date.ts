import type { Match } from '@/types/domain';

function parseIsoDateParts(value: string) {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return null;
  }

  const [, year, month, day] = match;
  const parsed = {
    year: Number(year),
    month: Number(month),
    day: Number(day),
  };

  if (
    Number.isNaN(parsed.year) ||
    Number.isNaN(parsed.month) ||
    Number.isNaN(parsed.day) ||
    parsed.month < 1 ||
    parsed.month > 12 ||
    parsed.day < 1 ||
    parsed.day > 31
  ) {
    return null;
  }

  const candidate = new Date(parsed.year, parsed.month - 1, parsed.day);
  if (
    candidate.getFullYear() !== parsed.year ||
    candidate.getMonth() !== parsed.month - 1 ||
    candidate.getDate() !== parsed.day
  ) {
    return null;
  }

  return parsed;
}

function parseBrDateParts(value: string) {
  const match = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);

  if (!match) {
    return null;
  }

  const [, day, month, year] = match;
  return parseIsoDateParts(`${year}-${month}-${day}`);
}

function parseTimeParts(value: string) {
  const match = value.trim().match(/^(\d{2}):(\d{2})$/);

  if (!match) {
    return null;
  }

  const [, hours, minutes] = match;
  const parsed = {
    hours: Number(hours),
    minutes: Number(minutes),
  };

  if (
    Number.isNaN(parsed.hours) ||
    Number.isNaN(parsed.minutes) ||
    parsed.hours < 0 ||
    parsed.hours > 23 ||
    parsed.minutes < 0 ||
    parsed.minutes > 59
  ) {
    return null;
  }

  return parsed;
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function toDateFromIso(isoDate: string, time?: string) {
  const dateParts = parseIsoDateParts(isoDate);

  if (!dateParts) {
    return null;
  }

  const timeParts = time ? parseTimeParts(time) : { hours: 0, minutes: 0 };
  if (!timeParts) {
    return null;
  }

  return new Date(
    dateParts.year,
    dateParts.month - 1,
    dateParts.day,
    timeParts.hours,
    timeParts.minutes,
    0,
    0,
  );
}

function toDateFromUnknown(value: string | Date) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const isoDate = parseIsoDateParts(value);
  if (isoDate) {
    return new Date(isoDate.year, isoDate.month - 1, isoDate.day, 0, 0, 0, 0);
  }

  const parsedDate = new Date(value);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
}

export function formatDateBR(value: string | Date) {
  const date = toDateFromUnknown(value);

  if (!date) {
    return '';
  }

  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

export function formatDateTimeBR(
  value:
    | string
    | Date
    | {
        date: string;
        time?: string | null;
      },
) {
  const date =
    typeof value === 'object' && !(value instanceof Date)
      ? toDateFromIso(value.date, value.time ?? '00:00')
      : toDateFromUnknown(value);

  if (!date) {
    return '';
  }

  return `${formatDateBR(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function parseDateBRToISO(value: string) {
  const parsed = parseBrDateParts(value);

  if (!parsed) {
    return null;
  }

  return `${parsed.year}-${pad(parsed.month)}-${pad(parsed.day)}`;
}

export function isValidTime(value: string) {
  return parseTimeParts(value) !== null;
}

export function matchDateTime(match: Pick<Match, 'date' | 'time'>) {
  return toDateFromIso(match.date, match.time) ?? new Date(Number.NaN);
}

export function formatMatchDate(match: Pick<Match, 'date' | 'time'>) {
  return formatDateBR(match.date);
}

export function formatMatchDateTime(match: Pick<Match, 'date' | 'time'>) {
  return formatDateTimeBR({
    date: match.date,
    time: match.time,
  });
}

export function isMatchInFuture(match: Pick<Match, 'date' | 'time'>) {
  return matchDateTime(match).getTime() >= Date.now();
}

export function sortMatchesByDate(matches: Match[]) {
  return [...matches].sort(
    (left, right) => matchDateTime(left).getTime() - matchDateTime(right).getTime(),
  );
}
