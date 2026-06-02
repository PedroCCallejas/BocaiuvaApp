import assert from 'node:assert/strict';
import test from 'node:test';

import { canEditPlayerProfile } from '@/lib/player-management';
import {
  findPlayerById,
  selectCanManageTeam,
  selectTeamHistoricalPlayers,
  selectTeamPlayers,
} from '@/store/selectors';

import {
  createPlayer,
  createSnapshot,
  createTeam,
  createTeamMember,
  createUser,
} from './test-helpers';

test('selector de elenco ativo remove jogador inativo, mas o historico continua acessivel', () => {
  const team = createTeam({ id: 'team-1' });
  const user = createUser({ id: 'user-1', activeTeamId: team.id, teamId: team.id });
  const membership = createTeamMember({
    userId: user.id,
    teamId: team.id,
    playerId: 'player-1',
    roles: ['player'],
    canManagePlayers: false,
  });
  const activePlayer = createPlayer({ id: 'player-1', teamId: team.id, status: 'active' });
  const inactivePlayer = createPlayer({
    id: 'player-2',
    teamId: team.id,
    status: 'inactive',
    deletedAt: '2026-05-01T10:00:00.000Z',
  });

  const state = {
    currentUserId: user.id,
    snapshot: createSnapshot({
      users: [user],
      teams: [team],
      teamMembers: [membership],
      players: [activePlayer, inactivePlayer],
    }),
  };

  assert.deepEqual(
    selectTeamPlayers(state).map((player) => player.id),
    [activePlayer.id],
  );
  assert.deepEqual(
    selectTeamHistoricalPlayers(state).map((player) => player.id).sort(),
    [activePlayer.id, inactivePlayer.id].sort(),
  );
});

test('jogador comum continua vendo outro perfil, mas nao pode editar outro jogador', () => {
  const viewer = createUser({ id: 'user-viewer' });
  const team = createTeam({ id: 'team-2' });
  const player = createPlayer({ id: 'player-10', teamId: team.id });

  const snapshot = createSnapshot({
    users: [viewer],
    teams: [team],
    players: [player],
  });

  assert.equal(findPlayerById({ snapshot }, player.id)?.id, player.id);
  assert.equal(
    canEditPlayerProfile({
      canManagePlayers: false,
      currentPlayerId: 'player-viewer',
      targetPlayerId: player.id,
    }),
    false,
  );
  assert.equal(
    canEditPlayerProfile({
      canManagePlayers: false,
      currentPlayerId: player.id,
      targetPlayerId: player.id,
    }),
    true,
  );
});

test('admin do time tem permissao de gestao e pode editar outros jogadores', () => {
  const team = createTeam({ id: 'team-3' });
  const admin = createUser({ id: 'user-admin', activeTeamId: team.id, teamId: team.id });
  const membership = createTeamMember({
    userId: admin.id,
    teamId: team.id,
    roles: ['admin'],
    canManageTeam: true,
    canManagePlayers: true,
  });

  const state = {
    currentUserId: admin.id,
    snapshot: createSnapshot({
      users: [admin],
      teams: [team],
      teamMembers: [membership],
    }),
  };

  assert.equal(selectCanManageTeam(state), true);
  assert.equal(
    canEditPlayerProfile({
      canManagePlayers: true,
      currentPlayerId: null,
      targetPlayerId: 'player-99',
    }),
    true,
  );
});
