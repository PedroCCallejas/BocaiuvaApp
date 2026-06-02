import assert from 'node:assert/strict';
import test from 'node:test';

import { getActiveRatingCriteria } from '@/lib/rating-criteria';
import { splitCriteriaSummaryEntries } from '@/lib/stats';

import { createCriterion } from './test-helpers';

test('novas avaliacoes consideram apenas criterios ativos do time', () => {
  const activeCriterion = createCriterion({
    id: 'criterion-active',
    label: 'Compromisso',
    active: true,
    order: 0,
  });
  const inactiveCriterion = createCriterion({
    id: 'criterion-legacy',
    label: 'Folego',
    active: false,
    order: 1,
  });

  const activeCriteria = getActiveRatingCriteria([inactiveCriterion, activeCriterion]);

  assert.deepEqual(activeCriteria.map((criterion) => criterion.id), [activeCriterion.id]);
});

test('criterios historicos continuam separados do conjunto ativo atual', () => {
  const activeCriterion = createCriterion({
    id: 'criterion-active',
    label: 'Compromisso',
    active: true,
    type: 'positive',
  });
  const legacyCriterion = createCriterion({
    id: 'criterion-legacy',
    label: 'Folego',
    active: false,
    type: 'negative',
  });

  const summary = {
    criteriaAverages: {
      [activeCriterion.id]: 8.4,
      [legacyCriterion.id]: 6.8,
    },
    criteriaAdjustedAverages: {
      [activeCriterion.id]: 8.4,
      [legacyCriterion.id]: 6.8,
    },
    criteriaCounts: {
      [activeCriterion.id]: 3,
      [legacyCriterion.id]: 2,
    },
    criteriaSnapshotById: {
      [activeCriterion.id]: {
        criterionId: activeCriterion.id,
        label: activeCriterion.label,
        type: activeCriterion.type,
        weight: activeCriterion.weight,
        order: activeCriterion.order,
      },
      [legacyCriterion.id]: {
        criterionId: legacyCriterion.id,
        label: legacyCriterion.label,
        type: legacyCriterion.type,
        weight: legacyCriterion.weight,
        order: legacyCriterion.order,
      },
    },
  };

  const sections = splitCriteriaSummaryEntries(summary, [activeCriterion]);

  assert.deepEqual(sections.active.map((item) => item.criterionId), [activeCriterion.id]);
  assert.deepEqual(sections.legacy.map((item) => item.criterionId), [legacyCriterion.id]);
});
