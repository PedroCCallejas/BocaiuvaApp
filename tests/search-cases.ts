import assert from 'node:assert/strict';
import fs from 'node:fs';

import { matchesSearchQuery, normalizeSearchText } from '@/lib/search';

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

export const searchTestCases: TestCase[] = [
  {
    name: 'busca ignora acento e caixa',
    run() {
      assert.equal(normalizeSearchText('José'), 'jose');
      assert.equal(normalizeSearchText('  SÃO Paulo FC '), 'sao paulo fc');
      assert.equal(matchesSearchQuery('José Silva', 'jose'), true);
      assert.equal(matchesSearchQuery('São Paulo FC', 'sao paulo'), true);
    },
  },
  {
    name: 'busca vazia devolve tudo',
    run() {
      assert.equal(matchesSearchQuery('qualquer coisa', ''), true);
      assert.equal(matchesSearchQuery('qualquer coisa', '   '), true);
    },
  },
  {
    name: 'termos separados buscam em conjunto, em qualquer ordem',
    run() {
      const jogo = '20/03/2025 · Supremo FC';

      assert.equal(matchesSearchQuery(jogo, 'supremo'), true);
      assert.equal(matchesSearchQuery(jogo, 'supremo 03'), true);
      assert.equal(matchesSearchQuery(jogo, '2025 supremo'), true);
      assert.equal(matchesSearchQuery(jogo, 'supremo 2024'), false);
    },
  },
  {
    name: 'seletor de jogo ordena do mais recente e nao corta em silencio',
    run() {
      const modal = fs.readFileSync('src/components/finance/ExpenseFormModal.tsx', 'utf8');

      // Sem ordenacao, o corte mostrava os jogos mais antigos do historico.
      assert.match(modal, /const sortedMatches = useMemo\(/);
      assert.match(modal, /a\.date < b\.date \? 1 : a\.date > b\.date \? -1 : 0/);

      // O resto da lista precisa continuar alcancavel.
      assert.match(modal, /hiddenMatchesCount/);
      assert.match(modal, /Ver mais \{hiddenMatchesCount\} jogo\(s\)/);

      // E a busca precisa existir.
      assert.match(modal, /matchesSearchQuery\(/);
      assert.doesNotMatch(modal, /matches\.slice\(0, 12\)/);
    },
  },
  {
    name: 'busca de jogadores usa o helper compartilhado, sem copia local',
    run() {
      const players = fs.readFileSync('src/app/(app)/(tabs)/players.tsx', 'utf8');

      assert.match(players, /from '@\/lib\/search'/);
      assert.doesNotMatch(players, /function normalizeSearchText/);
    },
  },
];
