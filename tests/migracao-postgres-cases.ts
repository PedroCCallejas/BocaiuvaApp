import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  CHAVE_DE_CONFLITO,
  DEFINICOES,
  ORDEM_DAS_TABELAS,
  TABELAS_FILHAS,
  dataOuNulo,
  dependenciasVazias,
  derivarCotasDaDespesa,
  derivarCustoDoCampo,
  derivarParticipantesDoCampo,
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

import { COLUNAS_DO_POSTGRES, DOCUMENTO_COMPLETO } from './schema-postgres';

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
      assert.equal(mapearUsuario({ email: 'a@b.com' }, CONTEXTO), null);
      assert.equal(mapearTime({ name: 'Sem id' }, CONTEXTO), null);
      assert.equal(mapearPartida({ id: 'm1', teamId: 't1' }, CONTEXTO), null);
      assert.equal(mapearDespesa({ id: 'e1', teamId: 't1', categoryId: 'c1' }, CONTEXTO), null);
    },
  },
  {
    name: 'campo que so identifica autoria nao descarta a linha',
    run() {
      // Descartar por autoria seria desproporcional: sem o usuario, o time
      // inteiro sumiria e levaria elenco, partidas e historico junto.
      const usuario = mapearUsuario({ id: 'u1' }, CONTEXTO);
      assert.equal(usuario?.id, 'u1');
      assert.equal(usuario?.email, null);

      const time = mapearTime({ id: 't1', name: 'Bocaiuva' }, CONTEXTO);
      assert.equal(time?.id, 't1');
      assert.equal(time?.admin_user_id, null);

      const partida = mapearPartida({ id: 'm1', teamId: 't1', date: '2026-08-18' }, CONTEXTO);
      assert.equal(partida?.id, 'm1');
      assert.equal(partida?.created_by, null);
    },
  },
  {
    name: 'dono e autor pendurados zeram o campo em vez de apagar a linha',
    run() {
      const times = resolverReferencias(
        'teams',
        [{ id: 't1', admin_user_id: 'usuario-apagado' }],
        conhecidos({ users: ['u1'] }),
      );

      assert.equal(times.aceitas.length, 1);
      assert.equal(times.aceitas[0].admin_user_id, null);

      const partidas = resolverReferencias(
        'matches',
        [{ id: 'm1', team_id: 't1', created_by: 'usuario-apagado' }],
        conhecidos({ teams: ['t1'], users: ['u1'] }),
      );

      assert.equal(partidas.aceitas.length, 1);
      assert.equal(partidas.aceitas[0].created_by, null);
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
    name: 'pedaco fora de ordem e acusado antes de descartar tudo em silencio',
    run() {
      // Pedir player_ratings antes de players descartaria as milhares de notas
      // por referencia pendurada — e o script diria que deu certo.
      assert.deepEqual(
        dependenciasVazias(
          'player_ratings',
          conhecidos({ teams: ['t1'], matches: ['m1'], players: [] }),
        ),
        ['players'],
      );

      assert.deepEqual(dependenciasVazias('players', conhecidos({ teams: [] })), ['teams']);

      // `teams` nao depende mais de `users`: dono ausente vira campo nulo, nao
      // motivo para barrar a importacao.
      assert.deepEqual(dependenciasVazias('teams', conhecidos({ users: [] })), []);
    },
  },
  {
    name: 'conjunto ausente nao e o mesmo que vazio',
    run() {
      // Ausente = "nao sei quais existem", entao nao da para acusar nada.
      // So o conjunto vazio significa "conferi e nao tem nenhum".
      assert.deepEqual(dependenciasVazias('player_ratings', conhecidos({})), []);

      assert.deepEqual(
        dependenciasVazias(
          'player_ratings',
          conhecidos({ teams: ['t1'], matches: ['m1'], players: ['p1'] }),
        ),
        [],
      );
    },
  },
  {
    name: 'tabela sem dependencia obrigatoria nunca e barrada',
    run() {
      assert.deepEqual(dependenciasVazias('users', conhecidos({})), []);
      assert.deepEqual(dependenciasVazias('users', conhecidos({ teams: [] })), []);
    },
  },
  {
    name: 'tabela pulada nao gasta leitura do Firestore',
    run() {
      const script = fs.readFileSync('scripts/migrar-para-postgres.ts', 'utf8');
      const laco = script.slice(script.indexOf('for (const tabela of ORDEM_DAS_TABELAS)'));
      const trecho = laco.slice(0, laco.indexOf('const documentos = await lerColecao'));

      // Importar em pedacos so ajuda se o pedaco pulado nao for lido: a leitura
      // do Firestore e justamente o recurso racionado.
      assert.match(trecho, /if \(pular\) \{/);
      assert.match(trecho, /lerIdsExistentes\(supabase, tabela\)/);
      assert.match(trecho, /continue;/);
    },
  },
  {
    name: 'baixar e importar sao etapas separadas',
    run() {
      const script = fs.readFileSync('scripts/migrar-para-postgres.ts', 'utf8');

      // Ler e importar na mesma passada fazia cada tentativa custar uma leitura
      // completa do banco. Erro no mapeamento = esperar o dia seguinte.
      assert.match(script, /--salvar-em=/);
      assert.match(script, /--ler-de=/);

      // Sem Firestore aberto quando le do disco: nem credencial e exigida.
      assert.match(script, /opcoes\.lerDe \? null : abrirFirestore\(opcoes\)/);
    },
  },
  {
    name: 'o dump guarda o documento cru, nao o resultado do mapeamento',
    run() {
      const script = fs.readFileSync('scripts/migrar-para-postgres.ts', 'utf8');
      const inicio = script.indexOf('if (opcoes.salvarEm && !opcoes.lerDe)');
      assert.equal(inicio > 0, true, 'gravacao do dump nao encontrada');

      // Salvar o cru e o que permite reprocessar quando o mapeamento mudar.
      // Se guardasse o mapeado, corrigir um erro exigiria reler o Firestore.
      const mapeamento = script.indexOf('const mapeadas: Linha[] = []');
      assert.equal(inicio < mapeamento, true, 'dump precisa vir antes do mapeamento');
    },
  },
  {
    name: 'colecao ausente no dump e vazia, nao erro',
    run() {
      const script = fs.readFileSync('scripts/migrar-para-postgres.ts', 'utf8');
      const bloco = script.slice(script.indexOf('function carregarColecao'));

      // Nem todo time tem temporada, resenha ou despesa.
      assert.match(bloco.slice(0, 500), /if \(!existsSync\(caminho\)\) \{\s*return \[\];/);
    },
  },
  {
    name: 'erro de cota explica a janela em vez de so repetir a mensagem',
    run() {
      const script = fs.readFileSync('scripts/migrar-para-postgres.ts', 'utf8');

      assert.match(script, /RESOURCE_EXHAUSTED\|Quota exceeded/);

      const bloco = script.slice(script.indexOf('if (ehCotaEstourada(erro))'));

      // "Quota exceeded" sozinho parece bug do script. Nao e.
      assert.match(bloco.slice(0, 1200), /meia-noite do Pacifico/);
      assert.match(bloco.slice(0, 1200), /--only=/);
    },
  },
  {
    name: 'rateio igual vira uma cota por participante e a soma fecha',
    run() {
      const cotas = derivarCotasDaDespesa(
        {
          id: 'e1',
          totalAmountCents: 1000,
          splitMode: 'equal',
          participantPlayerIds: ['p1', 'p2', 'p3'],
          updatedAt: REFERENCIA,
        },
        CONTEXTO,
      );

      assert.equal(cotas.length, 3);

      // 1000 / 3 nao e inteiro: o centavo que sobra vai para o primeiro, e a
      // soma tem de fechar exatamente com o total.
      const soma = cotas.reduce((total, cota) => total + Number(cota.amount_cents), 0);
      assert.equal(soma, 1000);
      assert.deepEqual(
        cotas.map((cota) => cota.amount_cents),
        [334, 333, 333],
      );
    },
  },
  {
    name: 'cota extra entra na divisao mas nao vira linha',
    run() {
      // Convidado que ninguem cadastrou divide a conta, mas nao ha a quem cobrar.
      const cotas = derivarCotasDaDespesa(
        {
          id: 'e1',
          totalAmountCents: 900,
          splitMode: 'equal',
          participantPlayerIds: ['p1', 'p2'],
          extraSharesCount: 1,
          updatedAt: REFERENCIA,
        },
        CONTEXTO,
      );

      assert.equal(cotas.length, 2);
      assert.deepEqual(
        cotas.map((cota) => cota.amount_cents),
        [300, 300],
      );
    },
  },
  {
    name: 'rateio manual respeita o valor combinado',
    run() {
      const cotas = derivarCotasDaDespesa(
        {
          id: 'e1',
          totalAmountCents: 1000,
          splitMode: 'manual',
          participantPlayerIds: ['p1', 'p2'],
          manualSharesCents: { p1: 700, p2: 300 },
          settledPlayerIds: ['p1'],
          updatedAt: REFERENCIA,
        },
        CONTEXTO,
      );

      assert.deepEqual(
        cotas.map((cota) => cota.amount_cents),
        [700, 300],
      );

      // Quem ja acertou fica com data; quem deve continua nulo.
      assert.equal(cotas[0].settled_at, REFERENCIA);
      assert.equal(cotas[1].settled_at, null);
    },
  },
  {
    name: 'custo do campo sai de reais float para centavos inteiros',
    run() {
      const custo = derivarCustoDoCampo(
        {
          id: 'm1',
          fieldCost: { totalAmount: 120.5, splitCount: 10, amountPerPlayer: 12.05 },
          fieldPayment: { pixKey: 'chave', paidGuestCount: 2 },
          updatedAt: REFERENCIA,
        },
        CONTEXTO,
      );

      assert.equal(custo.length, 1);
      // Float em dinheiro fecha conta errada; 120.5 tem de virar 12050.
      assert.equal(custo[0].total_amount_cents, 12050);
      assert.equal(custo[0].amount_per_player_cents, 1205);
      assert.equal(custo[0].split_count, 10);
      assert.equal(custo[0].pix_key, 'chave');
      assert.equal(custo[0].paid_guest_count, 2);
    },
  },
  {
    name: 'partida sem custo de campo nao gera linha',
    run() {
      assert.deepEqual(derivarCustoDoCampo({ id: 'm1' }, CONTEXTO), []);
      assert.deepEqual(derivarParticipantesDoCampo({ id: 'm1' }, CONTEXTO), []);
    },
  },
  {
    name: 'pagante vence isento quando a pessoa esta nas duas listas',
    run() {
      // A chave primaria so aceita um papel. Quem pagou, pagou: apagar esse
      // fato criaria um devedor que ja acertou.
      const participantes = derivarParticipantesDoCampo(
        {
          id: 'm1',
          fieldPayment: {
            payerPlayerIds: ['p1', 'p2'],
            exemptPlayerIds: ['p2', 'p3'],
          },
          updatedAt: REFERENCIA,
        },
        CONTEXTO,
      );

      const porJogador = new Map(
        participantes.map((linha) => [String(linha.player_id), String(linha.role)]),
      );

      assert.equal(porJogador.size, 3);
      assert.equal(porJogador.get('p1'), 'payer');
      assert.equal(porJogador.get('p2'), 'payer');
      assert.equal(porJogador.get('p3'), 'exempt');
    },
  },
  {
    name: 'despesa nao carrega mais as listas paralelas',
    run() {
      const despesa = mapearDespesa(
        {
          id: 'e1',
          teamId: 't1',
          categoryId: 'c1',
          date: '2026-08-18',
          totalAmountCents: 1000,
          participantPlayerIds: ['p1'],
          settledPlayerIds: ['p1'],
          manualSharesCents: { p1: 1000 },
        },
        CONTEXTO,
      );

      // Essas colunas sairam do schema: quem responde por elas e expense_shares.
      assert.equal('participant_player_ids' in (despesa ?? {}), false);
      assert.equal('settled_player_ids' in (despesa ?? {}), false);
      assert.equal('manual_shares_cents' in (despesa ?? {}), false);
      assert.equal(despesa?.split_mode, 'equal');
    },
  },
  {
    name: 'toda tabela filha tem chave de conflito declarada',
    run() {
      for (const tabela of TABELAS_FILHAS) {
        const chave = CHAVE_DE_CONFLITO[tabela];

        assert.equal(typeof chave, 'string');
        // Chave composta: sem isso o upsert duplicaria em vez de atualizar.
        assert.equal(chave.length > 0, true, `sem chave para ${tabela}`);
      }

      const declaradas = DEFINICOES.flatMap((definicao) =>
        (definicao.filhas ?? []).map((filha) => filha.tabela),
      );

      assert.deepEqual([...declaradas].sort(), [...TABELAS_FILHAS].sort());
    },
  },
  {
    name: 'nenhum mapeador emite coluna que nao existe no Postgres',
    run() {
      // Este e o teste que faltava. O mapeamento continuou mandando
      // `field_cost` depois que a coluna saiu do schema, e o erro so apareceu
      // no meio do lote da importacao.
      for (const definicao of DEFINICOES) {
        const linha = definicao.mapear(DOCUMENTO_COMPLETO, CONTEXTO);
        assert.equal(Boolean(linha), true, `${definicao.tabela} nao mapeou o documento`);

        const colunas = COLUNAS_DO_POSTGRES[definicao.tabela];
        assert.equal(Boolean(colunas), true, `sem schema conhecido para ${definicao.tabela}`);

        const sobrando = Object.keys(linha ?? {}).filter(
          (coluna) => !colunas.includes(coluna),
        );

        assert.deepEqual(
          sobrando,
          [],
          `${definicao.tabela} emite coluna inexistente: ${sobrando.join(', ')}`,
        );
      }
    },
  },
  {
    name: 'nenhuma tabela filha emite coluna que nao existe',
    run() {
      for (const definicao of DEFINICOES) {
        for (const filha of definicao.filhas ?? []) {
          const linhas = filha.derivar(DOCUMENTO_COMPLETO, CONTEXTO);

          assert.equal(
            linhas.length > 0,
            true,
            `${filha.tabela} nao derivou nada do documento completo`,
          );

          const colunas = COLUNAS_DO_POSTGRES[filha.tabela];

          for (const linha of linhas) {
            const sobrando = Object.keys(linha).filter((coluna) => !colunas.includes(coluna));

            assert.deepEqual(
              sobrando,
              [],
              `${filha.tabela} emite coluna inexistente: ${sobrando.join(', ')}`,
            );
          }
        }
      }
    },
  },
  {
    name: 'coluna obrigatoria sem valor padrao e sempre preenchida',
    run() {
      // NOT NULL sem default recusa a linha inteira. Melhor descobrir aqui.
      const obrigatorias: Record<string, string[]> = {
        users: ['id'],
        teams: ['id', 'name', 'slug', 'primary_color', 'secondary_color', 'invite_code'],
        players: ['id', 'team_id', 'full_name', 'nickname', 'primary_position'],
        matches: ['id', 'team_id', 'date'],
        expenses: ['id', 'team_id', 'category_id', 'date', 'total_amount_cents'],
        mvp_votes: ['id', 'team_id', 'match_id', 'voter_player_id', 'target_player_id'],
      };

      for (const [tabela, colunas] of Object.entries(obrigatorias)) {
        const definicao = DEFINICOES.find((item) => item.tabela === tabela);
        const linha = definicao?.mapear(DOCUMENTO_COMPLETO, CONTEXTO);

        for (const coluna of colunas) {
          assert.notEqual(
            linha?.[coluna] ?? null,
            null,
            `${tabela}.${coluna} veio nulo`,
          );
        }
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
