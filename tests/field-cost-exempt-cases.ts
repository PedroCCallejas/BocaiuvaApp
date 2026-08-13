import assert from 'node:assert/strict';

import { buildMatchFieldPayment, checkFieldCostSplit } from '@/lib/field-cost';
import type { MatchFieldCost } from '@/types/domain';

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

const fieldCost: MatchFieldCost = {
  totalAmount: 185,
  splitCount: 10,
  amountPerPlayer: 18.5,
  currency: 'BRL',
};

const confirmed12 = Array.from({ length: 12 }, (_, index) => `player-${index + 1}`);

export const fieldCostExemptTestCases: TestCase[] = [
  {
    name: 'conferencia acusa quando ha mais pagantes do que cotas',
    run() {
      const check = checkFieldCostSplit({
        splitCount: 10,
        confirmedPlayerIds: confirmed12,
      });

      assert.equal(check.confirmedCount, 12);
      assert.equal(check.payingCount, 12);
      assert.equal(check.balanced, false);
      // Faltam 2 cotas: e o admin que decide quem fica de fora.
      assert.equal(check.differenceFromSplit, -2);
    },
  },
  {
    name: 'conferencia fecha quando os nao pagantes cobrem a diferenca',
    run() {
      const check = checkFieldCostSplit({
        splitCount: 10,
        confirmedPlayerIds: confirmed12,
        exemptPlayerIds: ['player-11', 'player-12'],
      });

      assert.equal(check.exemptCount, 2);
      assert.equal(check.payingCount, 10);
      assert.equal(check.balanced, true);
      assert.equal(check.differenceFromSplit, 0);
    },
  },
  {
    name: 'conferencia considera convidados extras no fechamento',
    run() {
      const check = checkFieldCostSplit({
        splitCount: 12,
        confirmedPlayerIds: confirmed12.slice(0, 10),
        paidGuestCount: 2,
      });

      assert.equal(check.balanced, true);
    },
  },
  {
    name: 'conferencia ignora isento que nem confirmou presenca',
    run() {
      const check = checkFieldCostSplit({
        splitCount: 10,
        confirmedPlayerIds: confirmed12.slice(0, 10),
        exemptPlayerIds: ['player-99'],
      });

      assert.equal(check.exemptCount, 0);
      assert.equal(check.payingCount, 10);
    },
  },
  {
    name: 'salvar aceita nao pagantes e devolve a lista limpa',
    run() {
      const payment = buildMatchFieldPayment({
        values: {
          payerPlayerIds: ['player-1', 'player-2'],
          exemptPlayerIds: ['player-11', 'player-11', 'player-12'],
          paidGuestCount: 0,
        },
        fieldCost,
        confirmedPlayerIds: confirmed12,
        updatedAt: '2026-08-12T12:00:00.000Z',
        updatedByUserId: 'user-admin',
      });

      assert.deepEqual(payment.exemptPlayerIds, ['player-11', 'player-12']);
      assert.deepEqual(payment.payerPlayerIds, ['player-1', 'player-2']);
    },
  },
  {
    name: 'salvar recusa nao pagante que nao confirmou presenca',
    run() {
      assert.throws(
        () =>
          buildMatchFieldPayment({
            values: { payerPlayerIds: [], exemptPlayerIds: ['player-99'], paidGuestCount: 0 },
            fieldCost,
            confirmedPlayerIds: confirmed12,
            updatedAt: '2026-08-12T12:00:00.000Z',
            updatedByUserId: 'user-admin',
          }),
        /confirmados podem ser marcados como não pagantes/,
      );
    },
  },
  {
    name: 'salvar recusa jogador marcado como pago e como nao pagante',
    run() {
      assert.throws(
        () =>
          buildMatchFieldPayment({
            values: {
              payerPlayerIds: ['player-1'],
              exemptPlayerIds: ['player-1'],
              paidGuestCount: 0,
            },
            fieldCost,
            confirmedPlayerIds: confirmed12,
            updatedAt: '2026-08-12T12:00:00.000Z',
            updatedByUserId: 'user-admin',
          }),
        /pago e como não pagante ao mesmo tempo/,
      );
    },
  },
  {
    name: 'mensagem do limite de pagantes aponta o caminho do nao pagante',
    run() {
      assert.throws(
        () =>
          buildMatchFieldPayment({
            values: { payerPlayerIds: confirmed12, paidGuestCount: 0 },
            fieldCost,
            confirmedPlayerIds: confirmed12,
            updatedAt: '2026-08-12T12:00:00.000Z',
            updatedByUserId: 'user-admin',
          }),
        /Não paga/,
      );
    },
  },
];
