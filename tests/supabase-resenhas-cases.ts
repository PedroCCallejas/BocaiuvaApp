import assert from 'node:assert/strict';
import fs from 'node:fs';

import { paraResenha } from '@/lib/migracao/mapear-dominio';

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

const MODULO = 'src/services/repository/supabase/resenhas.ts';

function apenasCodigo(fonte: string) {
  return fonte
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((linha) => !linha.trim().startsWith('//'))
    .join('\n');
}

const LINHA = {
  id: 'entry-1',
  team_id: 'team-1',
  match_id: 'match-1',
  author_user_id: 'user-1',
  author_name: 'Callejas',
  title: 'Que jogo',
  content: 'Virada no fim.',
  mentioned_player_ids: ['p1', 'p2'],
  visibility: 'team',
  pinned: true,
  mood: 'highlight',
  emoji: '⭐',
  created_at: '2026-08-20T22:00:00+00:00',
  updated_at: '2026-08-20T22:30:00+00:00',
};

export const supabaseResenhasTestCases: TestCase[] = [
  {
    name: 'linha do Postgres vira resenha do dominio',
    run() {
      const resenha = paraResenha(LINHA);

      assert.equal(resenha.id, 'entry-1');
      assert.equal(resenha.authorName, 'Callejas');
      assert.equal(resenha.pinned, true);
      assert.equal(resenha.mood, 'highlight');
      assert.deepEqual(resenha.mentionedPlayerIds, ['p1', 'p2']);
      // O banco devolve com fuso; o app ordena essas strings.
      assert.equal(resenha.createdAt, '2026-08-20T22:00:00.000Z');
    },
  },
  {
    name: 'humor invalido vira nulo em vez de sujar a tela',
    run() {
      // Valor fora da lista renderizaria um icone inexistente.
      assert.equal(paraResenha({ ...LINHA, mood: 'inventado' }).mood, null);
      assert.equal(paraResenha({ ...LINHA, mood: null }).mood, null);
      assert.equal(paraResenha({ ...LINHA, mood: 'praise' }).mood, 'praise');
    },
  },
  {
    name: 'lista de mencionados aguenta vir torta do banco',
    run() {
      assert.deepEqual(paraResenha({ ...LINHA, mentioned_player_ids: null }).mentionedPlayerIds, []);
      assert.deepEqual(
        paraResenha({ ...LINHA, mentioned_player_ids: ['p1', '', 'p2'] }).mentionedPlayerIds,
        ['p1', 'p2'],
      );
    },
  },
  {
    name: 'editar resenha nao muda quem escreveu',
    run() {
      const modulo = apenasCodigo(fs.readFileSync(MODULO, 'utf8'));
      const update = modulo.slice(modulo.indexOf('export async function atualizarResenha'));
      const ateOEq = update.slice(0, update.indexOf(".eq('id', entryId)"));

      // Deixar o autor no update permitiria assumir a autoria de outra pessoa.
      assert.doesNotMatch(ateOEq, /author_user_id:/);
      assert.doesNotMatch(ateOEq, /author_name:/);
    },
  },
  {
    name: 'resenha e apagada de vez, sem soft delete',
    run() {
      const modulo = apenasCodigo(fs.readFileSync(MODULO, 'utf8'));
      const apagar = modulo.slice(modulo.indexOf('export async function apagarResenha'));

      // Diferente de despesa e partida: e texto do time, sem consequencia
      // contabil ou estatistica. Guardar escondido seria manter no ar algo que
      // a pessoa pediu para tirar.
      assert.match(apagar.slice(0, 400), /\.delete\(\)/);
      assert.doesNotMatch(apagar.slice(0, 400), /deleted_at/);
    },
  },
  {
    name: 'mencao so aceita jogador que existe no time',
    run() {
      const modulo = apenasCodigo(fs.readFileSync(MODULO, 'utf8'));
      const sanitizar = modulo.slice(modulo.indexOf('async function sanitizarMencionados'));

      // Id de jogador apagado viraria mencao quebrada na tela.
      assert.match(sanitizar.slice(0, 900), /from\('players'\)/);
      assert.match(sanitizar.slice(0, 900), /\.eq\('team_id', teamId\)/);
      // A ordem que o autor escolheu tem de sobreviver ao filtro.
      assert.match(sanitizar, /pedidos\.filter\(\(id\) => existentes\.has\(id\)\)/);
    },
  },
  {
    name: 'a validacao de titulo e conteudo e a mesma do Firestore',
    run() {
      const modulo = apenasCodigo(fs.readFileSync(MODULO, 'utf8'));

      // Reimplementar a regra criaria duas versoes que divergem com o tempo.
      assert.match(modulo, /from '@\/lib\/match-diary'/);
      assert.match(modulo, /validateDiaryFields\(/);
      assert.match(modulo, /resolveDiaryEmoji\(/);
    },
  },
  {
    name: 'autor vem do banco, nunca do cliente',
    run() {
      const modulo = apenasCodigo(fs.readFileSync(MODULO, 'utf8'));
      const autor = modulo.slice(modulo.indexOf('async function autorAtual'));

      // Aceitar o id vindo do app seria deixar qualquer um assinar como outro.
      assert.match(autor.slice(0, 600), /from\('users'\)/);
      assert.match(autor.slice(0, 600), /select\('id, display_name'\)/);
    },
  },
];
