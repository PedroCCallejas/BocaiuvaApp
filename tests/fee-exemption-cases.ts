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
import { buildPlayerBalances, collectTeamExpenses } from '@/lib/expenses';
import type {
  AttendanceRecord,
  Expense,
  Match,
  Player,
  PlayerFeeExemption,
} from '@/types/domain';

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

const ISENTO = createPlayer('goleiro', { mode: 'always', reason: 'Goleiro' });
const PAGANTE = createPlayer('lateral');

/**
 * Campo de R$ 100 com dois confirmados, mas dividido por 1: o goleiro é isento,
 * então o admin informa que só uma pessoa racha.
 */
function partidaComCampo(splitCount = 1): Match {
  return {
    id: 'match-1',
    teamId: 'team-1',
    date: '2026-08-13',
    time: '20:00',
    venue: 'Campo',
    opponentName: 'Adversario',
    linePlayersCount: 5,
    matchType: 'society',
    status: 'finished',
    createdBy: 'user-1',
    fieldCost: {
      totalAmount: 100,
      splitCount,
      amountPerPlayer: 100 / splitCount,
      currency: 'BRL',
    },
    createdAt: '2026-08-13T00:00:00.000Z',
    updatedAt: '2026-08-13T00:00:00.000Z',
  } as Match;
}

function presenca(playerId: string): AttendanceRecord {
  return {
    id: `match-1__${playerId}`,
    teamId: 'team-1',
    matchId: 'match-1',
    playerId,
    status: 'confirmed',
    createdAt: '2026-08-13T00:00:00.000Z',
    updatedAt: '2026-08-13T00:00:00.000Z',
  } as AttendanceRecord;
}

/** Cerveja de R$ 60 dividida entre os dois. */
function despesaAvulsa(): Expense {
  return {
    id: 'expense-1',
    teamId: 'team-1',
    categoryId: 'cerveja',
    date: '2026-08-13',
    totalAmountCents: 6000,
    splitMode: 'equal',
    participantPlayerIds: ['goleiro', 'lateral'],
    settledPlayerIds: [],
    createdAt: '2026-08-13T00:00:00.000Z',
    updatedAt: '2026-08-13T00:00:00.000Z',
  } as Expense;
}

export const feeExemptionTestCases: TestCase[] = [
  {
    name: 'a isencao tira o jogador da cota do campo',
    run() {
      const [campo] = collectTeamExpenses({
        teamId: 'team-1',
        matches: [partidaComCampo()],
        attendance: [presenca('goleiro'), presenca('lateral')],
        players: [ISENTO, PAGANTE],
      });

      // Os R$ 100 ficam inteiros com quem paga; o goleiro nao deve nada.
      assert.equal(campo.sharesCents.goleiro, undefined);
      assert.equal(campo.sharesCents.lateral, 10000);
    },
  },
  {
    name: 'cota do isento vira cota de convidado, nao e jogada em quem paga',
    run() {
      // Admin informou "dividir por 2" mas um dos dois e isento. O app NAO
      // redistribui os R$ 50 restantes em cima de quem paga — inventaria uma
      // divida que ninguem combinou. A sobra fica como cota nao identificada,
      // e `checkFieldCostSplit` avisa o admin da divergencia.
      const [campo] = collectTeamExpenses({
        teamId: 'team-1',
        matches: [partidaComCampo(2)],
        attendance: [presenca('goleiro'), presenca('lateral')],
        players: [ISENTO, PAGANTE],
      });

      assert.equal(campo.sharesCents.goleiro, undefined);
      assert.equal(campo.sharesCents.lateral, 5000);
      assert.equal(campo.extraSharesCount, 1);
    },
  },
  {
    name: 'a isencao NAO vale para despesa fora do jogo',
    run() {
      // A isencao e da cota do campo. Cerveja, bola e churrasco continuam
      // sendo rateados entre quem o admin marcou — quem bebeu, bebeu.
      const [cerveja] = collectTeamExpenses({
        teamId: 'team-1',
        expenses: [despesaAvulsa()],
        players: [ISENTO, PAGANTE],
        includeFieldCosts: false,
      });

      assert.equal(cerveja.sharesCents.goleiro, 3000);
      assert.equal(cerveja.sharesCents.lateral, 3000);
    },
  },
  {
    name: 'o mesmo jogador pode ser isento no campo e devedor na cerveja',
    run() {
      const tudo = collectTeamExpenses({
        teamId: 'team-1',
        expenses: [despesaAvulsa()],
        matches: [partidaComCampo()],
        attendance: [presenca('goleiro'), presenca('lateral')],
        players: [ISENTO, PAGANTE],
      });

      const saldo = buildPlayerBalances(tudo).find((item) => item.playerId === 'goleiro');

      // So a cerveja: R$ 30. Se a isencao vazasse para as despesas, daria 0.
      assert.equal(saldo?.owedCents, 3000);
    },
  },
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
    name: 'isencao sem autor nao grava undefined no Firestore',
    run() {
      // O Firestore recusa o documento INTEIRO ao encontrar `undefined` em
      // qualquer campo, por mais fundo que esteja. Era o que derrubava
      // "Salvar isenção" com uma mensagem so compreensivel para quem escreveu
      // o codigo.
      const semAutor = buildPlayerFeeExemption({
        mode: 'always',
        reason: 'Presidente',
        updatedAt: '2026-08-24T16:00:00.000Z',
      });

      assert.equal('updatedByUserId' in (semAutor ?? {}), false);

      const comAutor = buildPlayerFeeExemption({
        mode: 'always',
        updatedAt: '2026-08-24T16:00:00.000Z',
        updatedByUserId: 'user-1',
      });

      assert.equal(comAutor?.updatedByUserId, 'user-1');
    },
  },
  {
    name: 'undefined aninhado e removido antes de ir ao Firestore',
    run() {
      const repo = fs.readFileSync(
        'src/services/repository/firebase-repository.ts',
        'utf8',
      );
      const funcao = repo.slice(repo.indexOf('function stripUndefined'));

      // A versao rasa so olhava o primeiro nivel, e por isso
      // `feeExemption.updatedByUserId` passava batido.
      assert.match(funcao.slice(0, 800), /stripUndefined\(item\)/);
      assert.match(funcao.slice(0, 800), /Array\.isArray\(value\)/);
      assert.match(funcao.slice(0, 800), /isPlainObject/);
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
