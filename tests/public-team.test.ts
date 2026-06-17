import assert from 'node:assert/strict';
import test from 'node:test';

import { buildPublicTeamProfile, buildPublicTeamSummary } from '@/lib/public-team';

import { createMatch, createPlayer, createTeam } from './test-helpers';

test('time privado nao aparece na galeria publica', () => {
  const privateTeam = createTeam({
    id: 'team-private',
    isPublic: false,
    city: 'Cuiaba',
    state: 'MT',
  });

  assert.equal(buildPublicTeamSummary(privateTeam, []), null);
});

test('time publico aparece na galeria quando tem cidade e estado', () => {
  const publicTeam = createTeam({
    id: 'team-public',
    name: 'Professo United',
    isPublic: true,
    city: 'Cuiaba',
    state: 'MT',
    publicDescription: 'Time de bairro pronto para amistosos.',
  });
  const match = createMatch({ teamId: publicTeam.id });

  const summary = buildPublicTeamSummary(publicTeam, [match]);

  assert.equal(summary?.id, publicTeam.id);
  assert.equal(summary?.city, 'Cuiaba');
  assert.equal(summary?.state, 'MT');
});

test('elenco publico so aparece quando publicRosterEnabled esta ativo', () => {
  const team = createTeam({
    id: 'team-roster',
    isPublic: true,
    city: 'Cuiaba',
    state: 'MT',
    publicRosterEnabled: false,
  });
  const activePlayer = createPlayer({ id: 'player-public', teamId: team.id, status: 'active' });
  const inactivePlayer = createPlayer({
    id: 'player-inactive',
    teamId: team.id,
    status: 'inactive',
    deletedAt: '2026-05-01T10:00:00.000Z',
  });

  const hiddenRosterProfile = buildPublicTeamProfile(team, [], [activePlayer, inactivePlayer]);

  assert.equal(hiddenRosterProfile?.publicRosterEnabled, false);
  assert.deepEqual(hiddenRosterProfile?.roster, []);

  const visibleProfile = buildPublicTeamProfile(
    {
      ...team,
      publicRosterEnabled: true,
    },
    [],
    [activePlayer, inactivePlayer],
  );

  assert.equal(visibleProfile?.publicRosterEnabled, true);
  assert.deepEqual(visibleProfile?.roster.map((player) => player.id), [activePlayer.id]);
});

test('jogador lesionado não aparece no elenco público', () => {
  const team = createTeam({
    id: 'team-inj-pub',
    isPublic: true,
    city: 'Cuiaba',
    state: 'MT',
    publicRosterEnabled: true,
  });
  const activePlayer = createPlayer({ id: 'player-pub-active', teamId: team.id, status: 'active' });
  const injuredPlayer = createPlayer({ id: 'player-pub-injured', teamId: team.id, status: 'injured' });

  const profile = buildPublicTeamProfile(team, [], [activePlayer, injuredPlayer]);

  assert.deepEqual(
    profile?.roster.map((p) => p.id),
    [activePlayer.id],
    'jogador lesionado não deve aparecer na galeria pública',
  );
});

test('jogador antigo (suspended) não aparece no elenco público', () => {
  const team = createTeam({
    id: 'team-former-pub',
    isPublic: true,
    city: 'Cuiaba',
    state: 'MT',
    publicRosterEnabled: true,
  });
  const activePlayer = createPlayer({ id: 'player-pub-active2', teamId: team.id, status: 'active' });
  const formerPlayer = createPlayer({ id: 'player-pub-former', teamId: team.id, status: 'suspended' });

  const profile = buildPublicTeamProfile(team, [], [activePlayer, formerPlayer]);

  assert.deepEqual(
    profile?.roster.map((p) => p.id),
    [activePlayer.id],
    'jogador antigo (suspended) não deve aparecer na galeria pública',
  );
});

test('jogador inactive não aparece no elenco público mesmo sem deletedAt', () => {
  const team = createTeam({
    id: 'team-inact-pub',
    isPublic: true,
    city: 'Cuiaba',
    state: 'MT',
    publicRosterEnabled: true,
  });
  const activePlayer = createPlayer({ id: 'player-pub-active3', teamId: team.id, status: 'active' });
  const inactivePlayer = createPlayer({ id: 'player-pub-inactive', teamId: team.id, status: 'inactive' });

  const profile = buildPublicTeamProfile(team, [], [activePlayer, inactivePlayer]);

  assert.deepEqual(
    profile?.roster.map((p) => p.id),
    [activePlayer.id],
    'jogador inativo não deve aparecer na galeria pública',
  );
});
