import assert from 'node:assert/strict';

import {
  buildLastMatchHighlights,
  buildMatchHighlights,
  findLastFinishedMatch,
} from '@/lib/match-highlights';
import { emptySnapshot } from '@/services/repository/types';
import type { AppSnapshot } from '@/services/repository/types';
import type { Match } from '@/types/domain';

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

const TEAM = 'team-1';

function createMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: 'match-1',
    teamId: TEAM,
    date: '2026-08-13',
    time: '20:00',
    opponentName: '3ª VIA FC',
    status: 'finished',
    matchType: 'society',
    scoreboard: { team: 3, opponent: 2, result: 'win' },
    createdAt: '2026-08-13T00:00:00.000Z',
    updatedAt: '2026-08-13T00:00:00.000Z',
    ...overrides,
  } as Match;
}

function createSnapshot(partial: Partial<AppSnapshot>): AppSnapshot {
  return {
    ...emptySnapshot,
    players: [
      { id: 'p1', teamId: TEAM, nickname: 'Pio', fullName: 'Pio Silva' },
      { id: 'p2', teamId: TEAM, nickname: 'RC', fullName: 'Ricardo C' },
      { id: 'p3', teamId: TEAM, nickname: 'Art', fullName: 'Arthur' },
      { id: 'p4', teamId: TEAM, nickname: 'Schons', fullName: 'Guilherme Schons' },
    ],
    ...partial,
  } as AppSnapshot;
}

function stat(playerId: string, goals: number, assists: number, matchId = 'match-1') {
  return { id: `s-${playerId}`, teamId: TEAM, matchId, playerId, goals, assists, played: true };
}

