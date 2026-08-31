import assert from 'node:assert/strict';
import fs from 'node:fs';

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

const FUNCAO = 'supabase/functions/enviar-push/index.ts';

/**
 * Cabeçalhos que o `supabase.functions.invoke` coloca no pedido sem ninguém
 * pedir. Se o preflight não liberar todos, o navegador responde 200 no OPTIONS
 * e **não manda o POST** — do lado do servidor não sobra rastro nenhum.
 */
const CABECALHOS_DO_CLIENTE = ['authorization', 'x-client-info', 'apikey', 'content-type'];

export const pushCorsTestCases: TestCase[] = [
  {
    name: 'preflight libera todos os cabecalhos que o supabase-js manda',
    run() {
      const fonte = fs.readFileSync(FUNCAO, 'utf8');
      const linha = fonte.match(/'Access-Control-Allow-Headers':\s*'([^']+)'/);

      assert.notEqual(linha, null, 'Access-Control-Allow-Headers nao encontrado');

      const liberados = linha![1].split(',').map((item) => item.trim().toLowerCase());

      for (const cabecalho of CABECALHOS_DO_CLIENTE) {
        assert.equal(
          liberados.includes(cabecalho),
          true,
          `falta liberar '${cabecalho}' no preflight — o POST nem sai do navegador`,
        );
      }
    },
  },
  {
    name: 'preflight e resposta usam a mesma lista de CORS',
    run() {
      const fonte = fs.readFileSync(FUNCAO, 'utf8');

      // Duas listas seriam dois lugares para divergir: o OPTIONS passaria e o
      // POST voltaria bloqueado, ou o contrario.
      assert.match(fonte, /new Response\('ok', \{ headers: CORS \}\)/);
      assert.match(fonte, /headers: \{ \.\.\.CORS,/);
    },
  },
  {
    name: 'a funcao confere que quem chamou e membro do time',
    run() {
      const fonte = fs.readFileSync(FUNCAO, 'utf8');

      // A service role passa por cima da RLS. Sem esta checagem, qualquer conta
      // autenticada mandaria push para qualquer time.
      assert.match(fonte, /team_members/);
      assert.match(fonte, /Bearer /);
    },
  },
  {
    name: 'checagem de membro nao quebra em time com varios jogadores',
    run() {
      const fonte = fs.readFileSync(FUNCAO, 'utf8');
      const inicio = fonte.indexOf('const { data: vinculo');
      assert.equal(inicio > 0, true, 'checagem de vinculo nao encontrada');
      const consulta = fonte.slice(inicio, inicio + 400);

      // A policy deixa membro ver o time inteiro: sem `limit(1)`, o
      // `maybeSingle()` estoura com "mais de uma linha" em qualquer time com
      // mais de um jogador — e o erro sairia disfarçado de falta de acesso.
      assert.match(consulta, /\.limit\(1\)/);
    },
  },
];
