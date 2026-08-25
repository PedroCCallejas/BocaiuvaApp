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
    name: 'falta no meio nao zera a sequencia de cartao',
    run() {
      // Quem levou cartao, faltou um jogo e voltou levando cartao continua
      // sendo o mesmo jogador nervoso. Zerar por causa da falta premiaria quem
      // some.
      const partidas = criarPartidas(5);
      const selos = selosDe({
        partidas,
        stats: statsCom(partidas, (i) => {
          if (i === 2) return { jogou: false };
          return i >= 1 ? { amarelos: 1 } : {};
        }),
      });

      assert.equal(temSelo(selos, 'discipline-nervoso'), true);
    },
  },
  {
    name: 'quem nao joga nao ganha selo de santo',
    run() {
      // Doze jogos, todos como ausente. Sem o filtro, isso viraria "nunca nem
      // viu" — selo de disciplina para quem nunca entrou em campo.
      const partidas = criarPartidas(12);
      const selos = selosDe({
        partidas,
        stats: statsCom(partidas, () => ({ jogou: false })),
      });

      assert.equal(temSelo(selos, 'discipline-santo'), false);
    },
  },
  {
    name: 'dez jogos limpos rendem o selo de santo',
    run() {
      const partidas = criarPartidas(12);
      const selos = selosDe({
        partidas,
        stats: statsCom(partidas, () => ({})),
      });

      assert.equal(temSelo(selos, 'discipline-santo'), true);
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
