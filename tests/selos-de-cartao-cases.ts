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

export const selosDeCartaoTestCases: TestCase[] = [
  {
    name: 'vermelho rende selo, e o segundo muda o texto',
    run() {
      const partidas = criarPartidas(4);

      const comUm = selosDe({
        partidas,
        stats: statsCom(partidas, (i) => (i === 0 ? { vermelhos: 1 } : {})),
      });
      assert.equal(temSelo(comUm, 'discipline-expulso'), true);

      // Dois vermelhos nao e "mais do mesmo": vira outro personagem.
      const comDois = selosDe({
        partidas,
        stats: statsCom(partidas, (i) => (i <= 1 ? { vermelhos: 1 } : {})),
      });
      assert.equal(temSelo(comDois, 'discipline-terror'), true);
      assert.equal(temSelo(comDois, 'discipline-expulso'), false);
    },
  },
  {
    name: 'amarelo em jogos seguidos rende selo; espalhado nao',
    run() {
      const partidas = criarPartidas(6);

      const seguidos = selosDe({
        partidas,
        stats: statsCom(partidas, (i) => (i >= 3 ? { amarelos: 1 } : {})),
      });
      assert.equal(temSelo(seguidos, 'discipline-nervoso'), true);

      // Tres amarelos em seis jogos, alternados: nao e sequencia, e azar.
      const alternados = selosDe({
        partidas,
        stats: statsCom(partidas, (i) => (i % 2 === 0 ? { amarelos: 1 } : {})),
      });
      assert.equal(temSelo(alternados, 'discipline-nervoso'), false);
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

      assert.equal(temSelo(selos, 'discipline-nervoso'), true);
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

      assert.equal(temSelo(selos, 'discipline-santo'), false);
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

      assert.equal(temSelo(selos, 'discipline-santo'), true);
    },
  },
  {
    name: 'quatro jogos limpos ainda nao rendem o selo',
    run() {
      // O corte e em cinco: sem um piso, dois jogos sem cartao virariam
      // "disciplina", que e amostra pequena demais para significar algo.
      const partidas = criarPartidas(4);
      const selos = selosDe({ partidas, stats: statsCom(partidas, () => ({})) });

      assert.equal(temSelo(selos, 'discipline-santo'), false);
    },
  },
  {
    name: 'o texto dos selos deixa claro que e sobre cartao',
    run() {
      // "Nunca nem viu" nao dizia do que se tratava. Num app cheio de selo de
      // gol e presenca, o de cartao precisa se identificar sozinho.
      const partidas = criarPartidas(6);
      const limpo = selosDe({ partidas, stats: statsCom(partidas, () => ({})) });
      const selo = limpo.find((item) => item.id === 'discipline-santo');

      assert.match(`${selo?.label} ${selo?.description}`, /cart(ã|a)o/i);

      const nervoso = selosDe({
        partidas,
        stats: statsCom(partidas, (i) => (i >= 3 ? { amarelos: 1 } : {})),
      }).find((item) => item.id === 'discipline-nervoso');

      // E "seus últimos N jogos", nao "N jogos seguidos": a sequencia e da
      // pessoa, e o texto nao pode sugerir rodadas consecutivas do time.
      assert.match(nervoso?.description ?? '', /seus últimos/);
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

      assert.equal(temSelo(selos, 'discipline-nervoso'), true);
      assert.equal(
        selos[0]?.id,
        'goal-run-hot',
        'a artilharia precisa vir antes do cartao na ordem',
      );
    },
  },
  {
    name: 'sem cartao nenhum, o selo de disciplina nao aparece do nada',
    run() {
      // O time inteiro tem cartao zerado hoje: nenhum selo novo pode surgir
      // sozinho antes de alguem lancar o primeiro.
      const partidas = criarPartidas(3);
      const selos = selosDe({ partidas, stats: statsCom(partidas, () => ({})) });

      assert.equal(
        selos.some((selo) => selo.id.startsWith('discipline-')),
        false,
      );
    },
  },
];
