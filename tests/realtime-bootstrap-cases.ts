import assert from 'node:assert/strict';
import fs from 'node:fs';

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

const REPO = 'src/services/repository/firebase-repository.ts';

function subscribeBlock(source: string) {
  const start = source.indexOf('async subscribeSnapshot(');
  assert.equal(start > 0, true, 'subscribeSnapshot nao encontrado');
  const end = source.indexOf('\n  async login(', start);
  assert.equal(end > start, true, 'fim de subscribeSnapshot nao encontrado');
  return source.slice(start, end);
}

export const realtimeBootstrapTestCases: TestCase[] = [
  {
    name: 'o bootstrap do tempo real nao le as colecoes do time',
    run() {
      const repo = fs.readFileSync(REPO, 'utf8');
      const bloco = subscribeBlock(repo);

      // Os listeners entregam elenco, partidas, presenca, notas e votos por
      // inteiro. Ler tudo tambem no bootstrap dobrava o consumo de cada
      // abertura do app e era o que estourava a cota diaria.
      assert.match(bloco, /buildSnapshotForUserId\(currentUserId, \{\s*skipTeamCollections: true,?\s*\}\)/);
    },
  },
  {
    name: 'o atalho do bootstrap devolve contexto e financeiro, nada mais',
    run() {
      const repo = fs.readFileSync(REPO, 'utf8');
      const inicio = repo.indexOf('if (options?.skipTeamCollections) {');
      assert.equal(inicio > 0, true, 'atalho skipTeamCollections nao encontrado');

      // O atalho termina onde comeca o caminho pesado, que ainda le tudo.
      const fim = repo.indexOf('\n  try {', inicio);
      assert.equal(fim > inicio, true, 'fim do atalho nao encontrado');
      const atalho = repo.slice(inicio, fim);

      // Quem administra precisa do financeiro: essas duas colecoes nao tem
      // listener de tempo real, entao continuam sendo lidas aqui.
      assert.match(atalho, /loadFinance\(\)/);
      assert.match(atalho, /teamMembers: memberships/);

      // E nenhuma das colecoes pesadas pode voltar por esse caminho.
      for (const colecao of [
        'players',
        'matches',
        'attendance',
        'matchStats',
        'playerRatings',
        'mvpVotes',
        'lineups',
      ]) {
        assert.doesNotMatch(
          atalho,
          new RegExp(`\\n\\s+${colecao},`),
          `${colecao} nao deveria ser lida no atalho`,
        );
      }
    },
  },
  {
    name: 'nenhuma emissao sai antes de todos os listeners entregarem',
    run() {
      const repo = fs.readFileSync(REPO, 'utf8');
      const bloco = subscribeBlock(repo);

      // Sem essa trava o app emitiria um snapshot vazio logo apos ligar os
      // listeners e a tela piscaria "time sem dados" a cada abertura.
      assert.match(bloco, /const awaitingFirstDelivery = new Set<string>\(\);/);
      assert.match(bloco, /if \(disposed \|\| awaitingFirstDelivery\.size > 0\) \{\s*return;/);
    },
  },
  {
    name: 'todo listener registrado tem quem o desmarque',
    run() {
      const repo = fs.readFileSync(REPO, 'utf8');
      const bloco = subscribeBlock(repo);

      const registros = bloco.match(/awaitingFirstDelivery\.add\(/g) ?? [];
      const baixas = bloco.match(/markDelivered\(/g) ?? [];

      assert.equal(registros.length > 0, true, 'nenhum listener registrado');

      // Cada registro precisa de baixa no sucesso E no erro; se faltar, a
      // emissao trava para sempre e o app fica em branco.
      assert.equal(
        baixas.length >= registros.length * 2,
        true,
        `${registros.length} registros para apenas ${baixas.length} baixas`,
      );
    },
  },
  {
    name: 'listener que falha tambem libera a emissao',
    run() {
      const repo = fs.readFileSync(REPO, 'utf8');
      const bloco = subscribeBlock(repo);

      // `handleRealtimeError` sozinho apenas avisa o erro: sem dar baixa, um
      // permission-denied em uma colecao esconderia todas as outras.
      assert.match(
        bloco,
        /markDelivered\((?:key|'notifications:[a-zA-Z]+')\);\s*\n\s*handleRealtimeError\(error\);/,
      );
    },
  },
  {
    name: 'trocar de time devolve os listeners pendentes',
    run() {
      const repo = fs.readFileSync(REPO, 'utf8');
      const bloco = subscribeBlock(repo);
      const dispose = bloco.slice(bloco.indexOf('const disposeActiveTeamListeners'));

      // Senao a troca de time deixaria chaves orfas na fila e a emissao
      // nunca mais voltaria.
      assert.match(dispose.slice(0, 400), /awaitingFirstDelivery\.delete\(key\)/);
    },
  },
];
