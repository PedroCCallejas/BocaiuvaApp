import assert from 'node:assert/strict';

import { buildPlayerAchievements } from '@/lib/player-achievements';
import type {
  AttendanceRecord,
  Match,
  MatchStat,
  Player,
} from '@/types/domain';

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

const TIME = 'time-1';
const JOGADOR = 'jogador-1';

function criarJogador(): Player {
  return {
    id: JOGADOR,
    teamId: TIME,
    nickname: 'Art',
    fullName: 'Arthur Cordeiro',
    status: 'active',
    createdAt: '2020-01-01T00:00:00.000Z',
    updatedAt: '2020-01-01T00:00:00.000Z',
  } as Player;
}

/** Partidas encerradas, da mais antiga para a mais nova. */
function criarPartidas(total: number): Match[] {
  return Array.from({ length: total }, (_, indice) => ({
    id: `partida-${indice + 1}`,
    teamId: TIME,
    date: `2026-01-${String(indice + 1).padStart(2, '0')}`,
    time: '20:00',
    opponentName: 'Adversario',
    status: 'finished',
    matchType: 'society',
    scoreboard: { team: 1, opponent: 0, result: 'win' },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  })) as Match[];
}

function presencaEm(partidas: Match[]): AttendanceRecord[] {
  return partidas.map((partida) => ({
    id: `${partida.id}__${JOGADOR}`,
    teamId: TIME,
    matchId: partida.id,
    playerId: JOGADOR,
    status: 'confirmed',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  })) as AttendanceRecord[];
}

