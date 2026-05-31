import {
  DEFAULT_ACTIVE_RATING_CRITERIA_IDS,
  RATING_CRITERIA_LABELS,
  RATING_CRITERIA_ORDER,
  RATING_CRITERIA_TYPES,
} from '@/constants/options';
import type {
  LegacyRatingCriterionId,
  PlayerRating,
  PlayerRatingCriteriaSnapshotItem,
  RatingCriterionType,
  TeamRatingCriterion,
} from '@/types/domain';

export const MIN_ACTIVE_RATING_CRITERIA = 1;
export const MAX_ACTIVE_RATING_CRITERIA = 12;
export const MIN_RATING_SCORE = 1;
export const MAX_RATING_SCORE = 10;
export const DEFAULT_RATING_SCORE = 5;

const LEGACY_CRITERIA_DESCRIPTIONS: Partial<Record<LegacyRatingCriterionId, string>> = {
  dedicacao: 'Entrega e comprometimento com o time.',
  energia: 'Intensidade e disposicao durante a partida.',
  qualidade: 'Execucao tecnica e leitura do jogo.',
  decisivo: 'Capacidade de resolver lances importantes.',
  preciosismo: 'Excesso de enfeite ou demora na jogada.',
  reclamacao: 'Reclamacao com arbitragem ou companheiros.',
  fominha: 'Dificuldade em soltar a bola na hora certa.',
  marra: 'Postura que atrapalha o coletivo.',
};

const LEGACY_ENGLISH_CRITERIA_ALIASES = {
  attack: {
    label: 'Ataque',
    type: 'positive',
    order: 0,
  },
  defense: {
    label: 'Defesa',
    type: 'positive',
    order: 1,
  },
  finishing: {
    label: 'Finalizacao',
    type: 'positive',
    order: 2,
  },
  passing: {
    label: 'Passe',
    type: 'positive',
    order: 3,
  },
  stamina: {
    label: 'Energia',
    type: 'positive',
    order: 4,
  },
  resistance: {
    label: 'Resistencia',
    type: 'positive',
    order: 5,
  },
  marking: {
    label: 'Marcacao',
    type: 'positive',
    order: 6,
  },
  flair: {
    label: 'Criatividade',
    type: 'positive',
    order: 7,
  },
  grit: {
    label: 'Raca',
    type: 'positive',
    order: 8,
  },
} satisfies Record<string, {
  label: string;
  type: RatingCriterionType;
  order: number;
}>;

function stripDiacritics(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function resolveLegacyEnglishCriterionAlias(value?: string | null) {
  if (!value) {
    return null;
  }

  const normalizedValue = stripDiacritics(value.trim())
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9]+/g, '-');

  return LEGACY_ENGLISH_CRITERIA_ALIASES[normalizedValue as keyof typeof LEGACY_ENGLISH_CRITERIA_ALIASES] ?? null;
}

function normalizeCriterionLabel(label: string) {
  const aliasLabel = resolveLegacyEnglishCriterionAlias(label)?.label ?? label;
  return stripDiacritics(aliasLabel.trim()).toLocaleLowerCase('pt-BR');
}

function getLegacyCriterionDisplayDefinition(input: {
  criterionId?: string | null;
  label?: string | null;
}) {
  const byId = resolveLegacyEnglishCriterionAlias(input.criterionId);
  if (byId) {
    return byId;
  }

  return resolveLegacyEnglishCriterionAlias(input.label);
}

function normalizeCriterionDisplayLabel(input: {
  criterionId?: string | null;
  label?: string | null;
  fallbackLabel?: string | null;
}) {
  const alias = getLegacyCriterionDisplayDefinition(input);
  if (alias) {
    return alias.label;
  }

  const trimmedLabel = input.label?.trim();
  if (trimmedLabel) {
    return trimmedLabel;
  }

  return input.fallbackLabel?.trim() || 'Criterio';
}

function round(value: number, digits = 1) {
  return Number(value.toFixed(digits));
}

function normalizeWeight(value?: number | null) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return 1;
  }

  return round(value, 2);
}

function normalizeOrder(value?: number | null, fallback = 0) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(0, Math.floor(value));
}

function clampScore(value: number) {
  return Math.max(MIN_RATING_SCORE, Math.min(MAX_RATING_SCORE, round(value, 1)));
}

export function isLegacyRatingCriterionId(
  criterionId: string,
): criterionId is LegacyRatingCriterionId {
  return RATING_CRITERIA_ORDER.includes(criterionId as LegacyRatingCriterionId);
}

