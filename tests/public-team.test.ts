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

test('jogador ativo com vídeo de apresentação tem URL no payload público', () => {
  const team = createTeam({
    id: 'team-video',
    isPublic: true,
    city: 'Cuiaba',
    state: 'MT',
    publicRosterEnabled: true,
  });
  const playerWithVideo = createPlayer({
    id: 'player-with-video',
    teamId: team.id,
    status: 'active',
    presentationVideoUrl: 'https://storage.example.com/player-videos/team-1/player-with-video/presentation.mp4',
  });

  const profile = buildPublicTeamProfile(team, [], [playerWithVideo]);

  const rosterPlayer = profile?.roster.find((p) => p.id === playerWithVideo.id);
  assert.ok(rosterPlayer, 'jogador deve aparecer no elenco público');
  assert.equal(
    rosterPlayer?.presentationVideoUrl,
    playerWithVideo.presentationVideoUrl,
    'URL do vídeo deve estar no payload público',
  );
});

test('jogador ativo sem vídeo tem presentationVideoUrl null no payload público', () => {
  const team = createTeam({
    id: 'team-no-video',
    isPublic: true,
    city: 'Cuiaba',
    state: 'MT',
    publicRosterEnabled: true,
  });
  const playerWithoutVideo = createPlayer({
    id: 'player-no-video',
    teamId: team.id,
    status: 'active',
    presentationVideoUrl: null,
  });

  const profile = buildPublicTeamProfile(team, [], [playerWithoutVideo]);

  const rosterPlayer = profile?.roster.find((p) => p.id === playerWithoutVideo.id);
  assert.ok(rosterPlayer, 'jogador deve aparecer no elenco público');
  assert.equal(rosterPlayer?.presentationVideoUrl, null, 'URL deve ser null quando jogador não tem vídeo');
});

test('jogador lesionado com vídeo NÃO tem vídeo no payload público', () => {
  const team = createTeam({
    id: 'team-injured-video',
    isPublic: true,
    city: 'Cuiaba',
    state: 'MT',
    publicRosterEnabled: true,
  });
  const injuredWithVideo = createPlayer({
    id: 'player-injured-video',
    teamId: team.id,
    status: 'injured',
    presentationVideoUrl: 'https://storage.example.com/player-videos/team-1/player-injured/presentation.mp4',
  });
  const activePlayer = createPlayer({
    id: 'player-active-only',
    teamId: team.id,
    status: 'active',
  });

  const profile = buildPublicTeamProfile(team, [], [injuredWithVideo, activePlayer]);

  assert.ok(
    !profile?.roster.find((p) => p.id === injuredWithVideo.id),
    'jogador lesionado não deve aparecer no elenco público, mesmo com vídeo',
  );
  assert.ok(
    profile?.roster.find((p) => p.id === activePlayer.id),
    'jogador ativo continua no elenco público',
  );
});

test('jogador antigo (suspended) com vídeo NÃO tem vídeo no payload público', () => {
  const team = createTeam({
    id: 'team-former-video',
    isPublic: true,
    city: 'Cuiaba',
    state: 'MT',
    publicRosterEnabled: true,
  });
  const formerWithVideo = createPlayer({
    id: 'player-former-video',
    teamId: team.id,
    status: 'suspended',
    presentationVideoUrl: 'https://storage.example.com/video.mp4',
  });

  const profile = buildPublicTeamProfile(team, [], [formerWithVideo]);

  assert.ok(
    !profile?.roster.find((p) => p.id === formerWithVideo.id),
    'jogador antigo não deve aparecer no elenco público, mesmo com vídeo',
  );
});

test('com publicRosterEnabled false, nenhum vídeo de jogador é exposto', () => {
  const team = createTeam({
    id: 'team-hidden-video',
    isPublic: true,
    city: 'Cuiaba',
    state: 'MT',
    publicRosterEnabled: false,
  });
  const playerWithVideo = createPlayer({
    id: 'player-hidden-video',
    teamId: team.id,
    status: 'active',
    presentationVideoUrl: 'https://storage.example.com/video.mp4',
  });

  const profile = buildPublicTeamProfile(team, [], [playerWithVideo]);

  assert.deepEqual(profile?.roster, [], 'roster deve ser vazio quando publicRosterEnabled é false');
});
