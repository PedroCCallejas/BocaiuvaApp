import assert from 'node:assert/strict';

import {
  MODULOS_MIGRAVEIS,
  lerModulosHabilitados,
} from '@/services/repository/modulos';
import {
  dataOuNulo,
  instanteOuNulo,
  paraCategoriaDeDespesa,
  paraCotasDaDespesa,
  paraDespesa,
} from '@/lib/migracao/mapear-dominio';
import { splitEqualCents } from '@/lib/expenses';
import type { Expense } from '@/types/domain';

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

const LINHA_DE_DESPESA = {
  id: 'expense-1',
  team_id: 'team-1',
  category_id: 'cerveja',
  match_id: null,
  description: 'Pós-jogo',
  date: '2026-08-13',
  total_amount_cents: 6000,
  paid_by_player_id: 'p1',
  split_mode: 'equal',
  extra_shares_count: 0,
  created_by: 'user-1',
  deleted_at: null,
  created_at: '2026-08-13T20:00:00+00:00',
  updated_at: '2026-08-13T20:00:00+00:00',
};

const COTAS = [
  { expense_id: 'expense-1', player_id: 'p2', amount_cents: 3000, settled_at: null },
  {
    expense_id: 'expense-1',
    player_id: 'p1',
    amount_cents: 3000,
    settled_at: '2026-08-14T10:00:00+00:00',
  },
  // Cota de outra despesa: não pode vazar para esta.
  { expense_id: 'expense-2', player_id: 'p9', amount_cents: 999, settled_at: null },
];

export const supabaseModulosTestCases: TestCase[] = [
  {
    name: 'sem a variavel de ambiente nada migra',
    run() {
      // Producao sem a variavel continua 100% no Firestore. O rollback e nao
      // ter mexido.
      assert.deepEqual(lerModulosHabilitados(undefined), []);
      assert.deepEqual(lerModulosHabilitados(''), []);
      assert.deepEqual(lerModulosHabilitados(null), []);
    },
  },
  {
    name: 'nome desconhecido e ignorado em vez de derrubar o app',
    run() {
      const ignorados: string[] = [];
      const habilitados = lerModulosHabilitados(
        'financeiro, financeirO ,inexistente, elenco',
        (nome) => ignorados.push(nome),
      );

      // Erro de digitacao na Vercel nao pode virar tela branca.
      assert.deepEqual(habilitados, ['financeiro', 'elenco']);
      assert.deepEqual(ignorados, ['inexistente']);
    },
  },
  {
    name: 'a ordem sugerida comeca pelo modulo de menor risco',
    run() {
      // Financeiro e o mais novo, o mais isolado e o de menos dado.
      assert.equal(MODULOS_MIGRAVEIS[0], 'financeiro');
      assert.equal(new Set(MODULOS_MIGRAVEIS).size, MODULOS_MIGRAVEIS.length);
    },
  },
  {
    name: 'timestamptz do Postgres vira o ISO que o dominio compara',
    run() {
      // O banco devolve com fuso; o app ordena essas strings. Duas
      // representacoes do mesmo instante convivendo dariam ordem errada.
      assert.equal(instanteOuNulo('2026-08-13T20:00:00+00:00'), '2026-08-13T20:00:00.000Z');
      assert.equal(instanteOuNulo('2026-08-13T17:00:00-03:00'), '2026-08-13T20:00:00.000Z');
      assert.equal(instanteOuNulo(null), null);
      assert.equal(instanteOuNulo('nada disso'), null);
    },
  },
  {
    name: 'data pura nao vira timestamp',
    run() {
      assert.equal(dataOuNulo('2026-08-13'), '2026-08-13');
      assert.equal(dataOuNulo('2026-08-13T00:00:00+00:00'), '2026-08-13');
      assert.equal(dataOuNulo('13/08/2026'), null);
    },
  },
  {
    name: 'a despesa e remontada a partir das cotas',
    run() {
      const despesa = paraDespesa(LINHA_DE_DESPESA, COTAS);

      // Ordem estavel por playerId, nao a ordem que o Postgres devolveu.
      assert.deepEqual(despesa.participantPlayerIds, ['p1', 'p2']);
      assert.deepEqual(despesa.settledPlayerIds, ['p1']);
      assert.equal(despesa.totalAmountCents, 6000);
      assert.equal(despesa.categoryId, 'cerveja');
    },
  },
  {
    name: 'cota de outra despesa nao vaza',
    run() {
      const despesa = paraDespesa(LINHA_DE_DESPESA, COTAS);

      assert.equal(despesa.participantPlayerIds.includes('p9'), false);
    },
  },
  {
    name: 'rateio igual nao devolve mapa de valores manuais',
    run() {
      // Devolver o mapa faria a tela achar que houve rateio a mao.
      assert.equal(paraDespesa(LINHA_DE_DESPESA, COTAS).manualSharesCents, undefined);

      const manual = paraDespesa({ ...LINHA_DE_DESPESA, split_mode: 'manual' }, COTAS);
      assert.deepEqual(manual.manualSharesCents, { p1: 3000, p2: 3000 });
    },
  },
  {
    name: 'ida e volta preserva a despesa',
    run() {
      const original = paraDespesa({ ...LINHA_DE_DESPESA, split_mode: 'manual' }, COTAS);
      const cotas = paraCotasDaDespesa(original, splitEqualCents);
      const devolta = paraDespesa({ ...LINHA_DE_DESPESA, split_mode: 'manual' }, cotas);

      assert.deepEqual(devolta.participantPlayerIds, original.participantPlayerIds);
      assert.deepEqual(devolta.settledPlayerIds, original.settledPlayerIds);
      assert.deepEqual(devolta.manualSharesCents, original.manualSharesCents);
    },
  },
  {
    name: 'gravar rateio igual fecha a soma com o total',
    run() {
      const despesa = {
        id: 'e1',
        totalAmountCents: 1000,
        splitMode: 'equal',
        participantPlayerIds: ['p1', 'p2', 'p3'],
        extraSharesCount: 0,
        settledPlayerIds: [],
      } as unknown as Expense;

      const cotas = paraCotasDaDespesa(despesa, splitEqualCents);
      const soma = cotas.reduce((total, cota) => total + cota.amount_cents, 0);

      assert.equal(soma, 1000);
      assert.deepEqual(cotas.map((cota) => cota.amount_cents), [334, 333, 333]);
    },
  },
  {
    name: 'cota extra divide mas nao vira linha',
    run() {
      const despesa = {
        id: 'e1',
        totalAmountCents: 900,
        splitMode: 'equal',
        participantPlayerIds: ['p1', 'p2'],
        extraSharesCount: 1,
        settledPlayerIds: [],
      } as unknown as Expense;

      const cotas = paraCotasDaDespesa(despesa, splitEqualCents);

      // Convidado sem cadastro racha a conta, mas nao ha a quem cobrar.
      assert.equal(cotas.length, 2);
      assert.deepEqual(cotas.map((cota) => cota.amount_cents), [300, 300]);
    },
  },
  {
    name: 'categoria arquivada preserva a data',
    run() {
      const categoria = paraCategoriaDeDespesa({
        id: 'c1',
        team_id: 'team-1',
        label: 'Bola',
        archived_at: '2026-08-01T12:00:00+00:00',
        created_at: '2026-01-01T00:00:00+00:00',
        updated_at: '2026-08-01T12:00:00+00:00',
      });

      assert.equal(categoria.label, 'Bola');
      assert.equal(categoria.archivedAt, '2026-08-01T12:00:00.000Z');
    },
  },
];
