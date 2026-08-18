import assert from 'node:assert/strict';

import {
  DEFINICOES,
  ORDEM_DAS_TABELAS,
  dataOuNulo,
  instante,
  instanteOuNulo,
  inteiro,
  listaDeIds,
  mapearDespesa,
  mapearJogador,
  mapearNota,
  mapearPartida,
  mapearTime,
  mapearUsuario,
  mapearVoto,
  objetoOuNulo,
  resolverReferencias,
  type Linha,
  type NomeDaTabela,
} from '@/lib/migracao/mapear-postgres';

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

const REFERENCIA = '2026-08-18T12:00:00.000Z';
const CONTEXTO = { referencia: REFERENCIA };

function conhecidos(mapa: Partial<Record<NomeDaTabela, string[]>>) {
  const resultado: Partial<Record<NomeDaTabela, Set<string>>> = {};

  for (const [tabela, ids] of Object.entries(mapa)) {
    resultado[tabela as NomeDaTabela] = new Set(ids);
  }

  return resultado;
}

export const migracaoPostgresTestCases: TestCase[] = [
  {
    name: 'data aceita ISO, Timestamp do Firestore e milissegundos',
    run() {
      assert.equal(instanteOuNulo('2026-08-18T12:00:00.000Z'), REFERENCIA);

      // Timestamp com toDate(), como vem do firebase-admin.
      assert.equal(
        instanteOuNulo({ toDate: () => new Date('2026-08-18T12:00:00.000Z') }),
        REFERENCIA,
      );

      // Timestamp ja serializado para JSON perde o toDate e sobra o seconds.
      const milissegundos = Date.parse(REFERENCIA);
      const segundos = milissegundos / 1000;

      assert.equal(instanteOuNulo({ seconds: segundos, nanoseconds: 0 }), REFERENCIA);
      assert.equal(instanteOuNulo({ _seconds: segundos }), REFERENCIA);
      assert.equal(instanteOuNulo(milissegundos), REFERENCIA);
    },
  },
  {
    name: 'data invalida vira nulo em vez de Invalid Date',
    run() {
      // `new Date('qualquer coisa')` nao lanca: devolve Invalid Date, que o
      // Postgres recusa. Precisa morrer aqui.
      assert.equal(instanteOuNulo('qualquer coisa'), null);
      assert.equal(instanteOuNulo(''), null);
      assert.equal(instanteOuNulo(null), null);
      assert.equal(instanteOuNulo(undefined), null);
      assert.equal(instanteOuNulo(Number.NaN), null);
      assert.equal(instanteOuNulo({ toDate: () => new Date('nada') }), null);
    },
  },
  {
    name: 'created_at sem valor cai na referencia, nunca em nulo',
    run() {
      // A coluna e NOT NULL: documento antigo sem data nao pode derrubar a linha.
      assert.equal(instante(undefined, REFERENCIA), REFERENCIA);
      assert.equal(instante('lixo', REFERENCIA), REFERENCIA);
      assert.equal(instante('2020-01-01T00:00:00.000Z', REFERENCIA), '2020-01-01T00:00:00.000Z');
    },
  },
  {
    name: 'data pura mantem o formato que o app compara',
    run() {
      // O app ordena e compara essas strings direto; virar timestamp quebraria.
      assert.equal(dataOuNulo('2026-08-18'), '2026-08-18');
      assert.equal(dataOuNulo('2026-08-18T23:30:00.000Z'), '2026-08-18');
      assert.equal(dataOuNulo('18/08/2026'), null);
      assert.equal(dataOuNulo(undefined), null);
    },
  },
  {
    name: 'numero negativo nao passa para coluna com check maior que zero',
    run() {
      // gols, cartoes e centavos tem `check >= 0`: negativo recusaria a linha.
      assert.equal(inteiro(-3), 0);
      assert.equal(inteiro(2.9), 2);
      assert.equal(inteiro('7'), 7);
      assert.equal(inteiro(undefined, 5), 5);
      assert.equal(inteiro(Number.NaN, 5), 5);
    },
  },
  {
    name: 'lista de ids descarta vazio e repetido',
    run() {
      assert.deepEqual(listaDeIds(['a', '', 'b', 'a', null, '  ']), ['a', 'b']);
      assert.deepEqual(listaDeIds('a'), []);
      assert.deepEqual(listaDeIds(undefined), []);
    },
  },
  {
    name: 'jsonb aceita objeto e recusa array e primitivo',
    run() {
      assert.deepEqual(objetoOuNulo({ team: 3 }), { team: 3 });
      assert.equal(objetoOuNulo([1, 2]), null);
      assert.equal(objetoOuNulo('texto'), null);
      assert.equal(objetoOuNulo(null), null);
    },
  },
  {
    name: 'documento sem campo obrigatorio fica fora em vez de quebrar',
    run() {
      // Melhor perder a linha e ver no relatorio do que derrubar a importacao
      // inteira num erro de constraint no meio do lote.
      assert.equal(mapearUsuario({ id: 'u1' }, CONTEXTO), null);
      assert.equal(mapearUsuario({ email: 'a@b.com' }, CONTEXTO), null);
      assert.equal(mapearTime({ id: 't1' }, CONTEXTO), null);
      assert.equal(mapearPartida({ id: 'm1', teamId: 't1', date: '2026-08-18' }, CONTEXTO), null);
      assert.equal(mapearDespesa({ id: 'e1', teamId: 't1', categoryId: 'c1' }, CONTEXTO), null);
    },
  },
  {
    name: 'e-mail entra em minusculas no usuario e no jogador',
    run() {
      // Cadastro com maiuscula foi exatamente o que deixou gente sem conseguir
      // votar: a resolucao por e-mail compara normalizado.
      const usuario = mapearUsuario({ id: 'u1', email: 'Pedro@Hotmail.COM' }, CONTEXTO);
      assert.equal(usuario?.email, 'pedro@hotmail.com');

      const jogador = mapearJogador(
        { id: 'p1', teamId: 't1', fullName: 'Pedro', linkedEmail: 'Pedro@Hotmail.COM' },
        CONTEXTO,
      );
      assert.equal(jogador?.linked_email, 'pedro@hotmail.com');
    },
  },
  {
    name: 'slug ausente cai no id para nao colidir no unique',
    run() {
      const time = mapearTime({ id: 'time-1', adminUserId: 'u1' }, CONTEXTO);

      assert.equal(time?.slug, 'time-1');
      assert.equal(time?.invite_code, 'time-1');
    },
  },
  {
    name: 'apelido vazio cai no nome completo',
    run() {
      const jogador = mapearJogador(
        { id: 'p1', teamId: 't1', fullName: 'Pedro Parceiro', nickname: '   ' },
        CONTEXTO,
      );

      assert.equal(jogador?.nickname, 'Pedro Parceiro');
    },
  },
  {
    name: 'posicao invalida cai em meio-campo em vez de recusar a linha',
    run() {
      const jogador = mapearJogador(
        {
          id: 'p1',
          teamId: 't1',
          fullName: 'Pedro',
          primaryPosition: 'ponta-esquerda-inventada',
          secondaryPositions: ['striker', 'invalida'],
        },
        CONTEXTO,
      );

      assert.equal(jogador?.primary_position, 'midfielder');
      assert.deepEqual(jogador?.secondary_positions, ['striker']);
    },
  },
  {
    name: 'voto e nota em si mesmo ficam fora',
    run() {
      // As tabelas tem `check (voter <> target)`. Dado assim existe no historico
      // e recusaria o lote inteiro.
      assert.equal(
        mapearVoto(
          { id: 'v1', teamId: 't1', matchId: 'm1', voterPlayerId: 'p1', targetPlayerId: 'p1' },
          CONTEXTO,
        ),
        null,
      );

      assert.equal(
        mapearNota(
          { id: 'r1', teamId: 't1', matchId: 'm1', raterPlayerId: 'p1', targetPlayerId: 'p1' },
          CONTEXTO,
        ),
        null,
      );
    },
  },
  {
    name: 'avaliacao antiga vai para coluna separada',
    run() {
      const nota = mapearNota(
        {
          id: 'r1',
          teamId: 't1',
          matchId: 'm1',
          raterPlayerId: 'p1',
          targetPlayerId: 'p2',
          criteria: { qualidade: 8 },
          overall: 7.5,
        },
        CONTEXTO,
      );

      // O modelo novo fica vazio, mas presente: as colunas sao NOT NULL.
      assert.deepEqual(nota?.criteria_scores, {});
      assert.deepEqual(nota?.criteria_snapshot, {});
      assert.deepEqual(nota?.legacy_criteria, { qualidade: 8 });
      assert.equal(nota?.overall, 7.5);
    },
  },
  {
    name: 'referencia obrigatoria pendurada descarta a linha',
    run() {
      const linhas: Linha[] = [
        { id: 'm1', team_id: 't1', created_by: 'u1' },
        { id: 'm2', team_id: 'time-apagado', created_by: 'u1' },
      ];

      const resultado = resolverReferencias(
        'matches',
        linhas,
        conhecidos({ teams: ['t1'], users: ['u1'] }),
      );

      assert.equal(resultado.aceitas.length, 1);
      assert.equal(resultado.aceitas[0].id, 'm1');
      assert.deepEqual(resultado.descartadas, [
        { id: 'm2', campo: 'team_id', valor: 'time-apagado' },
      ]);
    },
  },
  {
    name: 'referencia opcional pendurada zera o campo e mantem a linha',
    run() {
      // Partida apontando para temporada apagada: perder a partida por causa
      // disso seria pior do que perder o vinculo com a temporada.
      const linhas: Linha[] = [
        { id: 'm1', team_id: 't1', created_by: 'u1', season_id: 'temporada-apagada' },
      ];

      const resultado = resolverReferencias(
        'matches',
        linhas,
        conhecidos({ teams: ['t1'], users: ['u1'], seasons: ['s1'] }),
      );

      assert.equal(resultado.aceitas.length, 1);
      assert.equal(resultado.aceitas[0].season_id, null);
      assert.deepEqual(resultado.ajustadas, [
        { id: 'm1', campo: 'season_id', valor: 'temporada-apagada' },
      ]);
    },
  },
  {
    name: 'resolver referencias nao muta a linha de entrada',
    run() {
      const original: Linha = {
        id: 'm1',
        team_id: 't1',
        created_by: 'u1',
        season_id: 'apagada',
      };

      resolverReferencias('matches', [original], conhecidos({ teams: ['t1'], users: ['u1'] }));

      // Se mutasse, uma segunda passada veria o dado ja alterado e o relatorio
      // mentiria sobre o que foi ajustado.
      assert.equal(original.season_id, 'apagada');
    },
  },
  {
    name: 'tabela sem regra passa tudo adiante',
    run() {
      const linhas: Linha[] = [{ id: 'u1', email: 'a@b.com' }];
      const resultado = resolverReferencias('users', linhas, conhecidos({}));

      assert.equal(resultado.aceitas.length, 1);
      assert.equal(resultado.descartadas.length, 0);
    },
  },
  {
    name: 'ordem de importacao respeita a chave estrangeira',
    run() {
      const posicao = (tabela: NomeDaTabela) => ORDEM_DAS_TABELAS.indexOf(tabela);

      // Cada alvo tem de vir antes de quem aponta para ele, senao a FK recusa.
      const dependencias: [NomeDaTabela, NomeDaTabela][] = [
        ['teams', 'users'],
        ['players', 'teams'],
        ['team_members', 'players'],
        ['matches', 'seasons'],
        ['attendance', 'matches'],
        ['mvp_votes', 'players'],
        ['player_ratings', 'matches'],
        ['expenses', 'expense_categories'],
        ['expenses', 'matches'],
      ];

      for (const [quemAponta, alvo] of dependencias) {
        assert.equal(
          posicao(alvo) < posicao(quemAponta),
          true,
          `${alvo} precisa vir antes de ${quemAponta}`,
        );
      }
    },
  },
  {
    name: 'toda tabela do schema tem mapeador e colecao de origem',
    run() {
      for (const tabela of ORDEM_DAS_TABELAS) {
        const definicao = DEFINICOES.find((item) => item.tabela === tabela);

        assert.equal(Boolean(definicao), true, `sem mapeador para ${tabela}`);
        assert.equal(typeof definicao?.colecao, 'string');
        assert.equal((definicao?.colecao ?? '').length > 0, true);
      }

      assert.equal(DEFINICOES.length, ORDEM_DAS_TABELAS.length);
    },
  },
];
