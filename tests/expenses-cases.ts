import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  buildExpensesSummary,
  buildPlayerBalances,
  calculateExpenseShares,
  collectTeamExpenses,
  fieldCostToUnifiedExpense,
  splitEqualCents,
  toUnifiedExpense,
} from '@/lib/expenses';
import type { Expense, Match } from '@/types/domain';

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

function createExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 'expense-1',
    teamId: 'team-1',
    categoryId: 'cat-cerveja',
    matchId: null,
    description: null,
    date: '2026-08-10',
    totalAmountCents: 10000,
    paidByPlayerId: null,
    splitMode: 'equal',
    participantPlayerIds: ['player-1', 'player-2'],
    extraSharesCount: 0,
    settledPlayerIds: [],
    createdBy: 'user-admin',
    createdAt: '2026-08-10T12:00:00.000Z',
    updatedAt: '2026-08-10T12:00:00.000Z',
    ...overrides,
  } as Expense;
}

function createMatchWithFieldCost(overrides: Partial<Match> = {}): Match {
  return {
    id: 'match-1',
    teamId: 'team-1',
    date: '2026-08-09',
    time: '20:00',
    opponentName: 'Adversario',
    status: 'finished',
    matchType: 'society',
    createdAt: '2026-08-09T12:00:00.000Z',
    updatedAt: '2026-08-09T12:00:00.000Z',
    fieldCost: {
      totalAmount: 200,
      splitCount: 10,
      amountPerPlayer: 20,
      currency: 'BRL',
    },
    fieldPayment: {
      payerPlayerIds: ['player-1', 'player-2'],
      paidGuestCount: 0,
    },
    ...overrides,
  } as Match;
}

