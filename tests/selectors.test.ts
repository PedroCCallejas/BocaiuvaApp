import assert from 'node:assert/strict';
import test from 'node:test';

import { PLAYER_STATUS_LABELS } from '@/constants/options';
import { canEditPlayerProfile } from '@/lib/player-management';
import {
  findPlayerById,
  getAttendanceBuckets,
  selectCanManageTeam,
  selectTeamHistoricalPlayers,
  selectTeamPlayers,
} from '@/store/selectors';

import {
  createAttendance,
  createMatch,
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

test('jogador lesionado não aparece no elenco ativo, mas aparece no histórico', () => {
  const team = createTeam({ id: 'team-inj' });
  const user = createUser({ id: 'user-inj', activeTeamId: team.id, teamId: team.id });
  const membership = createTeamMember({ userId: user.id, teamId: team.id });
  const activePlayer = createPlayer({ id: 'player-active-inj', teamId: team.id, status: 'active' });
  const injuredPlayer = createPlayer({ id: 'player-injured', teamId: team.id, status: 'injured' });

  const state = {
    currentUserId: user.id,
    snapshot: createSnapshot({
      users: [user],
      teams: [team],
      teamMembers: [membership],
      players: [activePlayer, injuredPlayer],
    }),
  };

  assert.deepEqual(selectTeamPlayers(state).map((p) => p.id), [activePlayer.id]);
  assert.ok(
    selectTeamHistoricalPlayers(state).find((p) => p.id === injuredPlayer.id),
    'jogador lesionado deve aparecer no histórico',
  );
});

test('jogador antigo (suspended) não aparece no elenco ativo, mas aparece no histórico', () => {
  const team = createTeam({ id: 'team-sus' });
  const user = createUser({ id: 'user-sus', activeTeamId: team.id, teamId: team.id });
  const membership = createTeamMember({ userId: user.id, teamId: team.id });
  const activePlayer = createPlayer({ id: 'player-active-sus', teamId: team.id, status: 'active' });
  const formerPlayer = createPlayer({ id: 'player-former', teamId: team.id, status: 'suspended' });

  const state = {
    currentUserId: user.id,
    snapshot: createSnapshot({
      users: [user],
      teams: [team],
      teamMembers: [membership],
      players: [activePlayer, formerPlayer],
    }),
  };

  assert.deepEqual(selectTeamPlayers(state).map((p) => p.id), [activePlayer.id]);
  assert.ok(
    selectTeamHistoricalPlayers(state).find((p) => p.id === formerPlayer.id),
    'jogador antigo deve aparecer no histórico',
  );
});

test('label do status suspended é "Antigo" e nenhum status exibe "Suspenso"', () => {
  assert.equal(PLAYER_STATUS_LABELS.suspended, 'Antigo');
  const allLabels = Object.values(PLAYER_STATUS_LABELS);
  assert.ok(
    !allLabels.includes('Suspenso'),
    'nenhum label de status deve exibir "Suspenso"',
  );
});

test('getAttendanceBuckets com filterActiveOnly filtra lesionados e antigos em partida aberta', () => {
  const match = createMatch({ id: 'match-open-filter', status: 'confirmed' });
  const activePlayer = createPlayer({ id: 'player-a', teamId: match.teamId, status: 'active' });
  const injuredPlayer = createPlayer({ id: 'player-b', teamId: match.teamId, status: 'injured' });
  const formerPlayer = createPlayer({ id: 'player-c', teamId: match.teamId, status: 'suspended' });
  const inactivePlayer = createPlayer({ id: 'player-d', teamId: match.teamId, status: 'inactive' });

  const snapshot = createSnapshot({
    players: [activePlayer, injuredPlayer, formerPlayer, inactivePlayer],
    attendance: [
      createAttendance({ matchId: match.id, playerId: activePlayer.id, status: 'confirmed' }),
      createAttendance({ matchId: match.id, playerId: injuredPlayer.id, status: 'pending' }),
      createAttendance({ matchId: match.id, playerId: formerPlayer.id, status: 'pending' }),
      createAttendance({ matchId: match.id, playerId: inactivePlayer.id, status: 'pending' }),
    ],
  });

  const buckets = getAttendanceBuckets({ snapshot }, match.id, { filterActiveOnly: true });

  assert.deepEqual(buckets.confirmed.map((p) => p.id), [activePlayer.id]);
  assert.deepEqual(buckets.pending.map((p) => p.id), [], 'lesionado/antigo/inativo não deve aparecer no pendente');
});

test('getAttendanceBuckets de partida encerrada mostra todos os jogadores confirmados, independente do status atual', () => {
  const match = createMatch({ id: 'match-hist', status: 'finished' });
  const activePlayer = createPlayer({ id: 'player-e', teamId: match.teamId, status: 'active' });
  const formerPlayer = createPlayer({ id: 'player-f', teamId: match.teamId, status: 'suspended' });

  const snapshot = createSnapshot({
    players: [activePlayer, formerPlayer],
    attendance: [
      createAttendance({ matchId: match.id, playerId: activePlayer.id, status: 'confirmed' }),
      createAttendance({ matchId: match.id, playerId: formerPlayer.id, status: 'confirmed' }),
    ],
  });

  const buckets = getAttendanceBuckets({ snapshot }, match.id, { filterActiveOnly: false });

  assert.equal(buckets.confirmed.length, 2, 'partida encerrada deve mostrar todos os confirmados');
  assert.ok(
    buckets.confirmed.find((p) => p.id === formerPlayer.id),
    'jogador antigo deve aparecer no histórico de partida encerrada',
  );
});