export const matchHighlightsTestCases: TestCase[] = [
  {
    name: 'ultima partida encerrada e a mais recente por data',
    run() {
      const snapshot = createSnapshot({
        matches: [
          createMatch({ id: 'antiga', date: '2026-07-01' }),
          createMatch({ id: 'recente', date: '2026-08-13' }),
          // Agendada nao conta: o card e do que ja aconteceu.
          createMatch({ id: 'futura', date: '2026-09-01', status: 'scheduled' }),
        ] as Match[],
      });

      assert.equal(findLastFinishedMatch(snapshot, TEAM)?.id, 'recente');
    },
  },
  {
    name: 'partida apagada nao aparece como ultimo jogo',
    run() {
      const snapshot = createSnapshot({
        matches: [
          createMatch({ id: 'apagada', date: '2026-08-20', deletedAt: '2026-08-21' }),
          createMatch({ id: 'valida', date: '2026-08-13' }),
        ] as Match[],
      });

      assert.equal(findLastFinishedMatch(snapshot, TEAM)?.id, 'valida');
    },
  },
  {
    name: 'time sem partida encerrada nao gera card',
    run() {
      const snapshot = createSnapshot({
        matches: [createMatch({ status: 'scheduled' })] as Match[],
      });

      assert.equal(buildLastMatchHighlights(snapshot, TEAM), null);
    },
  },
  {
    name: 'gols e assistencias saem ordenados e somados',
    run() {
      const match = createMatch();
      const snapshot = createSnapshot({
        matches: [match],
        matchStats: [stat('p2', 1, 0), stat('p1', 2, 0), stat('p3', 0, 1), stat('p4', 0, 1)] as never,
      });

      const highlights = buildMatchHighlights(snapshot, match);

      assert.deepEqual(
        highlights.scorers.map((entry) => `${entry.nickname}:${entry.value}`),
        ['Pio:2', 'RC:1'],
      );
      assert.equal(highlights.totalGoals, 3);
      assert.equal(highlights.totalAssists, 2);
      // Empate em assistencias resolve por nome, para a ordem nao oscilar.
      assert.deepEqual(
        highlights.assists.map((entry) => entry.nickname),
        ['Art', 'Schons'],
      );
    },
  },
  {
    name: 'jogador sem gol nem assistencia fica de fora das listas',
    run() {
      const match = createMatch();
      const snapshot = createSnapshot({
        matches: [match],
        matchStats: [stat('p1', 1, 0), stat('p2', 0, 0)] as never,
      });

      const highlights = buildMatchHighlights(snapshot, match);

      assert.equal(highlights.scorers.length, 1);
      assert.equal(highlights.assists.length, 0);
    },
  },
  {
    name: 'votacao aberta mostra parcial; encerrada mostra o campeao',
    run() {
      const match = createMatch();
      const votes = [
        { id: 'v1', teamId: TEAM, matchId: 'match-1', voterPlayerId: 'p2', targetPlayerId: 'p1' },
        { id: 'v2', teamId: TEAM, matchId: 'match-1', voterPlayerId: 'p3', targetPlayerId: 'p1' },
        { id: 'v3', teamId: TEAM, matchId: 'match-1', voterPlayerId: 'p1', targetPlayerId: 'p2' },
      ];

      const aberta = buildMatchHighlights(
        createSnapshot({ matches: [match], mvpVotes: votes as never }),
        match,
      );

      assert.equal(aberta.mvpDecided, false);
      assert.equal(aberta.mvpTotalVotes, 3);
      assert.equal(aberta.mvpStandings[0]?.nickname, 'Pio');
      assert.equal(aberta.mvpStandings[0]?.votes, 2);

      const encerrada = buildMatchHighlights(
        createSnapshot({
          matches: [createMatch({ mvpWinnerPlayerIds: ['p1'] })],
          mvpVotes: votes as never,
        }),
        createMatch({ mvpWinnerPlayerIds: ['p1'] }),
      );

      assert.equal(encerrada.mvpDecided, true);
      assert.equal(encerrada.mvpStandings.filter((entry) => entry.isWinner).length, 1);
    },
  },
  {
    name: 'melhor em notas usa media, nao soma de avaliacoes',
    run() {
      const match = createMatch();
      const snapshot = createSnapshot({
        matches: [match],
        playerRatings: [
          // p1: tres notas 4 -> media 4
          { id: 'r1', teamId: TEAM, matchId: 'match-1', raterPlayerId: 'p2', targetPlayerId: 'p1', overall: 4 },
          { id: 'r2', teamId: TEAM, matchId: 'match-1', raterPlayerId: 'p3', targetPlayerId: 'p1', overall: 4 },
          { id: 'r3', teamId: TEAM, matchId: 'match-1', raterPlayerId: 'p4', targetPlayerId: 'p1', overall: 4 },
          // p2: uma nota 5 -> media 5, soma menor mas media maior
          { id: 'r4', teamId: TEAM, matchId: 'match-1', raterPlayerId: 'p1', targetPlayerId: 'p2', overall: 5 },
        ] as never,
      });

      const highlights = buildMatchHighlights(snapshot, match);

      assert.equal(highlights.topRated?.nickname, 'RC');
      assert.equal(highlights.topRated?.value, 5);
    },
  },
  {
    name: 'partida sem avaliacao nao aponta melhor em notas',
    run() {
      const match = createMatch();
      const highlights = buildMatchHighlights(createSnapshot({ matches: [match] }), match);

      assert.equal(highlights.topRated, null);
      assert.deepEqual(highlights.mvpStandings, []);
    },
  },
  {
    name: 'dados de outra partida nao contaminam o resumo',
    run() {
      const match = createMatch();
      const snapshot = createSnapshot({
        matches: [match],
        matchStats: [stat('p1', 1, 0), stat('p2', 9, 9, 'outra-partida')] as never,
      });

      const highlights = buildMatchHighlights(snapshot, match);

      assert.equal(highlights.totalGoals, 1);
      assert.equal(highlights.scorers.length, 1);
    },
  },
  {
    name: 'placar e resultado vem do scoreboard da partida',
    run() {
      const match = createMatch({ scoreboard: { team: 3, opponent: 2, result: 'win' } });
      const highlights = buildMatchHighlights(createSnapshot({ matches: [match] }), match);

      assert.equal(highlights.teamScore, 3);
      assert.equal(highlights.opponentScore, 2);
      assert.equal(highlights.result, 'win');
    },
  },
];
