import assert from 'node:assert/strict';

import {
  paraEscalacao,
  paraEstatistica,
  paraPartida,
  paraPresenca,
} from '@/lib/migracao/mapear-dominio';

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

const LINHA_DE_PARTIDA = {
  id: 'match-1',
  team_id: 'team-1',
  season_id: null,
  date: '2026-08-20',
  time: '20:00',
  venue: 'La Macaibeira',
  opponent_name: 'Panelinha FC',
  opponent_source: 'manual',
  line_players_count: 7,
  match_type: 'society',
  notes: '',
  status: 'finished',
  created_by: 'user-1',
  scoreboard: { team: 3, opponent: 2, result: 'win' },
  finished_at: '2026-08-20T22:00:00+00:00',
  mvp_winner_player_ids: ['p1'],
  mvp_total_votes: 3,
  deleted_at: null,
  created_at: '2026-08-15T10:00:00+00:00',
  updated_at: '2026-08-20T22:00:00+00:00',
};

const CUSTO = {
  match_id: 'match-1',
  total_amount_cents: 18500,
  split_count: 13,
  amount_per_player_cents: 1423,
  note: null,
  pix_key: 'chave-pix',
  responsible_name: 'Callejas',
  paid_guest_count: 1,
  updated_at: '2026-08-20T23:00:00+00:00',
  updated_by_user_id: 'user-1',
};

const PARTICIPANTES = [
  { match_id: 'match-1', player_id: 'p2', role: 'payer' },
  { match_id: 'match-1', player_id: 'p1', role: 'payer' },
  { match_id: 'match-1', player_id: 'p3', role: 'exempt' },
  // De outra partida: não pode vazar.
  { match_id: 'match-9', player_id: 'p9', role: 'payer' },
];

export const supabasePartidasTestCases: TestCase[] = [
  {
    name: 'partida volta com placar e datas normalizadas',
    run() {
      const partida = paraPartida(LINHA_DE_PARTIDA);

      assert.equal(partida.id, 'match-1');
      assert.equal(partida.status, 'finished');
      assert.equal(partida.date, '2026-08-20');
      assert.deepEqual(partida.scoreboard, { team: 3, opponent: 2, result: 'win' });
      // O banco devolve com fuso; o app ordena essas strings.
      assert.equal(partida.finishedAt, '2026-08-20T22:00:00.000Z');
    },
  },
  {
    name: 'custo do campo volta de centavos para reais',
    run() {
      // O dominio ainda usa reais. A conversao de ida ja arredondou uma vez;
      // refazer a divisao aqui so acumularia erro.
      const partida = paraPartida(LINHA_DE_PARTIDA, CUSTO, PARTICIPANTES);

      assert.equal(partida.fieldCost?.totalAmount, 185);
      assert.equal(partida.fieldCost?.amountPerPlayer, 14.23);
      assert.equal(partida.fieldCost?.splitCount, 13);
      assert.equal(partida.fieldCost?.currency, 'BRL');
    },
  },
  {
    name: 'pagantes e isentos voltam separados e em ordem estavel',
    run() {
      const partida = paraPartida(LINHA_DE_PARTIDA, CUSTO, PARTICIPANTES);

      // Ordem por id, nao a ordem que o Postgres devolveu.
      assert.deepEqual(partida.fieldPayment?.payerPlayerIds, ['p1', 'p2']);
      assert.deepEqual(partida.fieldPayment?.exemptPlayerIds, ['p3']);
      assert.equal(partida.fieldPayment?.pixKey, 'chave-pix');
      assert.equal(partida.fieldPayment?.paidGuestCount, 1);
    },
  },
  {
    name: 'participante de outra partida nao vaza',
    run() {
      const partida = paraPartida(LINHA_DE_PARTIDA, CUSTO, PARTICIPANTES);
      const todos = [
        ...(partida.fieldPayment?.payerPlayerIds ?? []),
        ...(partida.fieldPayment?.exemptPlayerIds ?? []),
      ];

      assert.equal(todos.includes('p9'), false);
    },
  },
  {
    name: 'partida sem custo nao inventa cobranca',
    run() {
      // `fieldCost` nulo e o que faz a tela nao mostrar rateio nenhum.
      const partida = paraPartida(LINHA_DE_PARTIDA);

      assert.equal(partida.fieldCost, null);
      assert.equal(partida.fieldPayment, null);

      // Custo zerado tambem nao conta como cobranca.
      const semValor = paraPartida(LINHA_DE_PARTIDA, { ...CUSTO, total_amount_cents: 0 }, []);
      assert.equal(semValor.fieldCost, null);
    },
  },
  {
    name: 'status invalido cai no padrao em vez de quebrar a tela',
    run() {
      assert.equal(paraPartida({ ...LINHA_DE_PARTIDA, status: 'inventado' }).status, 'scheduled');
      assert.equal(
        paraPartida({ ...LINHA_DE_PARTIDA, match_type: 'handebol' }).matchType,
        'society',
      );
    },
  },
  {
    name: 'presenca volta com o status certo',
    run() {
      const presenca = paraPresenca({
        id: 'match-1__p1',
        team_id: 'team-1',
        match_id: 'match-1',
        player_id: 'p1',
        user_id: 'user-1',
        status: 'confirmed',
        responded_at: '2026-08-19T12:00:00+00:00',
        created_at: '2026-08-15T10:00:00+00:00',
        updated_at: '2026-08-19T12:00:00+00:00',
      });

      assert.equal(presenca.status, 'confirmed');
      assert.equal(presenca.playerId, 'p1');
      assert.equal(presenca.respondedAt, '2026-08-19T12:00:00.000Z');
    },
  },
  {
    name: 'estatistica nao inventa numero negativo',
    run() {
      const stat = paraEstatistica({
        id: 'match-1__p1',
        team_id: 'team-1',
        match_id: 'match-1',
        player_id: 'p1',
        played: true,
        started: false,
        goals: 2,
        assists: 1,
        yellow_cards: 0,
        red_cards: 0,
      });

      assert.equal(stat.played, true);
      assert.equal(stat.started, false);
      assert.equal(stat.goals, 2);
      assert.equal(stat.assists, 1);
    },
  },
  {
    name: 'escalacao descarta no sem jogador',
    run() {
      // Um no sem `playerId` quebraria o desenho do campo.
      const escalacao = paraEscalacao({
        id: 'lineup-1',
        team_id: 'team-1',
        match_id: 'match-1',
        formation_key: '4-3-3',
        starters: [
          { playerId: 'p1', x: 50, y: 10, zone: 'attack' },
          { x: 20, y: 80, zone: 'defense' },
          'lixo',
        ],
        bench_player_ids: ['p2', ''],
      });

      assert.equal(escalacao.starters.length, 1);
      assert.equal(escalacao.starters[0].playerId, 'p1');
      assert.deepEqual(escalacao.benchPlayerIds, ['p2']);
    },
  },
  {
    name: 'zona invalida na escalacao cai no meio-campo',
    run() {
      const escalacao = paraEscalacao({
        id: 'lineup-1',
        team_id: 'team-1',
        match_id: 'match-1',
        starters: [{ playerId: 'p1', x: 50, y: 50, zone: 'inventada' }],
      });

      assert.equal(escalacao.starters[0].zone, 'midfield');
    },
  },
];