function statsCom(
  partidas: Match[],
  porPartida: (indice: number) => { amarelos?: number; vermelhos?: number; jogou?: boolean },
): MatchStat[] {
  return partidas.map((partida, indice) => {
    const valores = porPartida(indice);

    return {
      id: `${partida.id}__${JOGADOR}`,
      teamId: TIME,
      matchId: partida.id,
      playerId: JOGADOR,
      played: valores.jogou ?? true,
      started: true,
      goals: 0,
      assists: 0,
      yellowCards: valores.amarelos ?? 0,
      redCards: valores.vermelhos ?? 0,
      notes: '',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
  }) as MatchStat[];
}

function selosDe(input: {
  partidas: Match[];
  stats: MatchStat[];
}) {
  return buildPlayerAchievements({
    player: criarJogador(),
    matches: input.partidas,
    attendance: presencaEm(input.partidas),
    matchStats: input.stats,
  });
}

function temSelo(selos: { id: string }[], id: string) {
  return selos.some((selo) => selo.id === id);
}

/** Qual selo de disciplina apareceu, se algum. */
function seloDeCartao(selos: { id: string }[]) {
  return selos.find((selo) => selo.id.startsWith('discipline-'))?.id ?? null;
}

export const selosDeCartaoTestCases: TestCase[] = [
  {
    name: 'as faixas de cartao amarelo sobem em 3, 5 e 7 jogos',
    run() {
      const faixas = [
        { jogosComCartao: 3, esperado: 'discipline-cartao-3' },
        { jogosComCartao: 5, esperado: 'discipline-cartao-5' },
        { jogosComCartao: 7, esperado: 'discipline-cartao-7' },
      ];

      for (const faixa of faixas) {
        const partidas = criarPartidas(faixa.jogosComCartao + 2);
        const primeiroComCartao = partidas.length - faixa.jogosComCartao;

        const selos = selosDe({
          partidas,
          stats: statsCom(partidas, (i) => (i >= primeiroComCartao ? { amarelos: 1 } : {})),
        });

        assert.equal(
          seloDeCartao(selos),
          faixa.esperado,
          `${faixa.jogosComCartao} jogos com cartao`,
        );
      }
    },
  },
  {
    name: 'as faixas de jogo limpo sobem em 3, 5 e 10 jogos',
    run() {
      const faixas = [
        { jogosLimpos: 3, esperado: 'discipline-limpo-3' },
        { jogosLimpos: 5, esperado: 'discipline-limpo-5' },
        { jogosLimpos: 10, esperado: 'discipline-limpo-10' },
      ];

      for (const faixa of faixas) {
        const partidas = criarPartidas(faixa.jogosLimpos);
        const selos = selosDe({ partidas, stats: statsCom(partidas, () => ({})) });

        assert.equal(seloDeCartao(selos), faixa.esperado, `${faixa.jogosLimpos} jogos limpos`);
      }
    },
  },
  {
    name: 'vermelho tem faixa propria e vence a de amarelo',
    run() {
      const partidas = criarPartidas(4);

      const umVermelho = selosDe({
        partidas,
        stats: statsCom(partidas, (i) => (i === partidas.length - 1 ? { vermelhos: 1 } : {})),
      });
      assert.equal(seloDeCartao(umVermelho), 'discipline-vermelho-1');

      const doisSeguidos = selosDe({
        partidas,
        stats: statsCom(partidas, (i) => (i >= partidas.length - 2 ? { vermelhos: 1 } : {})),
      });
      assert.equal(seloDeCartao(doisSeguidos), 'discipline-vermelho-2');

      // Sete amarelos seguidos e grave, mas expulsao e mais: o vermelho no
      // ultimo jogo tem que aparecer por cima.
      const amarelosEUmVermelho = selosDe({
        partidas: criarPartidas(8),
        stats: statsCom(criarPartidas(8), (i) =>
          i === 7 ? { amarelos: 1, vermelhos: 1 } : { amarelos: 1 },
        ),
      });
      assert.equal(seloDeCartao(amarelosEUmVermelho), 'discipline-vermelho-1');
    },
  },
  {
    name: 'cartao espalhado nao vira sequencia',
    run() {
      // Tres amarelos em seis jogos, alternados: nao e sequencia, e azar.
      const partidas = criarPartidas(6);
      const selos = selosDe({
        partidas,
        stats: statsCom(partidas, (i) => (i % 2 === 0 ? { amarelos: 1 } : {})),
      });

      assert.equal(seloDeCartao(selos), null);
    },
  },
  {
    name: 'a cor separa amarelo de vermelho',
    run() {
      // Sete amarelos e a faixa mais grave da cor amarela — mas continua
      // amarela. Pintar de vermelho faria parecer expulsao.
      const partidas = criarPartidas(8);
      const seteAmarelos = selosDe({
        partidas,
        stats: statsCom(partidas, (i) => (i >= 1 ? { amarelos: 1 } : {})),
      }).find((selo) => selo.id === 'discipline-cartao-7');

      assert.equal(seteAmarelos?.tone, 'yellow');

      const vermelho = selosDe({
        partidas,
        stats: statsCom(partidas, (i) => (i === 7 ? { vermelhos: 1 } : {})),
      }).find((selo) => selo.id === 'discipline-vermelho-1');

      assert.equal(vermelho?.tone, 'danger');
    },
  },
  {
    name: 'a sequencia e dos MEUS jogos, nao das rodadas do time',
    run() {
      // O caso descrito pelo time: joguei ha um mes, faltei em dois, voltei e
      // joguei mais dois. Sao tres jogos meus, e levei cartao nos tres — o
      // aviso tem que aparecer. As duas faltas no meio nao interrompem nada,
      // porque quem nao entrou em campo nao teve como levar cartao.
      const partidas = criarPartidas(5);
      const selos = selosDe({
        partidas,
        stats: statsCom(partidas, (i) => {
          if (i === 1 || i === 2) return { jogou: false };
          return { amarelos: 1 };
        }),
      });

      assert.equal(temSelo(selos, 'discipline-cartao-3'), true);
    },
  },
  {
    name: 'quem nao joga nao ganha selo de jogo limpo',
    run() {
      // Doze jogos, todos como ausente. Sem o filtro, faltar o campeonato
      // inteiro viraria selo de disciplina.
      const partidas = criarPartidas(12);
      const selos = selosDe({
        partidas,
        stats: statsCom(partidas, () => ({ jogou: false })),
      });

      assert.equal(temSelo(selos, 'discipline-limpo-5'), false);
    },
  },
  {
    name: 'cinco jogos meus sem cartao rendem o selo, mesmo intercalados',
    run() {
      // O outro caso descrito: cinco jogos espalhados no calendario, sem
      // cartao em nenhum. Contar rodadas do time em vez dos meus jogos negaria
      // o selo a quem joga uma semana sim, outra nao.
      const partidas = criarPartidas(11);
      const selos = selosDe({
        partidas,
        // Joga um, falta um, do começo ao fim: 6 jogos meus, todos limpos.
        stats: statsCom(partidas, (i) => (i % 2 === 1 ? { jogou: false } : {})),
      });

      assert.equal(temSelo(selos, 'discipline-limpo-5'), true);
    },
  },
  {
    name: 'quatro jogos limpos ainda nao rendem o selo',
    run() {
      // O corte e em cinco: sem um piso, dois jogos sem cartao virariam
      // "disciplina", que e amostra pequena demais para significar algo.
      const partidas = criarPartidas(4);
      const selos = selosDe({ partidas, stats: statsCom(partidas, () => ({})) });

      assert.equal(temSelo(selos, 'discipline-limpo-5'), false);
    },
  },
  {
    name: 'a descricao mostra jogos e cartao por icone',
    run() {
      // O rotulo e piada; quem informa e a descricao, em icone: "5 ⚽ sem 🟨".
      // Sem numero, "Comprou o juiz?" nao diz nada sobre o que aconteceu.
      const partidas = criarPartidas(6);

      const limpo = selosDe({ partidas, stats: statsCom(partidas, () => ({})) }).find(
        (item) => item.id === 'discipline-limpo-5',
      );

      assert.match(limpo?.description ?? '', /^6 ⚽ sem 🟨$/);

      const comCartao = selosDe({
        partidas,
        stats: statsCom(partidas, (i) => (i >= 3 ? { amarelos: 1 } : {})),
      }).find((item) => item.id === 'discipline-cartao-3');

      assert.match(comCartao?.description ?? '', /^3 ⚽ 🟨$/);

      const vermelho = selosDe({
        partidas,
        stats: statsCom(partidas, (i) => (i === 5 ? { vermelhos: 1 } : {})),
      }).find((item) => item.id === 'discipline-vermelho-1');

      assert.match(vermelho?.description ?? '', /^1 ⚽ 🟥$/);
    },
  },
  {
    name: 'cartao nao rouba o holofote de quem esta fazendo gol',
    run() {
      // Prioridade importa: um amarelo nao pode apagar a artilharia. O selo de
      // cartao existe para render resenha, nao para definir o jogador.
      const partidas = criarPartidas(6);
      const stats = statsCom(partidas, (i) => (i >= 3 ? { amarelos: 1 } : {})).map((stat) => ({
        ...stat,
        goals: 1,
      }));

      const selos = buildPlayerAchievements({
        player: criarJogador(),
        matches: partidas,
        attendance: presencaEm(partidas),
        matchStats: stats,
      });

      assert.equal(temSelo(selos, 'discipline-cartao-3'), true);
      assert.equal(
        selos[0]?.id,
        'goal-run-hot',
        'a artilharia precisa vir antes do cartao na ordem',
      );
    },
  },
  {
    name: 'menos de tres jogos meus nao rende selo nenhum',
    run() {
      // Dois jogos sem cartao nao e disciplina, e amostra pequena. O piso de
      // tres evita que todo mundo do time ganhe selo na primeira rodada em que
      // alguem lancar cartao.
      const partidas = criarPartidas(2);
      const selos = selosDe({ partidas, stats: statsCom(partidas, () => ({})) });

      assert.equal(seloDeCartao(selos), null);
    },
  },
];
