import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  MAX_RATING_SCORE,
  MIN_RATING_SCORE,
  calculateOverallFromCriteriaScores,
} from '@/lib/rating-criteria';
import type { PlayerRatingCriteriaSnapshotItem } from '@/types/domain';

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

function criterion(
  id: string,
  type: 'positive' | 'negative',
  weight = 1,
): PlayerRatingCriteriaSnapshotItem {
  return { criterionId: id, label: id, type, weight, order: 0 };
}

const SNAPSHOT: Record<string, PlayerRatingCriteriaSnapshotItem> = {
  qualidade: criterion('qualidade', 'positive'),
  reclamacao: criterion('reclamacao', 'negative'),
  fominha: criterion('fominha', 'negative'),
};

function overall(scores: Record<string, number>, snapshot = SNAPSHOT) {
  return calculateOverallFromCriteriaScores({
    criteriaScores: scores,
    criteriaSnapshot: snapshot,
  });
}

export const ratingAverageTestCases: TestCase[] = [
  {
    name: 'criterio negativo alto derruba a media, nao aumenta',
    run() {
      // "Fominha 10" é o pior desempenho possível naquele critério.
      const ruim = overall({ fominha: MAX_RATING_SCORE });
      const bom = overall({ fominha: MIN_RATING_SCORE });

      assert.equal(ruim < bom, true, 'fominha alto deveria valer menos que fominha baixo');
      assert.equal(ruim, 1);
      assert.equal(bom, 10);
    },
  },
  {
    name: 'criterio positivo alto aumenta a media',
    run() {
      assert.equal(overall({ qualidade: MAX_RATING_SCORE }), 10);
      assert.equal(overall({ qualidade: MIN_RATING_SCORE }), 1);
    },
  },
  {
    name: 'nota maxima em tudo nao e nota 10: os negativos puxam para baixo',
    run() {
      // Marcar 10 em Reclamação e Fominha significa "reclamou muito, foi
      // muito fominha" — o app precisa refletir isso.
      const tudoDez = overall({ qualidade: 10, reclamacao: 10, fominha: 10 });
      const ideal = overall({ qualidade: 10, reclamacao: 1, fominha: 1 });

      assert.equal(tudoDez, 4);
      assert.equal(ideal, 10);
    },
  },
  {
    name: 'caso da tela: qualidade 8, reclamacao 2, fominha 4',
    run() {
      // Inversão: reclamação 2 vale 9, fominha 4 vale 7. Média com qualidade 8.
      assert.equal(overall({ qualidade: 8, reclamacao: 2, fominha: 4 }), 8);
    },
  },
  {
    name: 'inversao e simetrica em torno do meio da escala',
    run() {
      // Escala 1..10 inverte por 11 - x. Por isso 5 vira 6 e 6 vira 5: o
      // centro exato é 5,5, e nenhum inteiro fica neutro.
      assert.equal(overall({ fominha: 5 }), 6);
      assert.equal(overall({ fominha: 6 }), 5);
      assert.equal(overall({ fominha: 3 }), 8);
      assert.equal(overall({ fominha: 8 }), 3);
    },
  },
  {
    name: 'peso maior pesa mais na media',
    run() {
      const comPeso = {
        qualidade: criterion('qualidade', 'positive', 3),
        fominha: criterion('fominha', 'negative', 1),
      };

      // qualidade 10 (peso 3) + fominha 10 -> vira 1 (peso 1)
      // (10*3 + 1*1) / 4 = 7.75 -> 7.8
      assert.equal(overall({ qualidade: 10, fominha: 10 }, comPeso), 7.8);
    },
  },
  {
    name: 'nota fora da escala e limitada antes de entrar na conta',
    run() {
      assert.equal(overall({ qualidade: 99 }), 10);
      assert.equal(overall({ qualidade: -5 }), 1);
    },
  },
  {
    name: 'avaliacao sem nenhuma nota valida devolve zero em vez de quebrar',
    run() {
      assert.equal(overall({}), 0);
      assert.equal(overall({ qualidade: Number.NaN }), 0);
    },
  },
  {
    name: 'recarregar snapshot inteiro apos cada escrita foi desativado com tempo real',
    run() {
      const store = fs.readFileSync('src/store/app-store.ts', 'utf8');

      // Cada acao relia todos os documentos do time (milhares), o que
      // estourava a cota diaria e derrubava gravacoes com resource-exhausted.
      assert.match(store, /if \(get\(\)\.hasLiveSync && !options\?\.showRefreshing\) \{\s*return;/);

      // O "puxar para atualizar" continua forcando releitura de proposito.
      assert.match(store, /refreshCurrentSession\(set, get, \{ showRefreshing: true \}\)/);
    },
  },
  {
    name: 'cache persistente do Firestore esta ligado no navegador',
    run() {
      const client = fs.readFileSync('src/config/firebase/client.ts', 'utf8');

      // Sem cache em disco cada F5 relê o time inteiro do servidor, que foi
      // o que estourou a cota diaria de leituras.
      assert.match(client, /persistentLocalCache\(/);
      assert.match(client, /persistentMultipleTabManager\(/);

      // React Native nao tem IndexedDB e usa a persistencia propria do SDK.
      assert.match(client, /if \(Platform\.OS !== 'web'\)/);

      // E precisa haver saida quando o navegador nao permite IndexedDB.
      assert.match(client, /catch \{[\s\S]{0,200}return getFirestore\(firebaseApp\)/);
    },
  },
  {
    name: 'mensagem de cota explica o que fazer em vez de mandar tentar de novo',
    run() {
      const repo = fs.readFileSync('src/services/repository/firebase-repository.ts', 'utf8');
      const block = repo.slice(repo.indexOf("'resource-exhausted':"));

      assert.match(block.slice(0, 300), /limite de uso do dia/);
      // "Aguarde e tente novamente" nao ajuda: a cota so reseta no dia seguinte.
      assert.doesNotMatch(block.slice(0, 300), /Aguarde e tente novamente/);
    },
  },
];