export function buildLegacyRatingCriterionDefinition(
  criterionId: LegacyRatingCriterionId,
) {
  return {
    id: criterionId,
    label: RATING_CRITERIA_LABELS[criterionId],
    description: LEGACY_CRITERIA_DESCRIPTIONS[criterionId] ?? null,
    type: RATING_CRITERIA_TYPES[criterionId],
    weight: 1,
    active: DEFAULT_ACTIVE_RATING_CRITERIA_IDS.includes(criterionId),
    order: RATING_CRITERIA_ORDER.indexOf(criterionId),
  } satisfies Omit<TeamRatingCriterion, 'teamId' | 'createdAt' | 'updatedAt'>;
}

export function buildDefaultRatingCriterionId(
  teamId: string,
  criterionId: LegacyRatingCriterionId,
) {
  return `${teamId}__${criterionId}`;
}

export function normalizeTeamRatingCriterion(
  criterion: TeamRatingCriterion,
): TeamRatingCriterion {
  const legacyDefinition =
    typeof criterion.label === 'string'
      ? RATING_CRITERIA_ORDER.map((legacyCriterionId) => buildLegacyRatingCriterionDefinition(legacyCriterionId))
          .find(
            (item) => normalizeCriterionLabel(item.label) === normalizeCriterionLabel(criterion.label),
          ) ?? null
      : null;
  const legacyEnglishDefinition = getLegacyCriterionDisplayDefinition({
    criterionId: criterion.id,
    label: criterion.label,
  });

  return {
    ...criterion,
    label: normalizeCriterionDisplayLabel({
      criterionId: criterion.id,
      label: criterion.label,
      fallbackLabel: legacyDefinition?.label ?? legacyEnglishDefinition?.label ?? 'Criterio',
    }),
    description: criterion.description?.trim() || null,
    type: criterion.type ?? legacyDefinition?.type ?? legacyEnglishDefinition?.type ?? 'positive',
    weight: normalizeWeight(criterion.weight),
    active: criterion.active !== false,
    order: normalizeOrder(
      criterion.order,
      legacyDefinition?.order ?? legacyEnglishDefinition?.order ?? 0,
    ),
  };
}

export function sortRatingCriteria(criteria: TeamRatingCriterion[]) {
  return [...criteria].sort((left, right) => {
    if (left.order !== right.order) {
      return left.order - right.order;
    }

    return left.label.localeCompare(right.label);
  });
}

export function normalizeRatingCriteriaOrder(criteria: TeamRatingCriterion[]) {
  return sortRatingCriteria(criteria).map((criterion, index) =>
    normalizeTeamRatingCriterion({
      ...criterion,
      order: index,
    }),
  );
}

export function getActiveRatingCriteria(criteria: TeamRatingCriterion[]) {
  return sortRatingCriteria(criteria).filter((criterion) => criterion.active);
}

export function createDefaultTeamRatingCriteria(
  teamId: string,
  timestamp: string,
) {
  return DEFAULT_ACTIVE_RATING_CRITERIA_IDS.map((criterionId, index) =>
    normalizeTeamRatingCriterion({
      id: buildDefaultRatingCriterionId(teamId, criterionId),
      teamId,
      label: RATING_CRITERIA_LABELS[criterionId],
      description: LEGACY_CRITERIA_DESCRIPTIONS[criterionId] ?? null,
      type: RATING_CRITERIA_TYPES[criterionId],
      weight: 1,
      active: true,
      order: index,
      createdAt: timestamp,
      updatedAt: timestamp,
    }),
  );
}

export function buildRatingCriteriaSnapshot(
  criteria: TeamRatingCriterion[],
): Record<string, PlayerRatingCriteriaSnapshotItem> {
  return sortRatingCriteria(criteria).reduce<Record<string, PlayerRatingCriteriaSnapshotItem>>(
    (acc, criterion) => {
      acc[criterion.id] = {
        criterionId: criterion.id,
        label: criterion.label,
        type: criterion.type,
        weight: normalizeWeight(criterion.weight),
        order: normalizeOrder(criterion.order),
      };
      return acc;
    },
    {},
  );
}

export function normalizeLegacyRatingScore(value: number) {
  if (!Number.isFinite(value)) {
    return DEFAULT_RATING_SCORE;
  }

  const normalized = 1 + (Math.max(0, Math.min(5, value)) / 5) * 9;
  return clampScore(normalized);
}

