import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  buildPlayerFeeExemption,
  describeFeeExemption,
  getExemptPlayerIdsForDate,
  isFeeExemptOnDate,
  isPlayerFeeExemptOnDate,
  isValidExemptionDate,
} from '@/lib/fee-exemption';
import type { Player, PlayerFeeExemption } from '@/types/domain';

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

function createPlayer(id: string, feeExemption: PlayerFeeExemption | null = null): Player {
  return {
    id,
    teamId: 'team-1',
    fullName: `Jogador ${id}`,
    nickname: id,
    jerseyNumber: 1,
    primaryPosition: 'midfielder',
    secondaryPositions: [],
    dominantFoot: 'right',
    status: 'active',
    feeExemption,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  } as Player;
}

export const feeExemptionTestCases: TestCase[] = [
  {
    name: 'goleiro com isencao permanente nunca entra no rateio',
    run() {
      const exemption: PlayerFeeExemption = { mode: 'always', reason: 'Goleiro' };

      assert.equal(isFeeExemptOnDate(exemption, '2026-01-01'), true);
      assert.equal(isFeeExemptOnDate(exemption, '2030-12-31'), true);
    },
  },
  {
    name: 'cortesia por prazo vale ate a data escolhida, inclusive',
    run() {
      const exemption: PlayerFeeExemption = { mode: 'until', until: '2026-09-30' };

      assert.equal(isFeeExemptOnDate(exemption, '2026-08-12'), true);
      // O ultimo dia ainda e cortesia.
      assert.equal(isFeeExemptOnDate(exemption, '2026-09-30'), true);
      assert.equal(isFeeExemptOnDate(exemption, '2026-10-01'), false);
    },
  },
  {
    name: 'partida antiga lancada depois respeita o prazo da epoca',
    run() {
      const exemption: PlayerFeeExemption = { mode: 'until', until: '2026-06-30' };

      // Um contador de jogos erraria aqui: a partida de maio entra no sistema
      // hoje e precisa continuar isenta, sem consumir cortesia atual.
      assert.equal(isFeeExemptOnDate(exemption, '2026-05-10'), true);
      assert.equal(isFeeExemptOnDate(exemption, '2026-08-12'), false);
    },
  },
  {
    name: 'isencao ausente ou mal formada nao isenta ninguem',
    run() {
      assert.equal(isFeeExemptOnDate(null, '2026-08-12'), false);
      assert.equal(isFeeExemptOnDate(undefined, '2026-08-12'), false);
      assert.equal(isFeeExemptOnDate({ mode: 'until', until: null }, '2026-08-12'), false);
      assert.equal(isFeeExemptOnDate({ mode: 'until', until: '30/09/2026' }, '2026-08-12'), false);
      assert.equal(isFeeExemptOnDate({ mode: 'until', until: '2026-09-30' }, 'ontem'), false);
    },
  },
  {
    name: 'validacao de data aceita apenas AAAA-MM-DD',
    run() {
      assert.equal(isValidExemptionDate('2026-09-30'), true);
      assert.equal(isValidExemptionDate('30/09/2026'), false);
      assert.equal(isValidExemptionDate(''), false);
      assert.equal(isValidExemptionDate(null), false);
    },
  },
  {
    name: 'lista de isentos do jogo considera cada jogador na data da partida',
    run() {
      const players = [
        createPlayer('goleiro', { mode: 'always' }),
        createPlayer('lesionado', { mode: 'until', until: '2026-08-31' }),
        createPlayer('vencido', { mode: 'until', until: '2026-07-31' }),
        createPlayer('comum'),
      ];

      assert.deepEqual(getExemptPlayerIdsForDate(players, '2026-08-12'), [
        'goleiro',
        'lesionado',
      ]);
      assert.deepEqual(getExemptPlayerIdsForDate(players, '2026-09-15'), ['goleiro']);
    },
  },
  {
    name: 'construir isencao normaliza os tres modos',
    run() {
      const base = { updatedAt: '2026-08-12T12:00:00.000Z' };

      assert.equal(buildPlayerFeeExemption({ ...base, mode: 'none' }), null);

      const always = buildPlayerFeeExemption({ ...base, mode: 'always', reason: '  Goleiro ' });
      assert.equal(always?.mode, 'always');
      assert.equal(always?.until, null);
      assert.equal(always?.reason, 'Goleiro');

      const until = buildPlayerFeeExemption({
        ...base,
        mode: 'until',
        until: ' 2026-09-30 ',
      });
      assert.equal(until?.mode, 'until');
      assert.equal(until?.until, '2026-09-30');
    },
  },
  {
    name: 'construir isencao com prazo exige data valida',
    run() {
      assert.throws(
        () =>
          buildPlayerFeeExemption({
            mode: 'until',
            until: '30/09/2026',
            updatedAt: '2026-08-12T12:00:00.000Z',
          }),
        /AAAA-MM-DD/,
      );
    },
  },
  {
    name: 'descricao da isencao muda quando o prazo ja passou',
    run() {
      assert.equal(describeFeeExemption(null), 'Paga o rateio normalmente');
      assert.equal(
        describeFeeExemption({ mode: 'always', reason: 'Goleiro' }),
        'Nunca entra no rateio · Goleiro',
      );
      assert.equal(
        describeFeeExemption({ mode: 'until', until: '2026-09-30' }, '2026-08-12'),
        'Isento até 30/09/2026',
      );
      assert.equal(
        describeFeeExemption({ mode: 'until', until: '2026-07-31' }, '2026-08-12'),
        'Cortesia encerrada em 31/07/2026',
      );
    },
  },
  {
    name: 'jogador sem isencao paga normalmente',
    run() {
      assert.equal(isPlayerFeeExemptOnDate(createPlayer('comum'), '2026-08-12'), false);
    },
  },
  {
    name: 'a isencao da ficha vale sozinha, sem depender de quando a tela abriu',
    run() {
      const screen = fs.readFileSync('src/app/(app)/matches/[matchId].tsx', 'utf8');

      // Antes so era aplicada se o admin abrisse o pagamento depois de todo
      // mundo confirmar e antes de salvar qualquer coisa. Na pratica, nunca.
      assert.match(screen, /const effectiveExemptPlayerIds = useMemo/);

      const derivada = screen.slice(
        screen.indexOf('const effectiveExemptPlayerIds = useMemo'),
        screen.indexOf('// Confere quem realmente paga'),
      );

      assert.match(derivada, /getExemptPlayerIdsForDate\(/);
      assert.match(derivada, /exemptPlayerIdsDraft/);
      // Quem pagou sai da lista de isentos: pagou, pagou.
      assert.match(derivada, /!payerPlayerIdsDraft\.includes\(playerId\)/);
    },
  },
  {
    name: 'isento nao aparece com botao de marcar como pago',
    run() {
      const screen = fs.readFileSync('src/app/(app)/matches/[matchId].tsx', 'utf8');

      // O admin tinha de marcar "nao paga" em toda partida mesmo com a ficha
      // dizendo que o jogador e isento.
      assert.match(screen, /const isExempt = effectiveExemptPlayerIds\.includes\(player\.id\);/);
      assert.match(screen, /\{!isExempt \? \(\s*<Pressable/);
    },
  },
  {
    name: 'isencao da ficha nao oferece botao que nao desfaz nada',
    run() {
      const screen = fs.readFileSync('src/app/(app)/matches/[matchId].tsx', 'utf8');

      // Quem manda e a data configurada no jogador. Um "Voltar ao rateio" que
      // nao volta seria pior do que nao existir.
      assert.match(screen, /hasStandingExemption \? \(/);
      assert.match(screen, /Isenção na ficha/);
    },
  },
  {
    name: 'o rateio respeita a ficha mesmo sem pagamento salvo',
    run() {
      const lib = fs.readFileSync('src/lib/expenses.ts', 'utf8');

      // Sem isto, a divida aparecia so porque ninguem tinha aberto a tela de
      // pagamento daquela partida.
      assert.match(lib, /standingExemptPlayerIds: string\[\] = \[\]/);
      assert.match(lib, /getExemptPlayerIdsForDate\(players, match\.date\)/);
    },
  },
];
