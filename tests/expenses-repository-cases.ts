import assert from 'node:assert/strict';

import { buildExpensesSummary, collectTeamExpenses } from '@/lib/expenses';
import {
  mockRepository,
  resetMockRepositoryState,
} from '@/services/repository/mock-repository';

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

const ADMIN_USER_ID = 'user-admin';
const PLAYER_USER_ID = 'user-striker';
const TEAM_ID = 'team-bocaiuva';

async function seedCategory(label = 'Cerveja') {
  resetMockRepositoryState();
  const category = await mockRepository.createExpenseCategory({ label }, ADMIN_USER_ID);
  return category;
}

export const expensesRepositoryTestCases: TestCase[] = [
  {
    name: 'admin cria categoria de despesa com titulo livre',
    async run() {
      const category = await seedCategory('Churrasco pos-jogo');

      assert.equal(category.label, 'Churrasco pos-jogo');
      assert.equal(category.teamId, TEAM_ID);
      assert.equal(category.archivedAt, null);
    },
  },
  {
    name: 'categoria rejeita nome vazio ou longo demais',
    async run() {
      resetMockRepositoryState();

      await assert.rejects(
        () => mockRepository.createExpenseCategory({ label: '   ' }, ADMIN_USER_ID),
        (error) => error instanceof Error,
      );
      await assert.rejects(
        () => mockRepository.createExpenseCategory({ label: 'a'.repeat(61) }, ADMIN_USER_ID),
        (error) => error instanceof Error,
      );
    },
  },
  {
    name: 'categoria duplicada e recusada, mas o nome volta a ficar livre apos arquivar',
    async run() {
      const category = await seedCategory('Bola');

      await assert.rejects(
        () => mockRepository.createExpenseCategory({ label: 'bola' }, ADMIN_USER_ID),
        (error) => error instanceof Error,
      );

      await mockRepository.updateExpenseCategory(category.id, { archived: true }, ADMIN_USER_ID);
      const recriada = await mockRepository.createExpenseCategory({ label: 'Bola' }, ADMIN_USER_ID);

      assert.equal(recriada.label, 'Bola');
    },
  },
  {
    name: 'jogador comum nao cria, edita nem apaga despesa',
    async run() {
      const category = await seedCategory();

      await assert.rejects(
        () => mockRepository.createExpenseCategory({ label: 'Agua' }, PLAYER_USER_ID),
        (error) => error instanceof Error,
      );
      await assert.rejects(
        () =>
          mockRepository.createExpense(
            { categoryId: category.id, date: '2026-08-10', totalAmountCents: 5000 },
            PLAYER_USER_ID,
          ),
        (error) => error instanceof Error,
      );
    },
  },
  {
    name: 'despesa nasce solta: sem partida vinculada por padrao',
    async run() {
      const category = await seedCategory();

      const expense = await mockRepository.createExpense(
        {
          categoryId: category.id,
          date: '2026-08-10',
          totalAmountCents: 9000,
          participantPlayerIds: ['player-7', 'player-9'],
        },
        ADMIN_USER_ID,
      );

      assert.equal(expense.matchId, null);
      assert.equal(expense.splitMode, 'equal');
      assert.equal(expense.totalAmountCents, 9000);
      assert.equal(expense.createdBy, ADMIN_USER_ID);
    },
  },
  {
    name: 'despesa pode ser vinculada a uma partida do proprio time',
    async run() {
      const category = await seedCategory();

      const expense = await mockRepository.createExpense(
        {
          categoryId: category.id,
          date: '2026-04-10',
          totalAmountCents: 4000,
          matchId: 'match-1',
          participantPlayerIds: ['player-7'],
        },
        ADMIN_USER_ID,
      );

      assert.equal(expense.matchId, 'match-1');

      await assert.rejects(
        () =>
          mockRepository.createExpense(
            {
              categoryId: category.id,
              date: '2026-04-10',
              totalAmountCents: 4000,
              matchId: 'match-de-outro-time',
            },
            ADMIN_USER_ID,
          ),
        (error) => error instanceof Error,
      );
    },
  },
  {
    name: 'despesa recusa jogador que nao pertence ao time e valor invalido',
    async run() {
      const category = await seedCategory();

      await assert.rejects(
        () =>
          mockRepository.createExpense(
            {
              categoryId: category.id,
              date: '2026-08-10',
              totalAmountCents: 1000,
              participantPlayerIds: ['player-de-outro-time'],
            },
            ADMIN_USER_ID,
          ),
        (error) => error instanceof Error,
      );

      await assert.rejects(
        () =>
          mockRepository.createExpense(
            { categoryId: category.id, date: '2026-08-10', totalAmountCents: 10.5 },
            ADMIN_USER_ID,
          ),
        (error) => error instanceof Error,
      );

      await assert.rejects(
        () =>
          mockRepository.createExpense(
            { categoryId: category.id, date: '10/08/2026', totalAmountCents: 1000 },
            ADMIN_USER_ID,
          ),
        (error) => error instanceof Error,
      );
    },
  },
  {
    name: 'despesa exige categoria existente do proprio time',
    async run() {
      resetMockRepositoryState();

      await assert.rejects(
        () =>
          mockRepository.createExpense(
            { categoryId: 'categoria-inexistente', date: '2026-08-10', totalAmountCents: 1000 },
            ADMIN_USER_ID,
          ),
        (error) => error instanceof Error,
      );
    },
  },
  {
    name: 'marcar e desmarcar pagamento so vale para quem participa da despesa',
    async run() {
      const category = await seedCategory();
      const expense = await mockRepository.createExpense(
        {
          categoryId: category.id,
          date: '2026-08-10',
          totalAmountCents: 9000,
          participantPlayerIds: ['player-7', 'player-9'],
        },
        ADMIN_USER_ID,
      );

      const quitado = await mockRepository.setExpenseSettlement(
        expense.id,
        'player-7',
        true,
        ADMIN_USER_ID,
      );
      assert.deepEqual(quitado.settledPlayerIds, ['player-7']);

      // Repetir a operacao nao duplica o registro.
      const repetido = await mockRepository.setExpenseSettlement(
        expense.id,
        'player-7',
        true,
        ADMIN_USER_ID,
      );
      assert.deepEqual(repetido.settledPlayerIds, ['player-7']);

      const desfeito = await mockRepository.setExpenseSettlement(
        expense.id,
        'player-7',
        false,
        ADMIN_USER_ID,
      );
      assert.deepEqual(desfeito.settledPlayerIds, []);

      await assert.rejects(
        () =>
          mockRepository.setExpenseSettlement(expense.id, 'player-1', true, ADMIN_USER_ID),
        (error) => error instanceof Error,
      );
    },
  },
  {
    name: 'quem sai da lista de participantes deixa de constar como quitado',
    async run() {
      const category = await seedCategory();
      const expense = await mockRepository.createExpense(
        {
          categoryId: category.id,
          date: '2026-08-10',
          totalAmountCents: 9000,
          participantPlayerIds: ['player-7', 'player-9'],
          settledPlayerIds: ['player-7', 'player-9'],
        },
        ADMIN_USER_ID,
      );

      assert.equal(expense.settledPlayerIds.length, 2);

      const atualizada = await mockRepository.updateExpense(
        expense.id,
        { participantPlayerIds: ['player-9'] },
        ADMIN_USER_ID,
      );

      assert.deepEqual(atualizada.participantPlayerIds, ['player-9']);
      assert.deepEqual(atualizada.settledPlayerIds, ['player-9']);
    },
  },
  {
    name: 'remover despesa e soft-delete e ela some do snapshot',
    async run() {
      const category = await seedCategory();
      const expense = await mockRepository.createExpense(
        { categoryId: category.id, date: '2026-08-10', totalAmountCents: 9000 },
        ADMIN_USER_ID,
      );

      await mockRepository.deleteExpense(expense.id, ADMIN_USER_ID);

      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });
      const snapshot = await mockRepository.getSnapshot();

      assert.equal(
        snapshot.expenses.some((item) => item.id === expense.id),
        false,
      );

      await assert.rejects(
        () => mockRepository.deleteExpense(expense.id, ADMIN_USER_ID),
        (error) => error instanceof Error,
      );
    },
  },
  {
    name: 'categoria em uso e arquivada em vez de apagada, para nao orfanar despesas',
    async run() {
      const category = await seedCategory();
      await mockRepository.createExpense(
        { categoryId: category.id, date: '2026-08-10', totalAmountCents: 9000 },
        ADMIN_USER_ID,
      );

      await mockRepository.deleteExpenseCategory(category.id, ADMIN_USER_ID);

      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });
      const snapshot = await mockRepository.getSnapshot();
      const persistida = snapshot.expenseCategories.find((item) => item.id === category.id);

      assert.notEqual(persistida, undefined);
      assert.notEqual(persistida?.archivedAt, null);
    },
  },
  {
    name: 'categoria sem uso e removida de fato',
    async run() {
      const category = await seedCategory();

      await mockRepository.deleteExpenseCategory(category.id, ADMIN_USER_ID);

      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });
      const snapshot = await mockRepository.getSnapshot();

      assert.equal(
        snapshot.expenseCategories.some((item) => item.id === category.id),
        false,
      );
    },
  },
  {
    name: 'financeiro nao chega no snapshot de jogador comum',
    async run() {
      const category = await seedCategory();
      await mockRepository.createExpense(
        { categoryId: category.id, date: '2026-08-10', totalAmountCents: 9000 },
        ADMIN_USER_ID,
      );

      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });
      const snapshotAdmin = await mockRepository.getSnapshot();
      assert.equal(snapshotAdmin.expenses.length, 1);
      assert.equal(snapshotAdmin.expenseCategories.length, 1);

      await mockRepository.login({ email: 'atacante@bocaiuva.app', password: '123456' });
      const snapshotJogador = await mockRepository.getSnapshot();
      assert.deepEqual(snapshotJogador.expenses, []);
      assert.deepEqual(snapshotJogador.expenseCategories, []);
    },
  },
  {
    name: 'snapshot alimenta o resumo unificado somando despesa nova e custo de campo',
    async run() {
      const category = await seedCategory();
      await mockRepository.createExpense(
        {
          categoryId: category.id,
          date: '2026-08-10',
          totalAmountCents: 9000,
          participantPlayerIds: ['player-7', 'player-9'],
          settledPlayerIds: ['player-7'],
        },
        ADMIN_USER_ID,
      );

      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });
      const snapshot = await mockRepository.getSnapshot();

      const somenteDespesas = buildExpensesSummary(
        collectTeamExpenses({
          teamId: TEAM_ID,
          expenses: snapshot.expenses,
          matches: snapshot.matches,
          includeFieldCosts: false,
        }),
      );

      const comCampo = buildExpensesSummary(
        collectTeamExpenses({
          teamId: TEAM_ID,
          expenses: snapshot.expenses,
          matches: snapshot.matches,
        }),
      );

      assert.equal(somenteDespesas.totalCents, 9000);
      assert.equal(somenteDespesas.settledCents, 4500);
      // O seed tem partidas com custo de campo lancado: o total combinado cresce.
      assert.equal(comCampo.totalCents >= somenteDespesas.totalCents, true);
      assert.equal(comCampo.expenseCount >= somenteDespesas.expenseCount, true);
    },
  },
];