export function normalizeRatingCriteriaScores(
  rating: Pick<PlayerRating, 'criteriaScores' | 'criteria'>,
) {
  const normalizedScores = Object.entries(rating.criteriaScores ?? {}).reduce<Record<string, number>>(
    (acc, [criterionId, value]) => {
      if (typeof value === 'number' && Number.isFinite(value)) {
        acc[criterionId] = clampScore(value);
      }
      return acc;
    },
    {},
  );

  if (Object.keys(normalizedScores).length > 0) {
    return normalizedScores;
  }

  return Object.entries(rating.criteria ?? {}).reduce<Record<string, number>>(
    (acc, [criterionId, value]) => {
      if (typeof value === 'number' && Number.isFinite(value)) {
        acc[criterionId] = normalizeLegacyRatingScore(value);
      }
      return acc;
    },
    {},
  );
}

function fallbackSnapshotItem(
  criterionId: string,
  currentCriteria?: TeamRatingCriterion[],
): PlayerRatingCriteriaSnapshotItem {
  const teamCriterion = currentCriteria?.find((criterion) => criterion.id === criterionId);

  if (teamCriterion) {
    return {
      criterionId: teamCriterion.id,
      label: teamCriterion.label,
      type: teamCriterion.type,
      weight: normalizeWeight(teamCriterion.weight),
      order: normalizeOrder(teamCriterion.order),
    };
  }

  if (isLegacyRatingCriterionId(criterionId)) {
    const legacyDefinition = buildLegacyRatingCriterionDefinition(criterionId);
    return {
      criterionId: legacyDefinition.id,
      label: legacyDefinition.label,
      type: legacyDefinition.type,
      weight: legacyDefinition.weight,
      order: legacyDefinition.order,
    };
  }

  const legacyEnglishDefinition = getLegacyCriterionDisplayDefinition({
    criterionId,
  });

  if (legacyEnglishDefinition) {
    return {
      criterionId,
      label: legacyEnglishDefinition.label,
      type: legacyEnglishDefinition.type,
      weight: 1,
      order: legacyEnglishDefinition.order,
    };
  }

  return {
    criterionId,
    label: normalizeCriterionDisplayLabel({
      criterionId,
      label: criterionId,
      fallbackLabel: criterionId,
    }),
    type: 'positive',
    weight: 1,
    order: 999,
  };
}

export function normalizeRatingCriteriaSnapshot(
  rating: Pick<PlayerRating, 'criteriaScores' | 'criteria' | 'criteriaSnapshot'>,
  currentCriteria?: TeamRatingCriterion[],
) {
  const scores = normalizeRatingCriteriaScores(rating);
  const snapshot = Object.entries(rating.criteriaSnapshot ?? {}).reduce<
    Record<string, PlayerRatingCriteriaSnapshotItem>
  >((acc, [criterionId, item]) => {
    const fallbackItem = fallbackSnapshotItem(criterionId, currentCriteria);
    const legacyEnglishDefinition = getLegacyCriterionDisplayDefinition({
      criterionId,
      label: item?.label,
    });

    acc[criterionId] = {
      criterionId,
      label: normalizeCriterionDisplayLabel({
        criterionId,
        label: item?.label,
        fallbackLabel: fallbackItem.label,
      }),
      type: item?.type ?? legacyEnglishDefinition?.type ?? fallbackItem.type,
      weight: normalizeWeight(item?.weight),
      order: normalizeOrder(
        item?.order,
        legacyEnglishDefinition?.order ?? fallbackItem.order,
      ),
    };
    return acc;
  }, {});

  for (const criterionId of Object.keys(scores)) {
    if (!snapshot[criterionId]) {
      snapshot[criterionId] = fallbackSnapshotItem(criterionId, currentCriteria);
    }
  }

  return snapshot;
}

export function resolveCriterionDisplayKey(input: {
  criterionId: string;
  criterionSnapshot?: PlayerRatingCriteriaSnapshotItem | null;
  currentCriteria?: TeamRatingCriterion[];
}) {
  const normalizedSnapshotLabel = input.criterionSnapshot?.label
    ? normalizeCriterionLabel(input.criterionSnapshot.label)
    : null;
  const matchedCurrentCriterion =
    input.currentCriteria?.find((criterion) => {
      if (!normalizedSnapshotLabel) {
        return false;
      }

      return (
        normalizeCriterionLabel(criterion.label) === normalizedSnapshotLabel &&
        criterion.type === (input.criterionSnapshot?.type ?? criterion.type)
      );
    }) ?? null;

  if (matchedCurrentCriterion) {
    return matchedCurrentCriterion.id;
  }

  return input.criterionId;
}

