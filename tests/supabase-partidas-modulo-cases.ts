import assert from 'node:assert/strict';
import fs from 'node:fs';

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

const MODULO = 'src/services/repository/supabase/partidas.ts';

function apenasCodigo(fonte: string) {
  return fonte
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((linha) => !linha.trim().startsWith('//'))
    .join('\n');
}

function trecho(fonte: string, funcao: string, tamanho = 1400) {
  const inicio = fonte.indexOf(`export async function ${funcao}`);
  assert.equal(inicio > 0, true, `funcao ${funcao} nao encontrada`);
  return fonte.slice(inicio, inicio + tamanho);
}

export const supabasePartidasModuloTestCases: TestCase[] = [
  {
    name: 'a permissao mora na RLS, nao repetida no cliente',
    run() {
      const modulo = apenasCodigo(fs.readFileSync(MODULO, 'utf8'));

      // Uma checagem a mais aqui criaria um segundo lugar para divergir da
      // policy — foi assim que nasceram os bugs do Firestore.
      assert.doesNotMatch(modulo, /ensureTeamAdmin/);
      assert.doesNotMatch(modulo, /canManageTeam/);
    },
  },
  {
    name: 'operacao de varias tabelas passa por RPC, nunca solta',
    run() {
      const modulo = apenasCodigo(fs.readFileSync(MODULO, 'utf8'));

      // Encerrar partida grava partida e estatistica; custo grava valor e
      // participantes. Soltas, podiam falhar pela metade.
      assert.match(modulo, /\.rpc\('criar_partida'/);
      assert.match(modulo, /\.rpc\('encerrar_partida'/);
      assert.match(modulo, /\.rpc\('salvar_custo_do_campo'/);
    },
  },
  {
    name: 'id composto mantem o formato do Firestore',
    run() {
      const modulo = apenasCodigo(fs.readFileSync(MODULO, 'utf8'));

      // `matchId__playerId` e o que permite reimportar sem duplicar e os dois
      // bancos conviverem enquanto a migracao acontece.
      assert.match(modulo, /function idComposto\(\.\.\.partes: string\[\]\)/);
      assert.match(modulo, /partes\.join\('__'\)/);
      assert.match(trecho(modulo, 'definirPresenca'), /idComposto\(input\.matchId, input\.playerId\)/);
      assert.match(
        trecho(modulo, 'salvarEstatistica'),
        /idComposto\(input\.matchId, input\.playerId\)/,
      );
    },
  },
  {
    name: 'quem pagou nao entra tambem como isento',
    run() {
      const modulo = apenasCodigo(fs.readFileSync(MODULO, 'utf8'));
      const custo = trecho(modulo, 'salvarCustoDoCampo', 2000);

      // Seriam dois papeis para a mesma pessoa, e a chave primaria recusaria a
      // linha — derrubando o salvamento inteiro.
      assert.match(custo, /!pagantesSet\.has\(playerId\)/);
      assert.match(custo, /role: 'payer'/);
      assert.match(custo, /role: 'exempt'/);
    },
  },
  {
    name: 'valor do campo entra em centavos inteiros',
    run() {
      const modulo = apenasCodigo(fs.readFileSync(MODULO, 'utf8'));
      const custo = trecho(modulo, 'salvarCustoDoCampo', 2000);

      // O dominio usa reais; float em dinheiro fecha conta errada.
      assert.match(custo, /centsFromAmount\(input\.totalAmount\)/);
      assert.match(custo, /centsFromAmount\(input\.amountPerPlayer\)/);
    },
  },
  {
    name: 'apagar partida e soft delete, o ranking nao perde o jogo',
    run() {
      const modulo = apenasCodigo(fs.readFileSync(MODULO, 'utf8'));
      const apagar = trecho(modulo, 'apagarPartida');

      assert.match(apagar, /deleted_at: agora\(\)/);
      assert.match(apagar, /deleted_by: actorUserId/);
      assert.doesNotMatch(apagar, /\.delete\(\)/);
    },
  },
  {
    name: 'desfazer MVP manual limpa o rastro da escolha',
    run() {
      const modulo = apenasCodigo(fs.readFileSync(MODULO, 'utf8'));
      const mvp = trecho(modulo, 'definirMvpManual');

      // Deixar quem escolheu e quando, sem MVP escolhido, confundiria a tela.
      assert.match(mvp, /playerId \? actorUserId : null/);
      assert.match(mvp, /playerId \? agora\(\) : null/);
    },
  },
  {
    name: 'presenca e escalacao usam a chave certa no upsert',
    run() {
      const modulo = apenasCodigo(fs.readFileSync(MODULO, 'utf8'));

      // Chave errada duplicaria em vez de atualizar.
      assert.match(trecho(modulo, 'definirPresenca'), /onConflict: 'match_id,player_id'/);
      assert.match(trecho(modulo, 'salvarEscalacao'), /onConflict: 'match_id'/);
      assert.match(trecho(modulo, 'salvarEstatistica'), /onConflict: 'match_id,player_id'/);
    },
  },
  {
    name: 'estatistica avulsa nao aceita numero negativo',
    run() {
      const modulo = apenasCodigo(fs.readFileSync(MODULO, 'utf8'));
      const stat = trecho(modulo, 'salvarEstatistica', 1800);

      // A coluna tem `check >= 0`: negativo recusaria a linha.
      const protecoes = stat.match(/Math\.max\(0,/g) ?? [];
      assert.equal(protecoes.length, 4, `esperava 4 protecoes, achei ${protecoes.length}`);
    },
  },
  {
    name: 'a leitura traz as quatro tabelas em paralelo',
    run() {
      const modulo = apenasCodigo(fs.readFileSync(MODULO, 'utf8'));
      const leitura = trecho(modulo, 'buscarPartidas', 2000);

      // Sequencial seriam seis idas ao servidor, uma esperando a outra.
      assert.match(leitura, /await Promise\.all\(\[/);
      for (const tabela of ['matches', 'attendance', 'lineups', 'match_stats']) {
        assert.match(leitura, new RegExp(`from\\('${tabela}'\\)`), `falta ler ${tabela}`);
      }
    },
  },
  {
    name: 'erro em qualquer uma das consultas e reportado',
    run() {
      const modulo = apenasCodigo(fs.readFileSync(MODULO, 'utf8'));
      const leitura = trecho(modulo, 'buscarPartidas', 2600);

      // `Promise.all` nao rejeita por causa de `{ data, error }`: cada resposta
      // precisa ser conferida, senao um erro vira lista vazia em silencio.
      assert.match(leitura, /for \(const resposta of \[/);
      assert.match(leitura, /if \(resposta\.error\)/);
    },
  },
];
