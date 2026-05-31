import type { MatchDiaryEntry, MatchDiaryMood } from '@/types/domain';

export const MATCH_DIARY_TITLE_MAX_LENGTH = 80;
export const MATCH_DIARY_CONTENT_MAX_LENGTH = 1000;

export const MATCH_DIARY_MOOD_OPTIONS: Array<{
  value: MatchDiaryMood;
  label: string;
  emoji: string;
}> = [
  { value: 'highlight', label: 'Destaque', emoji: '🏆' },
  { value: 'funny', label: 'Resenha', emoji: '🔥' },
  { value: 'warning', label: 'Alerta', emoji: '⚠️' },
  { value: 'praise', label: 'Elogio', emoji: '👏' },
  { value: 'neutral', label: 'Geral', emoji: '📝' },
];

const fallbackMoodMeta = {
  value: 'neutral',
  label: 'Geral',
  emoji: '📝',
} satisfies {
  value: MatchDiaryMood;
  label: string;
  emoji: string;
};

export function getMatchDiaryMoodMeta(mood?: MatchDiaryMood | null) {
  if (!mood) {
    return fallbackMoodMeta;
  }

  return (
    MATCH_DIARY_MOOD_OPTIONS.find((item) => item.value === mood) ??
    fallbackMoodMeta
  );
}

const moodEmojiByValue = MATCH_DIARY_MOOD_OPTIONS.reduce<Record<MatchDiaryMood, string>>(
  (acc, item) => {
    acc[item.value] = item.emoji;
    return acc;
  },
  {
    funny: '🔥',
    highlight: '🏆',
    warning: '⚠️',
    praise: '👏',
    neutral: '📝',
  },
);

export function normalizeDiaryTitle(title?: string | null) {
  const trimmed = title?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeDiaryContent(content: string) {
  return content.trim();
}

export function resolveDiaryEmoji(
  mood?: MatchDiaryMood | null,
  emoji?: string | null,
) {
  const trimmedEmoji = emoji?.trim() ?? '';

  if (trimmedEmoji.length > 0) {
    return trimmedEmoji;
  }

  if (!mood) {
    return null;
  }

  return moodEmojiByValue[mood] ?? null;
}

export function validateDiaryFields(input: {
  title?: string | null;
  content: string;
}) {
  const title = normalizeDiaryTitle(input.title);
  const content = normalizeDiaryContent(input.content);

  if (!content) {
    throw new Error('Escreva a resenha da partida antes de publicar.');
  }

  if (content.length > MATCH_DIARY_CONTENT_MAX_LENGTH) {
    throw new Error(
      `A resenha pode ter no maximo ${MATCH_DIARY_CONTENT_MAX_LENGTH} caracteres.`,
    );
  }

  if (title && title.length > MATCH_DIARY_TITLE_MAX_LENGTH) {
    throw new Error(
      `O titulo pode ter no maximo ${MATCH_DIARY_TITLE_MAX_LENGTH} caracteres.`,
    );
  }

  return {
    title,
    content,
  };
}

export function sortMatchDiaryEntries(entries: MatchDiaryEntry[]) {
  return [...entries].sort((left, right) => {
    const pinnedOrder = Number(Boolean(right.pinned)) - Number(Boolean(left.pinned));

    if (pinnedOrder !== 0) {
      return pinnedOrder;
    }

    return (
      right.updatedAt.localeCompare(left.updatedAt) ||
      right.createdAt.localeCompare(left.createdAt)
    );
  });
}