export function resolveCriterionDisplaySnapshotItem(input: {
  criterionId: string;
  criterionSnapshot?: PlayerRatingCriteriaSnapshotItem | null;
  currentCriteria?: TeamRatingCriterion[];
}) {
  const displayKey = resolveCriterionDisplayKey(input);
  const matchedCurrentCriterion =
    input.currentCriteria?.find((criterion) => criterion.id === displayKey) ?? null;

  if (matchedCurrentCriterion) {
    return {
      displayKey,
      snapshot: {
        criterionId: matchedCurrentCriterion.id,
        label: matchedCurrentCriterion.label,
        type: matchedCurrentCriterion.type,
        weight: normalizeWeight(matchedCurrentCriterion.weight),
        order: normalizeOrder(matchedCurrentCriterion.order),
      } satisfies PlayerRatingCriteriaSnapshotItem,
    };
  }

  return {
    displayKey,
    snapshot:
      input.criterionSnapshot ??
      fallbackSnapshotItem(input.criterionId, input.currentCriteria),
  };
}

export function calculateOverallFromCriteriaScores(input: {
  criteriaScores: Record<string, number>;
  criteriaSnapshot: Record<string, PlayerRatingCriteriaSnapshotItem>;
}) {
  const entries = Object.entries(input.criteriaScores).filter(([, value]) =>
    typeof value === 'number' && Number.isFinite(value),
  );

  if (entries.length === 0) {
    return 0;
  }

  let weightedTotal = 0;
  let totalWeight = 0;

  for (const [criterionId, value] of entries) {
    const snapshotItem =
      input.criteriaSnapshot[criterionId] ?? fallbackSnapshotItem(criterionId);
    const weight = normalizeWeight(snapshotItem.weight);
    const adjustedValue =
      snapshotItem.type === 'negative'
        ? MAX_RATING_SCORE + 1 - clampScore(value)
        : clampScore(value);

    weightedTotal += adjustedValue * weight;
    totalWeight += weight;
  }

  if (totalWeight === 0) {
    return 0;
  }

  return round(weightedTotal / totalWeight, 1);
}

export function normalizePlayerRatingForDisplay(
  rating: PlayerRating,
  currentCriteria?: TeamRatingCriterion[],
) {
  const criteriaScores = normalizeRatingCriteriaScores(rating);
  const criteriaSnapshot = normalizeRatingCriteriaSnapshot(rating, currentCriteria);
  const hasDynamicRatingData =
    Object.keys(rating.criteriaScores ?? {}).length > 0 ||
    Object.keys(rating.criteriaSnapshot ?? {}).length > 0;
  const overall =
    hasDynamicRatingData && Number.isFinite(rating.overall)
      ? round(rating.overall, 1)
      : calculateOverallFromCriteriaScores({
          criteriaScores,
          criteriaSnapshot,
        });

  return {
    criteriaScores,
    criteriaSnapshot,
    overall,
  };
}

export function countRatingCriterionUsage(
  ratings: PlayerRating[],
  criterionId: string,
) {
  return ratings.reduce((count, rating) => {
    const { criteriaScores, criteriaSnapshot } = normalizePlayerRatingForDisplay(rating);
    if (criterionId in criteriaScores || criterionId in criteriaSnapshot) {
      return count + 1;
    }

    return count;
  }, 0);
}

export function validateActiveRatingCriteria(criteria: TeamRatingCriterion[]) {
  const activeCriteria = getActiveRatingCriteria(criteria);

  if (activeCriteria.length < MIN_ACTIVE_RATING_CRITERIA) {
    throw new Error('Mantenha pelo menos um critério ativo para avaliar o elenco.');
  }

  if (activeCriteria.length > MAX_ACTIVE_RATING_CRITERIA) {
    throw new Error(`Use no máximo ${MAX_ACTIVE_RATING_CRITERIA} critérios ativos por time.`);
  }
}

export function validateRatingCriteriaSubmission(input: {
  activeCriteria: TeamRatingCriterion[];
  criteriaScores: Record<string, number>;
}) {
  validateActiveRatingCriteria(input.activeCriteria);

  const activeCriteriaById = new Map(
    input.activeCriteria.map((criterion) => [criterion.id, criterion]),
  );
  const scoreIds = Object.keys(input.criteriaScores);

  if (scoreIds.length !== input.activeCriteria.length) {
    throw new Error('Envie notas para todos os critérios ativos do time.');
  }

  for (const criterion of input.activeCriteria) {
    const value = input.criteriaScores[criterion.id];

    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`Informe uma nota válida para ${criterion.label}.`);
    }

    if (value < MIN_RATING_SCORE || value > MAX_RATING_SCORE) {
      throw new Error(
        `As notas precisam ficar entre ${MIN_RATING_SCORE} e ${MAX_RATING_SCORE}.`,
      );
    }
  }

  for (const criterionId of scoreIds) {
    if (!activeCriteriaById.has(criterionId)) {
      throw new Error('A avaliação contém um critério que não está mais ativo no time.');
    }
  }
}
