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

function normalizeCriterionLabel(label: string) {
  return label.trim().toLocaleLowerCase('pt-BR');
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

  return {
    ...criterion,
    label: criterion.label.trim() || legacyDefinition?.label || 'Criterio',
    description: criterion.description?.trim() || null,
    type: criterion.type ?? legacyDefinition?.type ?? 'positive',
    weight: normalizeWeight(criterion.weight),
    active: criterion.active !== false,
    order: normalizeOrder(criterion.order, legacyDefinition?.order ?? 0),
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

  return {
    criterionId,
    label: criterionId,
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
    acc[criterionId] = {
      criterionId,
      label: item?.label?.trim() || fallbackSnapshotItem(criterionId, currentCriteria).label,
      type: item?.type ?? fallbackSnapshotItem(criterionId, currentCriteria).type,
      weight: normalizeWeight(item?.weight),
      order: normalizeOrder(item?.order, fallbackSnapshotItem(criterionId, currentCriteria).order),
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
    throw new Error('Mantenha pelo menos um criterio ativo para avaliar o elenco.');
  }

  if (activeCriteria.length > MAX_ACTIVE_RATING_CRITERIA) {
    throw new Error(`Use no maximo ${MAX_ACTIVE_RATING_CRITERIA} criterios ativos por time.`);
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
    throw new Error('Envie notas para todos os criterios ativos do time.');
  }

  for (const criterion of input.activeCriteria) {
    const value = input.criteriaScores[criterion.id];

    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`Informe uma nota valida para ${criterion.label}.`);
    }

    if (value < MIN_RATING_SCORE || value > MAX_RATING_SCORE) {
      throw new Error(
        `As notas precisam ficar entre ${MIN_RATING_SCORE} e ${MAX_RATING_SCORE}.`,
      );
    }
  }

  for (const criterionId of scoreIds) {
    if (!activeCriteriaById.has(criterionId)) {
      throw new Error('A avaliacao contem um criterio que nao esta mais ativo no time.');
    }
  }
}
