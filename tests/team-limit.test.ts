import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canCreateTeamFromOwnedTeamsCount,
  getOwnedTeamsCount,
  OWNED_TEAMS_LIMIT_REACHED_MESSAGE,
} from '@/lib/team';

import { createTeam } from './test-helpers';

test('contagem de times considera apenas os times em que o usuario e dono', () => {
  const ownerId = 'user-owner';
  const teams = [
    createTeam({ id: 'team-a', adminUserId: ownerId }),
    createTeam({ id: 'team-b', adminUserId: ownerId }),
    createTeam({ id: 'team-c', adminUserId: 'user-other' }),
  ];

  assert.equal(getOwnedTeamsCount(teams, ownerId), 2);
  assert.equal(getOwnedTeamsCount(teams, 'user-other'), 1);
});

test('terceiro time e bloqueado quando a conta ja administra dois', () => {
  assert.equal(canCreateTeamFromOwnedTeamsCount(0), true);
  assert.equal(canCreateTeamFromOwnedTeamsCount(1), true);
  assert.equal(canCreateTeamFromOwnedTeamsCount(2), false);
  assert.equal(
    OWNED_TEAMS_LIMIT_REACHED_MESSAGE,
    'Você já atingiu o limite de 2 times por conta.',
  );
});
