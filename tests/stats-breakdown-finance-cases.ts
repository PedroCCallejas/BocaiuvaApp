import assert from 'node:assert/strict';
import fs from 'node:fs';

import { buildFinanceSummary, getMatchCostCents } from '@/lib/finance';
import {
  DEFAULT_MATCH_COST_CENTS,
  amountFromCents,
  centsFromAmount,
  formatCentsBRL,
  formatCentsForInput,
  parseCurrencyInputToCents,
} from '@/lib/money';
import {
  buildPlayerParticipationAudit,
  buildPlayerStatBreakdown,
  calculatePlayerStatsFromMatches,
  compareStoredAndCalculatedStats,
} from '@/lib/player-stat-breakdown';
import { buildPlayerAggregates } from '@/lib/stats';
import {
  findDuplicateMatchStatPlayerId,
  getDuplicateParticipationMessage,
  getParticipationRemovalBlocker,
} from '@/lib/match-participation';
import {
  mockRepository,
  resetMockRepositoryState,
} from '@/services/repository/mock-repository';

import {
  createAttendance,
  createMatch,
  createMatchStat,
  createPlayer,
  createSnapshot,
  createTeam,
} from './test-helpers';

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

const TEAM_ID = 'team-breakdown';

function buildBaseSnapshot() {
  const team = createTeam({ id: TEAM_ID });
  const player = createPlayer({ id: 'player-a', teamId: TEAM_ID });
  const finished = createMatch({
    id: 'match-finished',
    teamId: TEAM_ID,
    date: '2026-05-01',
    status: 'finished',
  });
  const canceled = createMatch({
    id: 'match-canceled',
    teamId: TEAM_ID,
    date: '2026-05-08',
    status: 'canceled',
    scoreboard: null,
  });
  const scheduled = createMatch({
    id: 'match-scheduled',
    teamId: TEAM_ID,
    date: '2026-05-15',
    status: 'scheduled',
    scoreboard: null,
  });

  return { team, player, finished, canceled, scheduled };
}

