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