export const expensesTestCases: TestCase[] = [
  {
    name: 'rateio igual distribui a sobra de centavos e a soma fecha exatamente o total',
    run() {
      assert.deepEqual(splitEqualCents(100, 3), [34, 33, 33]);
      assert.deepEqual(splitEqualCents(10, 4), [3, 3, 2, 2]);
      assert.deepEqual(splitEqualCents(9000, 3), [3000, 3000, 3000]);

      for (const [total, count] of [
        [100, 3],
        [18500, 7],
        [1, 5],
        [99999, 13],
      ] as Array<[number, number]>) {
        const parts = splitEqualCents(total, count);
        assert.equal(parts.length, count);
        assert.equal(
          parts.reduce((sum, value) => sum + value, 0),
          total,
          `total ${total} entre ${count} nao fechou`,
        );
      }
    },
  },
  {
    name: 'rateio igual rejeita entrada invalida sem quebrar',
    run() {
      assert.deepEqual(splitEqualCents(100, 0), []);
      assert.deepEqual(splitEqualCents(-100, 3), []);
      assert.deepEqual(splitEqualCents(10.5, 3), []);
    },
  },
  {
    name: 'despesa dividida igual entre participantes e convidados fecha o total',
    run() {
      const shares = calculateExpenseShares({
        totalAmountCents: 10000,
        splitMode: 'equal',
        participantPlayerIds: ['player-1', 'player-2', 'player-3'],
        extraSharesCount: 1,
      });

      assert.equal(shares.distributedCents, 10000);
      assert.equal(Object.keys(shares.sharesCents).length, 3);
      assert.equal(
        Object.values(shares.sharesCents).reduce((sum, value) => sum + value, 0) +
          shares.extraSharesCents,
        10000,
      );
    },
  },
  {
    name: 'participante repetido nao gera cota extra nem desequilibra o total',
    run() {
      const shares = calculateExpenseShares({
        totalAmountCents: 900,
        splitMode: 'equal',
        participantPlayerIds: ['player-1', 'player-1', 'player-2'],
        extraSharesCount: 0,
      });

      assert.equal(Object.keys(shares.sharesCents).length, 2);
      assert.equal(shares.distributedCents, 900);
      assert.equal(shares.sharesCents['player-1'], 450);
      assert.equal(shares.sharesCents['player-2'], 450);
    },
  },
  {
    name: 'rateio manual respeita os valores informados quando somam o total',
    run() {
      const shares = calculateExpenseShares({
        totalAmountCents: 10000,
        splitMode: 'manual',
        participantPlayerIds: ['player-1', 'player-2'],
        extraSharesCount: 0,
        manualSharesCents: { 'player-1': 7000, 'player-2': 3000 },
      });

      assert.equal(shares.sharesCents['player-1'], 7000);
      assert.equal(shares.sharesCents['player-2'], 3000);
      assert.equal(shares.distributedCents, 10000);
    },
  },
  {
    name: 'rateio manual incompleto joga a diferenca no primeiro participante e fecha o total',
    run() {
      const faltando = calculateExpenseShares({
        totalAmountCents: 10000,
        splitMode: 'manual',
        participantPlayerIds: ['player-1', 'player-2'],
        extraSharesCount: 0,
        manualSharesCents: { 'player-2': 3000 },
      });

      assert.equal(faltando.distributedCents, 10000);
      assert.equal(faltando.sharesCents['player-1'], 7000);

      const sobrando = calculateExpenseShares({
        totalAmountCents: 10000,
        splitMode: 'manual',
        participantPlayerIds: ['player-1', 'player-2'],
        extraSharesCount: 0,
        manualSharesCents: { 'player-1': 9000, 'player-2': 4000 },
      });

      assert.equal(sobrando.distributedCents, 10000);
    },
  },
  {
    name: 'despesa sem participantes ou sem valor nao distribui nada',
    run() {
      assert.equal(
        calculateExpenseShares({
          totalAmountCents: 10000,
          splitMode: 'equal',
          participantPlayerIds: [],
          extraSharesCount: 0,
        }).distributedCents,
        0,
      );

      assert.equal(
        calculateExpenseShares({
          totalAmountCents: 0,
          splitMode: 'equal',
          participantPlayerIds: ['player-1'],
          extraSharesCount: 0,
        }).distributedCents,
        0,
      );
    },
  },
  {
    name: 'despesa nasce solta: matchId nulo e preservado no formato unificado',
    run() {
      const unified = toUnifiedExpense(createExpense(), 'Cerveja');

      assert.equal(unified.matchId, null);
      assert.equal(unified.source, 'expense');
      assert.equal(unified.categoryLabel, 'Cerveja');
      assert.equal(unified.totalAmountCents, 10000);
    },
  },
  {
    name: 'custo do campo legado e adaptado para o formato unificado sem migracao',
    run() {
      const unified = fieldCostToUnifiedExpense(createMatchWithFieldCost());

      assert.notEqual(unified, null);
      assert.equal(unified?.source, 'field-cost');
      assert.equal(unified?.totalAmountCents, 20000);
      assert.equal(unified?.matchId, 'match-1');
      assert.equal(unified?.categoryLabel, 'Campo');
      // 10 cotas de R$ 20; dois jogadores pagaram, as outras oito ficam como extras.
      assert.equal(unified?.sharesCents['player-1'], 2000);
      assert.equal(unified?.extraSharesCount, 8);
      assert.equal(unified?.extraSharesCents, 16000);
      // Quem esta na lista de pagantes do modelo legado ja conta como acertado.
      assert.deepEqual(unified?.settledPlayerIds, ['player-1', 'player-2']);
    },
  },
  {
    name: 'partida sem custo de campo lancado nao vira despesa',
    run() {
      assert.equal(fieldCostToUnifiedExpense(createMatchWithFieldCost({ fieldCost: null })), null);
      assert.equal(
        fieldCostToUnifiedExpense(
          createMatchWithFieldCost({
            fieldCost: { totalAmount: 0, splitCount: 10, amountPerPlayer: 0, currency: 'BRL' },
          }),
        ),
        null,
      );
    },
  },
  {
    name: 'coleta unifica despesas novas e custos de campo, ordenando pela data',
    run() {
      const unified = collectTeamExpenses({
        teamId: 'team-1',
        expenses: [createExpense({ id: 'expense-nova', date: '2026-08-10' })],
        matches: [createMatchWithFieldCost()],
        categoryLabels: { 'cat-cerveja': 'Cerveja' },
      });

      assert.equal(unified.length, 2);
      assert.equal(unified[0]?.id, 'expense-nova');
      assert.equal(unified[1]?.source, 'field-cost');
    },
  },
  {
    name: 'coleta ignora dados de outro time e registros apagados',
    run() {
      const unified = collectTeamExpenses({
        teamId: 'team-1',
        expenses: [
          createExpense({ id: 'de-outro-time', teamId: 'team-2' }),
          createExpense({ id: 'apagada', deletedAt: '2026-08-11T00:00:00.000Z' }),
          createExpense({ id: 'valida' }),
        ],
        matches: [createMatchWithFieldCost({ deletedAt: '2026-08-11T00:00:00.000Z' })],
      });

      assert.deepEqual(
        unified.map((expense) => expense.id),
        ['valida'],
      );
    },
  },
  {
    name: 'coleta pode separar despesas avulsas das vinculadas a partida',
    run() {
      const base = {
        teamId: 'team-1',
        expenses: [
          createExpense({ id: 'avulsa', matchId: null }),
          createExpense({ id: 'vinculada', matchId: 'match-1' }),
        ],
        matches: [],
      };

      assert.deepEqual(
        collectTeamExpenses({ ...base, filters: { linkedToMatch: false } }).map((e) => e.id),
        ['avulsa'],
      );
      assert.deepEqual(
        collectTeamExpenses({ ...base, filters: { linkedToMatch: true } }).map((e) => e.id),
        ['vinculada'],
      );
    },
  },
  {
    name: 'coleta filtra por mes, ano e categoria',
    run() {
      const expenses = [
        createExpense({ id: 'julho', date: '2026-07-15', categoryId: 'cat-bola' }),
        createExpense({ id: 'agosto', date: '2026-08-10', categoryId: 'cat-cerveja' }),
      ];

      assert.deepEqual(
        collectTeamExpenses({ teamId: 'team-1', expenses, filters: { year: 2026, month: 7 } }).map(
          (e) => e.id,
        ),
        ['julho'],
      );
      assert.deepEqual(
        collectTeamExpenses({ teamId: 'team-1', expenses, filters: { categoryId: 'cat-cerveja' } }).map(
          (e) => e.id,
        ),
        ['agosto'],
      );
    },
  },
  {
    name: 'coleta permite desligar os custos de campo legados',
    run() {
      const unified = collectTeamExpenses({
        teamId: 'team-1',
        expenses: [createExpense()],
        matches: [createMatchWithFieldCost()],
        includeFieldCosts: false,
      });

      assert.equal(unified.length, 1);
      assert.equal(unified[0]?.source, 'expense');
    },
  },
  {
    name: 'saldo separa o que o jogador deve do que ele ja acertou',
    run() {
      const balances = buildPlayerBalances([
        toUnifiedExpense(
          createExpense({
            totalAmountCents: 10000,
            participantPlayerIds: ['player-1', 'player-2'],
            settledPlayerIds: ['player-2'],
          }),
        ),
      ]);

      const devedor = balances.find((balance) => balance.playerId === 'player-1');
      const quitado = balances.find((balance) => balance.playerId === 'player-2');

      assert.equal(devedor?.owedCents, 5000);
      assert.equal(devedor?.settledCents, 0);
      assert.equal(quitado?.owedCents, 0);
      assert.equal(quitado?.settledCents, 5000);
    },
  },
  {
    name: 'quem adianta o dinheiro fica com saldo positivo a receber',
    run() {
      const balances = buildPlayerBalances([
        toUnifiedExpense(
          createExpense({
            totalAmountCents: 10000,
            paidByPlayerId: 'player-1',
            participantPlayerIds: ['player-1', 'player-2'],
            settledPlayerIds: [],
          }),
        ),
      ]);

      const pagador = balances.find((balance) => balance.playerId === 'player-1');

      assert.equal(pagador?.paidForGroupCents, 10000);
      assert.equal(pagador?.owedCents, 5000);
      assert.equal(pagador?.netCents, 5000);
    },
  },
  {
    name: 'resumo soma total, pendente e quebra por categoria',
    run() {
      const summary = buildExpensesSummary(
        collectTeamExpenses({
          teamId: 'team-1',
          expenses: [
            createExpense({
              id: 'cerveja',
              categoryId: 'cat-cerveja',
              totalAmountCents: 10000,
              participantPlayerIds: ['player-1', 'player-2'],
              settledPlayerIds: ['player-1'],
            }),
            createExpense({
              id: 'bola',
              categoryId: 'cat-bola',
              totalAmountCents: 6000,
              participantPlayerIds: ['player-1', 'player-2'],
              settledPlayerIds: [],
            }),
          ],
          categoryLabels: { 'cat-cerveja': 'Cerveja', 'cat-bola': 'Bola' },
        }),
      );

      assert.equal(summary.expenseCount, 2);
      assert.equal(summary.totalCents, 16000);
      assert.equal(summary.settledCents, 5000);
      assert.equal(summary.pendingCents, 11000);
      assert.equal(summary.byCategory[0]?.categoryLabel, 'Cerveja');
      assert.equal(summary.byCategory[0]?.totalCents, 10000);
    },
  },
  {
    name: 'resumo combinado nao perde nem duplica centavos entre campo e despesas novas',
    run() {
      const unified = collectTeamExpenses({
        teamId: 'team-1',
        expenses: [createExpense({ totalAmountCents: 3333 })],
        matches: [createMatchWithFieldCost()],
      });

      const summary = buildExpensesSummary(unified);

      assert.equal(summary.totalCents, 3333 + 20000);
      assert.equal(
        summary.byCategory.reduce((sum, entry) => sum + entry.totalCents, 0),
        summary.totalCents,
      );
    },
  },
  {
    name: 'regras do Firestore cobrem despesas e categorias com escopo de time',
    run() {
      const rules = fs.readFileSync('firestore.rules', 'utf8');

      assert.match(rules, /match \/expenses\/\{expenseId\}/);
      assert.match(rules, /match \/expenseCategories\/\{categoryId\}/);

      // Acesso irrestrito so e aceitavel na vitrine publica de times.
      // Qualquer outra colecao com `if true` seria vazamento de dado privado.
      const openRuleBlocks = [...rules.matchAll(/match (\/[\w/{}]+) \{([\s\S]*?)\n    \}/g)]
        .filter(([, , body]) =>
          /allow\s+(read|write|get|list|create|update|delete)[^;]*:\s*if\s+true\s*;/.test(body),
        )
        .map(([, path]) => path);

      assert.deepEqual(openRuleBlocks, ['/publicTeams/{teamId}']);

      // Chaves balanceadas — um bloco aberto quebra o deploy inteiro.
      assert.equal(
        (rules.match(/\{/g) ?? []).length,
        (rules.match(/\}/g) ?? []).length,
      );
    },
  },
  {
    name: 'financeiro e restrito a quem administra: leitura de despesa nao usa a regra aberta de time',
    run() {
      const rules = fs.readFileSync('firestore.rules', 'utf8');
      const expensesBlock = rules.slice(
        rules.indexOf('match /expenses/{expenseId}'),
      );
      const block = expensesBlock.slice(0, expensesBlock.indexOf('\n    }'));

      // `canReadTeamScopedData` liberaria para qualquer membro do time.
      assert.doesNotMatch(block, /canReadTeamScopedData/);
      assert.match(block, /allow get, list: if canManageTeamData\(resource\.data\.teamId\)/);

      // Toda escrita precisa validar o payload.
      assert.equal((block.match(/isValidExpensePayload/g) ?? []).length, 2);
    },
  },
  {
    name: 'regra de despesa exige centavos inteiros e impede troca de time no update',
    run() {
      const rules = fs.readFileSync('firestore.rules', 'utf8');

      assert.match(rules, /function isValidCents\(value\) \{\s*return value is int && value >= 0;/);
      assert.match(rules, /isValidCents\(data\.totalAmountCents\)/);
      assert.match(rules, /data\.splitMode in \['equal', 'manual'\]/);

      const expensesBlock = rules.slice(rules.indexOf('match /expenses/{expenseId}'));
      const updateLine = expensesBlock.slice(
        expensesBlock.indexOf('allow update:'),
        expensesBlock.indexOf('allow delete:'),
      );

      assert.match(updateLine, /request\.resource\.data\.teamId == resource\.data\.teamId/);
    },
  },
];
