import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildInactivatedPlayerState,
  buildReactivatedPlayerState,
  buildUnlinkedPlayerState,
  canManagePlayerAccountLinking,
  canManagePlayerLifecycle,
} from '@/lib/player-management';

import { createPlayer } from './test-helpers';

test('inativar jogador preserva historico e apenas muda o estado do cadastro', () => {
  const player = createPlayer({
    linkedUserId: 'user-1',
    linkedEmail: 'atleta@professo.test',
    manualStats: {
      matches: 12,
      goals: 7,
      assists: 3,
      wins: 6,
      draws: 2,
      losses: 4,
      mvps: 1,
    },
  });

  const updated = buildInactivatedPlayerState(player, '2026-06-02T15:00:00.000Z');

  assert.equal(updated.status, 'inactive');
  assert.equal(updated.deletedAt, '2026-06-02T15:00:00.000Z');
  assert.equal(updated.linkedUserId, player.linkedUserId);
  assert.deepEqual(updated.manualStats, player.manualStats);
});

test('reativar jogador devolve o cadastro para o elenco ativo', () => {
  const player = createPlayer({
    status: 'inactive',
    deletedAt: '2026-05-01T10:00:00.000Z',
  });

  const updated = buildReactivatedPlayerState(player, '2026-06-02T15:00:00.000Z');

  assert.equal(updated.status, 'active');
  assert.equal(updated.deletedAt, null);
  assert.equal(updated.updatedAt, '2026-06-02T15:00:00.000Z');
});

test('desvincular conta limpa o vinculo sem apagar estatisticas do jogador', () => {
  const player = createPlayer({
    linkedUserId: 'user-2',
    linkedEmail: 'vinculado@professo.test',
    manualStats: {
      matches: 8,
      goals: 5,
      assists: 4,
      wins: 4,
      draws: 1,
      losses: 3,
      mvps: 2,
    },
  });

  const updated = buildUnlinkedPlayerState(player, '2026-06-02T16:00:00.000Z');

  assert.equal(updated.linkedUserId, null);
  assert.equal(updated.linkedEmail, null);
  assert.deepEqual(updated.manualStats, player.manualStats);
});

test('somente quem gerencia o time pode inativar ou desvincular jogador', () => {
  assert.equal(canManagePlayerLifecycle({ canManageTeam: true }), true);
  assert.equal(canManagePlayerLifecycle({ canManageTeam: false }), false);
  assert.equal(canManagePlayerAccountLinking({ canManageTeam: true }), true);
  assert.equal(canManagePlayerAccountLinking({ canManageTeam: false }), false);
});