export const statsBreakdownFinanceTestCases: TestCase[] = [
  // ── Fase 2/4: regra de participação e breakdown ──────────────────────────
  {
    name: 'breakdown: jogo conta somente com finished + played + presenca confirmada',
    run() {
      const { team, player, finished, canceled, scheduled } = buildBaseSnapshot();
      const snapshot = createSnapshot({
        teams: [team],
        players: [player],
        matches: [finished, canceled, scheduled],
        attendance: [
          createAttendance({ teamId: TEAM_ID, matchId: finished.id, playerId: player.id }),
          createAttendance({ teamId: TEAM_ID, matchId: canceled.id, playerId: player.id }),
          createAttendance({ teamId: TEAM_ID, matchId: scheduled.id, playerId: player.id }),
        ],
        matchStats: [
          createMatchStat({
            teamId: TEAM_ID,
            matchId: finished.id,
            playerId: player.id,
            goals: 2,
            assists: 1,
          }),
          createMatchStat({ teamId: TEAM_ID, matchId: canceled.id, playerId: player.id }),
          createMatchStat({ teamId: TEAM_ID, matchId: scheduled.id, playerId: player.id }),
        ],
      });

      const breakdown = buildPlayerStatBreakdown(snapshot, TEAM_ID, player.id);
      assert.equal(breakdown.games.total, 1, 'apenas a partida encerrada conta');
      assert.equal(breakdown.games.matches[0]?.matchId, finished.id);
      assert.equal(breakdown.goals.total, 2);
      assert.equal(breakdown.assists.total, 1);
    },
  },
  {
    name: 'breakdown: confirmado sem sumula nao conta e auditoria aponta confirmed-without-stat (caso Fares)',
    run() {
      const { team, player, finished } = buildBaseSnapshot();
      const snapshot = createSnapshot({
        teams: [team],
        players: [player],
        matches: [finished],
        attendance: [
          createAttendance({ teamId: TEAM_ID, matchId: finished.id, playerId: player.id }),
        ],
        matchStats: [],
      });

      const breakdown = buildPlayerStatBreakdown(snapshot, TEAM_ID, player.id);
      assert.equal(breakdown.games.total, 0, 'sem MatchStat o jogo nao conta');

      const audit = buildPlayerParticipationAudit(snapshot, TEAM_ID, player.id);
      const row = audit.find((item) => item.matchId === finished.id);
      assert.equal(row?.confirmed, true);
      assert.equal(row?.countsAsGame, false);
      assert.equal(row?.inconsistency, 'confirmed-without-stat');
    },
  },
  {
    name: 'breakdown: sumula sem confirmacao nao conta e auditoria aponta stat-without-confirmation',
    run() {
      const { team, player, finished } = buildBaseSnapshot();
      const snapshot = createSnapshot({
        teams: [team],
        players: [player],
        matches: [finished],
        attendance: [
          createAttendance({
            teamId: TEAM_ID,
            matchId: finished.id,
            playerId: player.id,
            status: 'absent',
          }),
        ],
        matchStats: [
          createMatchStat({
            teamId: TEAM_ID,
            matchId: finished.id,
            playerId: player.id,
            goals: 1,
          }),
        ],
      });

      const breakdown = buildPlayerStatBreakdown(snapshot, TEAM_ID, player.id);
      assert.equal(breakdown.games.total, 0);
      assert.equal(breakdown.goals.total, 0, 'gol de sumula orfa nao entra no total');

      const audit = buildPlayerParticipationAudit(snapshot, TEAM_ID, player.id);
      const row = audit.find((item) => item.matchId === finished.id);
      assert.equal(row?.inconsistency, 'stat-without-confirmation');
    },
  },
  {
    name: 'breakdown: confirmado com played=false (nao jogou) nao conta jogo',
    run() {
      const { team, player, finished } = buildBaseSnapshot();
      const snapshot = createSnapshot({
        teams: [team],
        players: [player],
        matches: [finished],
        attendance: [
          createAttendance({ teamId: TEAM_ID, matchId: finished.id, playerId: player.id }),
        ],
        matchStats: [
          createMatchStat({
            teamId: TEAM_ID,
            matchId: finished.id,
            playerId: player.id,
            played: false,
            goals: 0,
            assists: 0,
          }),
        ],
      });

      const breakdown = buildPlayerStatBreakdown(snapshot, TEAM_ID, player.id);
      assert.equal(breakdown.games.total, 0);

      const audit = buildPlayerParticipationAudit(snapshot, TEAM_ID, player.id);
      const row = audit.find((item) => item.matchId === finished.id);
      assert.equal(row?.countsAsGame, false);
      assert.equal(row?.inconsistency, null, 'played=false explicito nao e inconsistencia');
    },
  },
  {
    name: 'breakdown: multiplos gols na mesma partida somam e partidas sem gol ficam fora da lista de gols',
    run() {
      const { team, player, finished } = buildBaseSnapshot();
      const secondMatch = createMatch({
        id: 'match-second',
        teamId: TEAM_ID,
        date: '2026-05-22',
        status: 'finished',
      });
      const snapshot = createSnapshot({
        teams: [team],
        players: [player],
        matches: [finished, secondMatch],
        attendance: [
          createAttendance({ teamId: TEAM_ID, matchId: finished.id, playerId: player.id }),
          createAttendance({ teamId: TEAM_ID, matchId: secondMatch.id, playerId: player.id }),
        ],
        matchStats: [
          createMatchStat({
            teamId: TEAM_ID,
            matchId: finished.id,
            playerId: player.id,
            goals: 3,
            assists: 2,
          }),
          createMatchStat({
            teamId: TEAM_ID,
            matchId: secondMatch.id,
            playerId: player.id,
            goals: 0,
            assists: 0,
          }),
        ],
      });

      const breakdown = buildPlayerStatBreakdown(snapshot, TEAM_ID, player.id);
      assert.equal(breakdown.games.total, 2);
      assert.equal(breakdown.goals.total, 3);
      assert.equal(breakdown.goals.matches.length, 1, 'partida sem gol nao entra na lista de gols');
      assert.equal(breakdown.goals.matches[0]?.amount, 3);
      assert.equal(breakdown.assists.total, 2);
      assert.equal(breakdown.assists.matches.length, 1);
    },
  },
  {
    name: 'breakdown: soma dos itens e igual ao total exibido, incluindo ajuste manual',
    run() {
      const { team, finished } = buildBaseSnapshot();
      const player = createPlayer({
        id: 'player-manual',
        teamId: TEAM_ID,
        manualStats: {
          matches: 5,
          goals: 4,
          assists: 3,
          wins: 0,
          draws: 0,
          losses: 0,
          mvps: 0,
        },
      });
      const snapshot = createSnapshot({
        teams: [team],
        players: [player],
        matches: [finished],
        attendance: [
          createAttendance({ teamId: TEAM_ID, matchId: finished.id, playerId: player.id }),
        ],
        matchStats: [
          createMatchStat({
            teamId: TEAM_ID,
            matchId: finished.id,
            playerId: player.id,
            goals: 2,
            assists: 1,
          }),
        ],
      });

      const breakdown = buildPlayerStatBreakdown(snapshot, TEAM_ID, player.id);
      const gamesFromItems =
        breakdown.games.matches.reduce((sum, item) => sum + item.amount, 0) +
        breakdown.games.manualAdjustment;
      const goalsFromItems =
        breakdown.goals.matches.reduce((sum, item) => sum + item.amount, 0) +
        breakdown.goals.manualAdjustment;
      const assistsFromItems =
        breakdown.assists.matches.reduce((sum, item) => sum + item.amount, 0) +
        breakdown.assists.manualAdjustment;

      assert.equal(breakdown.games.total, 6);
      assert.equal(gamesFromItems, breakdown.games.total);
      assert.equal(breakdown.goals.total, 6);
      assert.equal(goalsFromItems, breakdown.goals.total);
      assert.equal(breakdown.assists.total, 4);
      assert.equal(assistsFromItems, breakdown.assists.total);

      const aggregate = buildPlayerAggregates(snapshot, TEAM_ID).find(
        (item) => item.player.id === player.id,
      );
      assert.equal(aggregate?.games, breakdown.games.total, 'ficha e breakdown usam a mesma regra');
      assert.equal(aggregate?.goals, breakdown.goals.total);
      assert.equal(aggregate?.assists, breakdown.assists.total);
    },
  },
  {
    name: 'breakdown: sumula duplicada da mesma partida nao conta duas vezes',
    run() {
      const { team, player, finished } = buildBaseSnapshot();
      const snapshot = createSnapshot({
        teams: [team],
        players: [player],
        matches: [finished],
        attendance: [
          createAttendance({ teamId: TEAM_ID, matchId: finished.id, playerId: player.id }),
        ],
        matchStats: [
          createMatchStat({
            id: 'stat-dup-1',
            teamId: TEAM_ID,
            matchId: finished.id,
            playerId: player.id,
            goals: 1,
          }),
          createMatchStat({
            id: 'stat-dup-2',
            teamId: TEAM_ID,
            matchId: finished.id,
            playerId: player.id,
            goals: 1,
          }),
        ],
      });

      const breakdown = buildPlayerStatBreakdown(snapshot, TEAM_ID, player.id);
      const aggregate = buildPlayerAggregates(snapshot, TEAM_ID).find(
        (item) => item.player.id === player.id,
      );
      assert.equal(breakdown.games.total, 1, 'mesma partida duplicada conta uma vez');
      assert.equal(breakdown.goals.total, 1);
      assert.equal(aggregate?.games, breakdown.games.total);
      assert.equal(aggregate?.goals, breakdown.goals.total);
    },
  },
  {
    name: 'breakdown: jogador inexistente ou de outro time retorna tudo zerado',
    run() {
      const { team, player, finished } = buildBaseSnapshot();
      const snapshot = createSnapshot({
        teams: [team],
        players: [player],
        matches: [finished],
        attendance: [
          createAttendance({ teamId: TEAM_ID, matchId: finished.id, playerId: player.id }),
        ],
        matchStats: [
          createMatchStat({ teamId: TEAM_ID, matchId: finished.id, playerId: player.id }),
        ],
      });

      const missing = buildPlayerStatBreakdown(snapshot, TEAM_ID, 'player-inexistente');
      assert.equal(missing.games.total, 0);
      assert.equal(missing.goals.total, 0);

      const wrongTeam = buildPlayerStatBreakdown(snapshot, 'team-errado', player.id);
      assert.equal(wrongTeam.games.total, 0);
    },
  },
  {
    name: 'breakdown: jogador desativado preserva historico',
    run() {
      const { team, finished } = buildBaseSnapshot();
      const player = createPlayer({
        id: 'player-inativo',
        teamId: TEAM_ID,
        status: 'inactive',
        deletedAt: '2026-06-01T10:00:00.000Z',
      });
      const snapshot = createSnapshot({
        teams: [team],
        players: [player],
        matches: [finished],
        attendance: [
          createAttendance({ teamId: TEAM_ID, matchId: finished.id, playerId: player.id }),
        ],
        matchStats: [
          createMatchStat({
            teamId: TEAM_ID,
            matchId: finished.id,
            playerId: player.id,
            goals: 1,
          }),
        ],
      });

      const breakdown = buildPlayerStatBreakdown(snapshot, TEAM_ID, player.id);
      assert.equal(breakdown.games.total, 1, 'historico de inativo permanece');
      assert.equal(breakdown.goals.total, 1);
    },
  },
  {
    name: 'breakdown: filtro de periodo exclui partidas e ajuste manual fora de "all"',
    run() {
      const { team, player } = buildBaseSnapshot();
      const playerWithManual = createPlayer({
        id: player.id,
        teamId: TEAM_ID,
        manualStats: {
          matches: 10,
          goals: 0,
          assists: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          mvps: 0,
        },
      });
      const may = createMatch({
        id: 'match-may',
        teamId: TEAM_ID,
        date: '2026-05-01',
        status: 'finished',
      });
      const june = createMatch({
        id: 'match-june',
        teamId: TEAM_ID,
        date: '2026-06-01',
        status: 'finished',
      });
      const snapshot = createSnapshot({
        teams: [team],
        players: [playerWithManual],
        matches: [may, june],
        attendance: [
          createAttendance({ teamId: TEAM_ID, matchId: may.id, playerId: player.id }),
          createAttendance({ teamId: TEAM_ID, matchId: june.id, playerId: player.id }),
        ],
        matchStats: [
          createMatchStat({ teamId: TEAM_ID, matchId: may.id, playerId: player.id }),
          createMatchStat({ teamId: TEAM_ID, matchId: june.id, playerId: player.id }),
        ],
      });

      const filtered = buildPlayerStatBreakdown(snapshot, TEAM_ID, player.id, {
        period: 'month',
        year: 2026,
        month: 5,
      });
      assert.equal(filtered.games.matches.length, 1, 'apenas partida de maio');
      assert.equal(filtered.games.manualAdjustment, 0, 'ajuste manual fora de periodo filtrado');
      assert.equal(filtered.games.total, 1);
    },
  },
  {
    name: 'compareStoredAndCalculatedStats: diferenca entre exibido e calculado e o ajuste manual',
    run() {
      const { team, finished } = buildBaseSnapshot();
      const player = createPlayer({
        id: 'player-diff',
        teamId: TEAM_ID,
        manualStats: {
          matches: 2,
          goals: -1,
          assists: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          mvps: 0,
        },
      });
      const snapshot = createSnapshot({
        teams: [team],
        players: [player],
        matches: [finished],
        attendance: [
          createAttendance({ teamId: TEAM_ID, matchId: finished.id, playerId: player.id }),
        ],
        matchStats: [
          createMatchStat({
            teamId: TEAM_ID,
            matchId: finished.id,
            playerId: player.id,
            goals: 2,
          }),
        ],
      });

      const rows = compareStoredAndCalculatedStats(snapshot, TEAM_ID);
      const row = rows.find((item) => item.playerId === player.id);
      assert.ok(row);
      assert.equal(row.calculatedGames, 1);
      assert.equal(row.storedGames, 3);
      assert.equal(row.storedGames - row.calculatedGames, row.manualGames);
      assert.equal(row.storedGoals, 1);
      assert.equal(row.calculatedGoals, 2);
    },
  },
  {
    name: 'calculatePlayerStatsFromMatches: reconstrucao e deterministica (duas execucoes iguais)',
    run() {
      const { team, player, finished } = buildBaseSnapshot();
      const snapshot = createSnapshot({
        teams: [team],
        players: [player],
        matches: [finished],
        attendance: [
          createAttendance({ teamId: TEAM_ID, matchId: finished.id, playerId: player.id }),
        ],
        matchStats: [
          createMatchStat({
            teamId: TEAM_ID,
            matchId: finished.id,
            playerId: player.id,
            goals: 2,
            assists: 1,
          }),
        ],
      });

      const first = calculatePlayerStatsFromMatches(snapshot, TEAM_ID, player.id);
      const second = calculatePlayerStatsFromMatches(snapshot, TEAM_ID, player.id);
      assert.deepEqual(
        { games: first.games, goals: first.goals, assists: first.assists },
        { games: second.games, goals: second.goals, assists: second.assists },
      );
      assert.equal(first.games, 1);
    },
  },

  // ── Fase 8/9: dinheiro em centavos e resumo financeiro ───────────────────
  {
    name: 'money: entrada digitada vira centavos sem float ("185,00" => 18500)',
    run() {
      assert.equal(parseCurrencyInputToCents('185,00'), 18500);
      assert.equal(parseCurrencyInputToCents('185'), 18500);
      assert.equal(parseCurrencyInputToCents('R$ 1.850,50'), 185050);
      assert.equal(parseCurrencyInputToCents('0'), 0, 'valor zero e explicito, nao null');
      assert.equal(parseCurrencyInputToCents(''), null);
      assert.equal(parseCurrencyInputToCents('-10'), null, 'valor negativo rejeitado');
      assert.equal(parseCurrencyInputToCents('abc'), null);
    },
  },
  {
    name: 'money: formatacao brasileira e conversoes round-trip',
    run() {
      assert.equal(DEFAULT_MATCH_COST_CENTS, 18500);
      assert.ok(formatCentsBRL(18500).includes('185,00'));
      assert.equal(formatCentsForInput(18500), '185,00');
      assert.equal(centsFromAmount(185), 18500);
      assert.equal(centsFromAmount(0.29), 29, 'arredondamento explicito evita erro de float');
      assert.equal(amountFromCents(18500), 185);
      assert.equal(amountFromCents(-5 as number), 0, 'centavos invalidos normalizam para zero');
    },
  },
  {
    name: 'finance: cancelada fora dos totais, sem valor nao vira zero, previsto separado do realizado',
    run() {
      const cost = {
        totalAmount: 185,
        splitCount: 10,
        amountPerPlayer: 18.5,
        currency: 'BRL' as const,
        note: null,
      };
      const matches = [
        createMatch({
          id: 'fin-1',
          teamId: TEAM_ID,
          date: '2026-05-01',
          status: 'finished',
          fieldCost: cost,
        }),
        createMatch({
          id: 'fin-2',
          teamId: TEAM_ID,
          date: '2026-05-08',
          status: 'scheduled',
          scoreboard: null,
          fieldCost: { ...cost, totalAmount: 200, amountPerPlayer: 20 },
        }),
        createMatch({
          id: 'fin-3',
          teamId: TEAM_ID,
          date: '2026-05-15',
          status: 'canceled',
          scoreboard: null,
          fieldCost: cost,
        }),
        createMatch({
          id: 'fin-4',
          teamId: TEAM_ID,
          date: '2026-05-22',
          status: 'finished',
          fieldCost: null,
        }),
      ];

      const summary = buildFinanceSummary(matches, TEAM_ID);
      assert.equal(summary.totalMatches, 4);
      assert.equal(summary.realizedCostCents, 18500, 'apenas encerrada com valor');
      assert.equal(summary.expectedCostCents, 20000, 'apenas aberta com valor');
      assert.equal(summary.matchesWithoutCost, 1, 'sem valor e contada a parte, nunca como zero');
      assert.equal(summary.averageCostCents, Math.round((18500 + 20000) / 2));

      const canceledRow = summary.rows.find((row) => row.matchId === 'fin-3');
      assert.equal(canceledRow?.includedInTotals, false, 'cancelada preserva valor mas fica fora');
      assert.equal(canceledRow?.costCents, 18500);

      const finishedOnly = buildFinanceSummary(matches, TEAM_ID, { status: 'finished' });
      assert.equal(finishedOnly.totalMatches, 2);

      const monthFiltered = buildFinanceSummary(matches, TEAM_ID, { year: 2026, month: 6 });
      assert.equal(monthFiltered.totalMatches, 0);

      assert.equal(getMatchCostCents(matches[0]), 18500);
      assert.equal(getMatchCostCents(matches[3]), null);
    },
  },

  // ── Fase 2/12: repositorio (mock) — encerramento com played e sincronizacao ──
  {
    name: 'finishMatch: confirmado marcado como nao participante nao conta jogo',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });
      await mockRepository.finishMatch(
        {
          matchId: 'match-3',
          teamScore: 2,
          opponentScore: 0,
          ownGoalsForTeam: 0,
          fieldCost: null,
          playerStats: [
            { playerId: 'player-1', goals: 0, assists: 0, played: false },
            { playerId: 'player-9', goals: 2, assists: 0 },
          ],
        },
        'user-admin',
      );

      const snapshot = await mockRepository.getSnapshot();
      const statPlayer1 = snapshot.matchStats.find(
        (stat) => stat.matchId === 'match-3' && stat.playerId === 'player-1',
      );
      assert.equal(statPlayer1?.played, false, 'sumula registra explicitamente que nao jogou');
      assert.equal(statPlayer1?.started, false);

      const aggregates = buildPlayerAggregates(snapshot, 'team-bocaiuva');
      const player1 = aggregates.find((item) => item.player.id === 'player-1');
      const breakdown = buildPlayerStatBreakdown(snapshot, 'team-bocaiuva', 'player-1');
      assert.equal(
        breakdown.games.matches.some((item) => item.matchId === 'match-3'),
        false,
        'match-3 nao entra no detalhamento de jogos de player-1',
      );
      assert.equal(player1?.games, breakdown.games.total, 'ficha e breakdown continuam iguais');
    },
  },
  {
    name: 'finishMatch: rejeita gols para jogador marcado como nao participante',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });
      await assert.rejects(
        () =>
          mockRepository.finishMatch(
            {
              matchId: 'match-3',
              teamScore: 1,
              opponentScore: 0,
              ownGoalsForTeam: 0,
              fieldCost: null,
              playerStats: [{ playerId: 'player-1', goals: 1, assists: 0, played: false }],
            },
            'user-admin',
          ),
        (error) =>
          error instanceof Error && error.message.includes('não participante'),
      );
    },
  },
  {
    name: 'reencerramento: encerrar e reeditar a mesma partida nao duplica jogos',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });
      const payload = {
        matchId: 'match-3',
        teamScore: 1,
        opponentScore: 0,
        ownGoalsForTeam: 0,
        fieldCost: null,
        playerStats: [{ playerId: 'player-9', goals: 1, assists: 0 }],
      };
      await mockRepository.finishMatch(payload, 'user-admin');
      const firstSnapshot = await mockRepository.getSnapshot();
      const firstBreakdown = buildPlayerStatBreakdown(
        firstSnapshot,
        'team-bocaiuva',
        'player-9',
      );

      await mockRepository.updateFinishedMatchStats(payload, 'user-admin');
      const secondSnapshot = await mockRepository.getSnapshot();
      const secondBreakdown = buildPlayerStatBreakdown(
        secondSnapshot,
        'team-bocaiuva',
        'player-9',
      );

      assert.equal(secondBreakdown.games.total, firstBreakdown.games.total);
      assert.equal(secondBreakdown.goals.total, firstBreakdown.goals.total);
      const statsForMatch = secondSnapshot.matchStats.filter(
        (stat) => stat.matchId === 'match-3' && stat.playerId === 'player-9',
      );
      assert.equal(statsForMatch.length, 1, 'apenas um MatchStat por jogador/partida');
    },
  },
  {
    name: 'updateFinishedMatchStats: edicao remove o efeito anterior (played=false tira o jogo da conta)',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });
      const before = await mockRepository.getSnapshot();
      const beforeBreakdown = buildPlayerStatBreakdown(before, 'team-bocaiuva', 'player-4');
      assert.ok(
        beforeBreakdown.games.matches.some((item) => item.matchId === 'match-1'),
        'match-1 conta para player-4 no seed',
      );

      await mockRepository.updateFinishedMatchStats(
        {
          matchId: 'match-1',
          teamScore: 3,
          opponentScore: 2,
          ownGoalsForTeam: 0,
          fieldCost: null,
          playerStats: [
            { playerId: 'player-4', goals: 0, assists: 0, played: false },
            { playerId: 'player-9', goals: 3, assists: 0 },
          ],
        },
        'user-admin',
      );

      const after = await mockRepository.getSnapshot();
      const afterBreakdown = buildPlayerStatBreakdown(after, 'team-bocaiuva', 'player-4');
      assert.equal(
        afterBreakdown.games.matches.some((item) => item.matchId === 'match-1'),
        false,
        'apos edicao, match-1 sai da contagem de player-8',
      );
      assert.equal(
        afterBreakdown.games.total,
        beforeBreakdown.games.total - 1,
        'edicao corrige o valor anterior sem duplicar',
      );
    },
  },
  {
    name: 'adminSetMatchAttendance: confirmar em partida encerrada cria sumula e passa a contar jogo',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });
      const before = await mockRepository.getSnapshot();
      const beforeBreakdown = buildPlayerStatBreakdown(before, 'team-bocaiuva', 'player-5');
      assert.equal(
        beforeBreakdown.games.matches.some((item) => item.matchId === 'match-1'),
        false,
        'player-5 estava absent no match-1',
      );

      await mockRepository.adminSetMatchAttendance('match-1', 'player-5', 'confirmed', 'user-admin');

      const after = await mockRepository.getSnapshot();
      const stat = after.matchStats.find(
        (item) => item.matchId === 'match-1' && item.playerId === 'player-5',
      );
      assert.ok(stat, 'sumula criada junto com a presenca');
      assert.equal(stat?.played, true);
      assert.equal(stat?.goals, 0);

      const afterBreakdown = buildPlayerStatBreakdown(after, 'team-bocaiuva', 'player-5');
      assert.equal(
        afterBreakdown.games.matches.some((item) => item.matchId === 'match-1'),
        true,
        'lista da partida e estatistica andam juntas',
      );

      const audit = buildPlayerParticipationAudit(after, 'team-bocaiuva', 'player-5');
      const row = audit.find((item) => item.matchId === 'match-1');
      assert.equal(row?.inconsistency, null, 'nenhuma inconsistencia apos a sincronizacao');
    },
  },
  {
    name: 'adminSetMatchAttendance: remover confirmado de partida encerrada apaga a sumula sem eventos',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });
      const before = await mockRepository.getSnapshot();
      const target = before.matchStats.find(
        (item) => item.matchId === 'match-1' && item.playerId === 'player-4',
      );
      assert.ok(target, 'seed precisa ter um confirmado sem gols no match-1');
      const playerId = target!.playerId;

      await mockRepository.adminSetMatchAttendance('match-1', playerId, 'absent', 'user-admin');

      const after = await mockRepository.getSnapshot();
      assert.equal(
        after.matchStats.some(
          (item) => item.matchId === 'match-1' && item.playerId === playerId,
        ),
        false,
        'sumula removida junto com a presenca',
      );
      const breakdown = buildPlayerStatBreakdown(after, 'team-bocaiuva', playerId);
      assert.equal(
        breakdown.games.matches.some((item) => item.matchId === 'match-1'),
        false,
      );
    },
  },
  {
    name: 'adminSetMatchAttendance: operacao repetida e idempotente',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });
      await mockRepository.adminSetMatchAttendance('match-1', 'player-5', 'confirmed', 'user-admin');
      await mockRepository.adminSetMatchAttendance('match-1', 'player-5', 'confirmed', 'user-admin');

      const snapshot = await mockRepository.getSnapshot();
      const stats = snapshot.matchStats.filter(
        (item) => item.matchId === 'match-1' && item.playerId === 'player-5',
      );
      assert.equal(stats.length, 1, 'repetir a confirmacao nao duplica sumula');
    },
  },
  {
    name: 'permissoes: jogador comum nao altera financeiro nem participantes',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'atacante@bocaiuva.app', password: '123456' });

      await assert.rejects(
        () =>
          mockRepository.updateMatchFieldCost(
            'match-4',
            { totalAmount: 185, splitCount: 10, note: null },
            'user-striker',
          ),
        (error) => error instanceof Error,
        'jogador comum nao pode definir valor da partida',
      );

      await assert.rejects(
        () => mockRepository.setTeamDefaultMatchCost('team-bocaiuva', 18500, 'user-striker'),
        (error) => error instanceof Error,
        'jogador comum nao pode alterar o valor padrao do time',
      );

      await assert.rejects(
        () =>
          mockRepository.adminSetMatchAttendance('match-1', 'player-5', 'confirmed', 'user-striker'),
        (error) => error instanceof Error,
        'jogador comum nao pode editar participantes',
      );
    },
  },
  {
    name: 'updateMatchFieldCost: admin define e edita valor sem tocar presenca, sumula e placar',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });
      const before = await mockRepository.getSnapshot();
      const beforeAttendance = before.attendance.filter((item) => item.matchId === 'match-4');

      await mockRepository.updateMatchFieldCost(
        'match-4',
        { totalAmount: amountFromCents(18500), splitCount: 10, note: null },
        'user-admin',
      );

      let snapshot = await mockRepository.getSnapshot();
      let match = snapshot.matches.find((item) => item.id === 'match-4');
      assert.equal(match?.fieldCost?.totalAmount, 185, 'valor salvo em partida agendada');
      assert.equal(match?.status, 'scheduled', 'salvar valor nao encerra a partida');
      assert.equal(
        snapshot.attendance.filter((item) => item.matchId === 'match-4').length,
        beforeAttendance.length,
        'presenca intacta',
      );
      assert.equal(
        snapshot.matchStats.some((item) => item.matchId === 'match-4'),
        false,
        'nenhuma sumula criada por causa do financeiro',
      );

      // editar valor de partida encerrada tambem funciona, sem tocar no placar
      const beforeFinished = snapshot.matches.find((item) => item.id === 'match-1');
      await mockRepository.updateMatchFieldCost(
        'match-1',
        { totalAmount: 200, splitCount: 8, note: null },
        'user-admin',
      );
      snapshot = await mockRepository.getSnapshot();
      match = snapshot.matches.find((item) => item.id === 'match-1');
      assert.equal(match?.fieldCost?.totalAmount, 200);
      assert.deepEqual(match?.scoreboard, beforeFinished?.scoreboard, 'placar preservado');

      // remover o valor
      await mockRepository.updateMatchFieldCost('match-1', null, 'user-admin');
      snapshot = await mockRepository.getSnapshot();
      match = snapshot.matches.find((item) => item.id === 'match-1');
      assert.equal(match?.fieldCost, null, 'valor removido fica pendente novamente');
    },
  },
  {
    name: 'updateMatchFieldCost: valor negativo rejeitado e valor zero aceito explicitamente',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });

      await assert.rejects(
        () =>
          mockRepository.updateMatchFieldCost(
            'match-4',
            { totalAmount: -10, splitCount: 10, note: null },
            'user-admin',
          ),
        (error) => error instanceof Error,
      );

      await mockRepository.updateMatchFieldCost(
        'match-4',
        { totalAmount: 0, splitCount: 10, note: null },
        'user-admin',
      );
      const snapshot = await mockRepository.getSnapshot();
      const match = snapshot.matches.find((item) => item.id === 'match-4');
      assert.equal(match?.fieldCost?.totalAmount, 0, 'zero e um valor valido e explicito');
    },
  },
  {
    name: 'valor padrao do time: nova partida recebe 185,00 e partidas antigas nao mudam',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });

      await assert.rejects(
        () => mockRepository.setTeamDefaultMatchCost('team-bocaiuva', -100, 'user-admin'),
        (error) => error instanceof Error,
        'padrao negativo rejeitado',
      );

      await mockRepository.setTeamDefaultMatchCost(
        'team-bocaiuva',
        DEFAULT_MATCH_COST_CENTS,
        'user-admin',
      );

      const before = await mockRepository.getSnapshot();
      const oldMatch = before.matches.find((item) => item.id === 'match-4');
      assert.equal(oldMatch?.fieldCost ?? null, null, 'partida antiga nao recebe o padrao novo');

      const created = await mockRepository.createMatch(
        {
          teamId: 'team-bocaiuva',
          seasonId: null,
          date: '2026-08-01',
          time: '20:00',
          venue: 'Arena Padrao',
          locationUrl: null,
          opponentName: 'Adversario Padrao',
          opponentLogoUrl: null,
          opponentTeamId: null,
          opponentTeamName: null,
          opponentTeamLogoUrl: null,
          opponentSource: null,
          linePlayersCount: 10,
          matchType: 'society',
          notes: '',
        },
        'user-admin',
      );

      assert.equal(created.fieldCost?.totalAmount, 185, 'nova partida recebe o valor padrao');
      assert.equal(created.fieldCost?.splitCount, 10);

      // alterar o padrao depois nao muda a partida ja criada
      await mockRepository.setTeamDefaultMatchCost('team-bocaiuva', 20000, 'user-admin');
      const after = await mockRepository.getSnapshot();
      const createdAfter = after.matches.find((item) => item.id === created.id);
      assert.equal(createdAfter?.fieldCost?.totalAmount, 185, 'mudar o padrao preserva partidas antigas');
    },
  },
  {
    name: 'auditoria sinaliza eventos sem played e registros duplicados',
    run() {
      const { team, player, finished } = buildBaseSnapshot();
      const eventsSnapshot = createSnapshot({
        teams: [team],
        players: [player],
        matches: [finished],
        attendance: [
          createAttendance({ teamId: TEAM_ID, matchId: finished.id, playerId: player.id }),
        ],
        matchStats: [
          createMatchStat({
            teamId: TEAM_ID,
            matchId: finished.id,
            playerId: player.id,
            played: false,
            goals: 1,
          }),
        ],
      });
      assert.equal(
        buildPlayerParticipationAudit(eventsSnapshot, TEAM_ID, player.id)[0]?.inconsistency,
        'events-without-played',
      );

      const duplicateSnapshot = createSnapshot({
        teams: [team],
        players: [player],
        matches: [finished],
        attendance: [
          createAttendance({ id: 'att-a', teamId: TEAM_ID, matchId: finished.id, playerId: player.id }),
          createAttendance({ id: 'att-b', teamId: TEAM_ID, matchId: finished.id, playerId: player.id }),
        ],
      });
      assert.equal(
        buildPlayerParticipationAudit(duplicateSnapshot, TEAM_ID, player.id)[0]?.inconsistency,
        'duplicate-attendance',
      );
    },
  },
  {
    name: 'regra de remocao bloqueia eventos, avaliacao, MVP e duplicidades',
    run() {
      const match = createMatch({ id: 'match-blockers', mvpWinnerPlayerIds: [] });
      const baseStat = createMatchStat({
        matchId: match.id,
        playerId: 'player-blocked',
        goals: 0,
        assists: 0,
      });

      assert.match(
        getParticipationRemovalBlocker({
          playerId: 'player-blocked',
          match,
          matchStat: { ...baseStat, goals: 1 },
          ratings: [],
          votes: [],
        }) ?? '',
        /gols ou assistências/,
      );
      assert.match(
        getParticipationRemovalBlocker({
          playerId: 'player-blocked',
          match,
          matchStat: baseStat,
          ratings: [
            {
              id: 'rating-blocked',
              teamId: match.teamId,
              matchId: match.id,
              raterPlayerId: 'player-other',
              targetPlayerId: 'player-blocked',
              overall: 4,
              createdAt: match.createdAt,
              updatedAt: match.updatedAt,
            },
          ],
          votes: [],
        }) ?? '',
        /avaliações/,
      );
      assert.match(
        getParticipationRemovalBlocker({
          playerId: 'player-blocked',
          match,
          matchStat: baseStat,
          ratings: [],
          votes: [
            {
              id: 'vote-blocked',
              teamId: match.teamId,
              matchId: match.id,
              voterPlayerId: 'player-blocked',
              targetPlayerId: 'player-other',
              createdAt: match.createdAt,
              updatedAt: match.updatedAt,
            },
          ],
        }) ?? '',
        /MVP/,
      );
      assert.equal(
        findDuplicateMatchStatPlayerId([
          baseStat,
          { ...baseStat, id: 'stat-duplicate' },
        ]),
        'player-blocked',
      );
      assert.match(
        getDuplicateParticipationMessage({ attendanceCount: 2, matchStatsCount: 1 }) ?? '',
        /múltiplos registros de presença/,
      );
    },
  },
  {
    name: 'adminSetMatchAttendance bloqueia remocao com eventos sem alterar estado local',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });

      await assert.rejects(
        () => mockRepository.adminSetMatchAttendance('match-1', 'player-9', 'absent', 'user-admin'),
        (error) => error instanceof Error && error.message.includes('gols ou assistências'),
      );

      const snapshot = await mockRepository.getSnapshot();
      assert.equal(
        snapshot.attendance.find(
          (item) => item.matchId === 'match-1' && item.playerId === 'player-9',
        )?.status,
        'confirmed',
      );
      assert.equal(
        snapshot.matchStats.find(
          (item) => item.matchId === 'match-1' && item.playerId === 'player-9',
        )?.goals,
        2,
      );
    },
  },
  {
    name: 'financeiro interpreta fieldCost legado em reais e rejeita valor persistido invalido',
    run() {
      const legacy = createMatch({
        fieldCost: {
          totalAmount: 185,
          splitCount: 10,
          amountPerPlayer: 18.5,
          currency: 'BRL',
        },
      });
      assert.equal(getMatchCostCents(legacy), 18500);
      assert.equal(
        getMatchCostCents(createMatch({ fieldCost: { ...legacy.fieldCost!, totalAmount: 0 } })),
        0,
      );
      assert.equal(
        getMatchCostCents(createMatch({ fieldCost: { ...legacy.fieldCost!, totalAmount: -1 } })),
        null,
      );
      assert.equal(
        getMatchCostCents(createMatch({ fieldCost: { ...legacy.fieldCost!, totalAmount: Number.NaN } })),
        null,
      );
    },
  },
  {
    name: 'valor padrao zero e herdado explicitamente apenas por nova partida',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });
      await mockRepository.setTeamDefaultMatchCost('team-bocaiuva', 0, 'user-admin');
      const created = await mockRepository.createMatch(
        {
          teamId: 'team-bocaiuva',
          seasonId: null,
          date: '2026-08-02',
          time: '20:00',
          venue: 'Arena Zero',
          locationUrl: null,
          opponentName: 'Adversario Zero',
          opponentLogoUrl: null,
          opponentTeamId: null,
          opponentTeamName: null,
          opponentTeamLogoUrl: null,
          opponentSource: null,
          linePlayersCount: 10,
          matchType: 'society',
          notes: '',
        },
        'user-admin',
      );
      assert.equal(created.fieldCost?.totalAmount, 0);
      assert.equal(created.fieldCost?.splitCount, 10);
    },
  },
  {
    name: 'reedicao remove gols e assistencias explicitamente sem trocar IDs legados',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });
      const before = await mockRepository.getSnapshot();
      const match = before.matches.find((item) => item.id === 'match-1')!;
      const beforeStats = before.matchStats.filter((item) => item.matchId === match.id);
      const beforeIds = beforeStats.map((item) => item.id).sort();

      await mockRepository.updateFinishedMatchStats(
        {
          matchId: match.id,
          teamScore: match.scoreboard?.team ?? 0,
          opponentScore: match.scoreboard?.opponent ?? 0,
          ownGoalsForTeam: match.scoreboard?.ownGoalsForTeam ?? 0,
          fieldCost: match.fieldCost
            ? {
                totalAmount: match.fieldCost.totalAmount,
                splitCount: match.fieldCost.splitCount,
                note: match.fieldCost.note,
              }
            : null,
          playerStats: beforeStats.map((stat) => ({
            playerId: stat.playerId,
            played: stat.played,
            goals: stat.playerId === 'player-9' ? 0 : stat.goals,
            assists: stat.playerId === 'player-6' ? 0 : stat.assists,
          })),
        },
        'user-admin',
      );

      const after = await mockRepository.getSnapshot();
      const afterStats = after.matchStats.filter((item) => item.matchId === match.id);
      assert.deepEqual(afterStats.map((item) => item.id).sort(), beforeIds);
      assert.equal(afterStats.find((item) => item.playerId === 'player-9')?.goals, 0);
      assert.equal(afterStats.find((item) => item.playerId === 'player-6')?.assists, 0);
    },
  },
  {
    name: 'script de auditoria exige confirmacao forte antes do apply',
    run() {
      const source = fs.readFileSync('scripts/audit-player-stats.ts', 'utf8');
      assert.match(source, /--apply exige também --yes/);
      assert.match(source, /--confirm-team/);
      assert.match(source, /--project-id <id> explícito/);
      assert.match(source, /projeto Firebase selecionado/);
      assert.match(source, /nomes ambíguos/);
      assert.match(source, /const WRITE_BATCH_SIZE = 250/);
      assert.match(source, /fetchCollectionForTeam<MvpVoteDoc>/);
      assert.match(source, /fetchCollectionForTeam<PlayerRatingDoc>/);
      assert.match(source, /stat\.yellowCards/);
      assert.match(source, /hasMvpDependency/);
      assert.match(source, /relatório antes\/depois/);
    },
  },
  {
    name: 'financeiro bloqueia partida inexistente e recurso de outro time',
    async run() {
      resetMockRepositoryState();
      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });

      for (const matchId of ['match-inexistente', 'match-serrano-1']) {
        await assert.rejects(
          () =>
            mockRepository.updateMatchFieldCost(
              matchId,
              { totalAmount: 185, splitCount: 10, note: null },
              'user-admin',
            ),
          (error) => error instanceof Error,
        );
      }

      await assert.rejects(
        () => mockRepository.setTeamDefaultMatchCost('team-serrano', 18500, 'user-admin'),
        (error) => error instanceof Error,
      );
    },
  },
];
