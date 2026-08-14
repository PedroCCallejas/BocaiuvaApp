import assert from 'node:assert/strict';

import { checkPlayerDeletion } from '@/lib/player-deletion';
import {
  mockRepository,
  resetMockRepositoryState,
} from '@/services/repository/mock-repository';
import type { AttendanceRecord, Lineup, Match, MatchStat } from '@/types/domain';

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

export const playerDeletionTestCases: TestCase[] = [
  {
    name: 'jogador sem historico pode ser apagado',
    run() {
      const check = checkPlayerDeletion('player-novo', {});

      assert.equal(check.allowed, true);
      assert.deepEqual(check.blockers, []);
      assert.equal(check.message, null);
    },
  },
  {
    name: 'jogador com sumula nao pode ser apagado e a mensagem explica o porque',
    run() {
      const check = checkPlayerDeletion('player-1', {
        matchStats: [
          { id: 's1', teamId: 't', matchId: 'm', playerId: 'player-1', goals: 2, assists: 0 },
        ] as unknown as MatchStat[],
      });

      assert.equal(check.allowed, false);
      assert.equal(check.blockers[0]?.kind, 'match-stats');
      assert.match(check.message ?? '', /Inativar jogador/);
    },
  },
  {
    name: 'presenca respondida bloqueia, mas convite pendente nao',
    run() {
      const respondida = checkPlayerDeletion('player-1', {
        attendance: [
          { id: 'a1', teamId: 't', matchId: 'm', playerId: 'player-1', status: 'confirmed' },
        ] as unknown as AttendanceRecord[],
      });

      // Jogador novo ja nasce com convite `pending` nas partidas abertas.
      // Se isso contasse, apagar cadastro criado por engano seria impossivel.
      const pendente = checkPlayerDeletion('player-1', {
        attendance: [
          { id: 'a1', teamId: 't', matchId: 'm', playerId: 'player-1', status: 'pending' },
          { id: 'a2', teamId: 't', matchId: 'm2', playerId: 'player-1', status: 'pending' },
        ] as unknown as AttendanceRecord[],
      });

      assert.equal(respondida.allowed, false);
      assert.equal(respondida.blockers[0]?.kind, 'attendance');
      assert.equal(pendente.allowed, true);
    },
  },
  {
    name: 'mensagem pluraliza o substantivo certo',
    run() {
      const check = checkPlayerDeletion('player-1', {
        attendance: [
          { id: 'a1', teamId: 't', matchId: 'm', playerId: 'player-1', status: 'confirmed' },
          { id: 'a2', teamId: 't', matchId: 'm2', playerId: 'player-1', status: 'absent' },
        ] as unknown as AttendanceRecord[],
      });

      assert.match(check.message ?? '', /2 respostas de presença/);
    },
  },
  {
    name: 'aparecer em escalacao, titular ou banco, bloqueia',
    run() {
      const titular = checkPlayerDeletion('player-1', {
        lineups: [
          {
            id: 'l1',
            teamId: 't',
            matchId: 'm',
            formationKey: '4-4-2',
            starters: [{ playerId: 'player-1' }],
            benchPlayerIds: [],
          },
        ] as unknown as Lineup[],
      });

      const banco = checkPlayerDeletion('player-1', {
        lineups: [
          {
            id: 'l1',
            teamId: 't',
            matchId: 'm',
            formationKey: '4-4-2',
            starters: [],
            benchPlayerIds: ['player-1'],
          },
        ] as unknown as Lineup[],
      });

      assert.equal(titular.allowed, false);
      assert.equal(banco.allowed, false);
    },
  },
  {
    name: 'constar em pagamento do campo bloqueia, inclusive como nao pagante',
    run() {
      const pagante = checkPlayerDeletion('player-1', {
        matches: [
          { id: 'm', teamId: 't', fieldPayment: { payerPlayerIds: ['player-1'] } },
        ] as unknown as Match[],
      });

      const isento = checkPlayerDeletion('player-1', {
        matches: [
          {
            id: 'm',
            teamId: 't',
            fieldPayment: { payerPlayerIds: [], exemptPlayerIds: ['player-1'] },
          },
        ] as unknown as Match[],
      });

      assert.equal(pagante.allowed, false);
      assert.equal(isento.allowed, false);
      assert.equal(pagante.blockers[0]?.kind, 'field-payments');
    },
  },
  {
    name: 'despesa apagada nao conta como historico',
    run() {
      const check = checkPlayerDeletion('player-1', {
        expenses: [
          {
            id: 'e1',
            teamId: 't',
            categoryId: 'c',
            date: '2026-08-10',
            totalAmountCents: 1000,
            splitMode: 'equal',
            participantPlayerIds: ['player-1'],
            settledPlayerIds: [],
            deletedAt: '2026-08-11T00:00:00.000Z',
          },
        ] as never,
      });

      assert.equal(check.allowed, true);
    },
  },
  {
    name: 'a mensagem lista todos os vinculos encontrados',
    run() {
      const check = checkPlayerDeletion('player-1', {
        matchStats: [
          { id: 's1', teamId: 't', matchId: 'm', playerId: 'player-1', goals: 1, assists: 0 },
        ] as unknown as MatchStat[],
        attendance: [
          { id: 'a1', teamId: 't', matchId: 'm', playerId: 'player-1', status: 'confirmed' },
        ] as unknown as AttendanceRecord[],
      });

      assert.equal(check.blockers.length, 2);
      assert.match(check.message ?? '', /súmula/);
      assert.match(check.message ?? '', /presença/);
    },
  },
  {
    name: 'admin apaga jogador recem-criado e ele some do elenco',
    async run() {
      resetMockRepositoryState();
      const admin = await mockRepository.login({
        email: 'admin@bocaiuva.app',
        password: '123456',
      });
      const snapshot = await mockRepository.getSnapshot();
      const team = snapshot.teams[0]!;

      const player = await mockRepository.createPlayer(
        {
          teamId: team.id,
          fullName: 'Cadastro Errado',
          nickname: 'Errado',
          jerseyNumber: 88,
          primaryPosition: 'midfielder',
          secondaryPositions: [],
          dominantFoot: 'right',
          status: 'active',
        },
        admin.id,
      );

      await mockRepository.deletePlayerPermanently(player.id, admin.id);

      const depois = await mockRepository.getSnapshot();
      assert.equal(
        depois.players.some((item) => item.id === player.id),
        false,
      );
    },
  },
  {
    name: 'jogador com historico do seed nao pode ser apagado pelo repositorio',
    async run() {
      resetMockRepositoryState();
      const admin = await mockRepository.login({
        email: 'admin@bocaiuva.app',
        password: '123456',
      });

      await assert.rejects(
        () => mockRepository.deletePlayerPermanently('player-1', admin.id),
        (error) => error instanceof Error && /Inativar jogador/.test(error.message),
      );
    },
  },
  {
    name: 'jogador comum nao apaga cadastro de ninguem',
    async run() {
      resetMockRepositoryState();
      const admin = await mockRepository.login({
        email: 'admin@bocaiuva.app',
        password: '123456',
      });
      const snapshot = await mockRepository.getSnapshot();
      const team = snapshot.teams[0]!;

      const player = await mockRepository.createPlayer(
        {
          teamId: team.id,
          fullName: 'Alvo',
          nickname: 'Alvo',
          jerseyNumber: 89,
          primaryPosition: 'midfielder',
          secondaryPositions: [],
          dominantFoot: 'right',
          status: 'active',
        },
        admin.id,
      );

      await assert.rejects(
        () => mockRepository.deletePlayerPermanently(player.id, 'user-striker'),
        (error) => error instanceof Error,
      );
    },
  },
];
