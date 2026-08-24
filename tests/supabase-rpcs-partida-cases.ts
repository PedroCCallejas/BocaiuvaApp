import assert from 'node:assert/strict';
import fs from 'node:fs';

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

const RPC = 'supabase/migrations/20260824180000_rpcs_de_partida.sql';

/**
 * Só o código, sem comentário.
 *
 * O arquivo explica no comentário o que NÃO pode existir — procurar no texto
 * cru faria a própria explicação reprovar a implementação correta.
 */
function apenasCodigo(fonte: string) {
  return fonte
    .split('\n')
    .filter((linha) => !linha.trim().startsWith('--'))
    .join('\n');
}

function bloco(fonte: string, funcao: string) {
  const inicio = fonte.indexOf(`create or replace function public.${funcao}`);
  assert.equal(inicio > 0, true, `funcao ${funcao} nao encontrada`);
  const fim = fonte.indexOf('$$;', inicio);
  return fonte.slice(inicio, fim);
}

export const supabaseRpcsPartidaTestCases: TestCase[] = [
  {
    name: 'nenhuma RPC de partida ganha privilegio de quem a criou',
    run() {
      const sql = apenasCodigo(fs.readFileSync(RPC, 'utf8'));

      // `security definer` aqui deixaria qualquer membro encerrar partida,
      // contornando a RLS que restringe ao admin.
      const invokers = sql.match(/security invoker/g) ?? [];
      assert.equal(invokers.length, 3, `esperava 3 invoker, achei ${invokers.length}`);
      assert.doesNotMatch(sql, /security definer/);
    },
  },
  {
    name: 'criar partida ja monta a lista de presenca',
    run() {
      const sql = apenasCodigo(fs.readFileSync(RPC, 'utf8'));
      const criar = bloco(sql, 'criar_partida');

      // Sem as linhas de presenca o time nao teria em que clicar, e a tela
      // precisaria inventar as linhas na hora de exibir.
      assert.match(criar, /insert into public\.matches/);
      assert.match(criar, /insert into public\.attendance/);
      assert.match(criar, /'pending'/);
      // Recriar a partida nao pode duplicar presenca.
      assert.match(criar, /on conflict \(match_id, player_id\) do nothing/);
    },
  },
  {
    name: 'encerrar partida substitui as estatisticas na mesma transacao',
    run() {
      const sql = apenasCodigo(fs.readFileSync(RPC, 'utf8'));
      const encerrar = bloco(sql, 'encerrar_partida');

      // Encerrar sem estatistica deixaria o jogo sem gols; estatistica de quem
      // nao jogou entraria no ranking.
      assert.match(encerrar, /update public\.matches/);
      assert.match(encerrar, /delete from public\.match_stats/);
      assert.match(encerrar, /insert into public\.match_stats/);
      assert.match(encerrar, /status = 'finished'/);
    },
  },
  {
    name: 'encerrar partida recusa id inexistente em vez de gravar solto',
    run() {
      const sql = apenasCodigo(fs.readFileSync(RPC, 'utf8'));
      const encerrar = bloco(sql, 'encerrar_partida');

      // Sem o time nao da para montar a estatistica, e ela ficaria orfa.
      assert.match(encerrar, /if v_team_id is null then/);
      assert.match(encerrar, /raise exception 'Partida nao encontrada\.'/);
    },
  },
  {
    name: 'estatistica nao aceita numero negativo',
    run() {
      const sql = apenasCodigo(fs.readFileSync(RPC, 'utf8'));
      const encerrar = bloco(sql, 'encerrar_partida');

      // A coluna tem `check >= 0`: negativo recusaria a linha inteira, e a
      // partida ficaria encerrada sem nenhuma estatistica.
      const greatest = encerrar.match(/greatest\(coalesce/g) ?? [];
      assert.equal(greatest.length >= 4, true, `esperava 4 protecoes, achei ${greatest.length}`);
    },
  },
  {
    name: 'custo do campo e participantes entram juntos',
    run() {
      const sql = apenasCodigo(fs.readFileSync(RPC, 'utf8'));
      const custo = bloco(sql, 'salvar_custo_do_campo');

      // Valor sem quem paga faria o painel de pendencias mentir.
      assert.match(custo, /insert into public\.match_field_costs/);
      assert.match(custo, /delete from public\.match_field_participants/);
      assert.match(custo, /insert into public\.match_field_participants/);
    },
  },
  {
    name: 'pagante vence isento quando o id vem repetido',
    run() {
      const sql = apenasCodigo(fs.readFileSync(RPC, 'utf8'));
      const custo = bloco(sql, 'salvar_custo_do_campo');

      // Pagou, pagou: apagar esse fato criaria devedor que ja acertou. E a
      // chave primaria so aceita um papel por pessoa.
      assert.match(custo, /distinct on \(participante ->> 'player_id'\)/);
      assert.match(custo, /\(participante ->> 'role'\) = 'payer' desc/);
    },
  },
  {
    name: 'papel invalido nao entra como participante',
    run() {
      const sql = apenasCodigo(fs.readFileSync(RPC, 'utf8'));
      const custo = bloco(sql, 'salvar_custo_do_campo');

      assert.match(custo, /in \('payer', 'exempt'\)/);
    },
  },
  {
    name: 'toda RPC nova esta liberada para o papel authenticated',
    run() {
      const sql = apenasCodigo(fs.readFileSync(RPC, 'utf8'));

      // Sem o grant a funcao existe mas ninguem consegue chamar — e o erro
      // aparece so em producao.
      for (const funcao of ['criar_partida', 'encerrar_partida', 'salvar_custo_do_campo']) {
        assert.match(
          sql,
          new RegExp(`grant execute on function public\\.${funcao}\\(`),
          `${funcao} sem grant`,
        );
      }
    },
  },
];
