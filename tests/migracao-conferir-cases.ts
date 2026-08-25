import assert from 'node:assert/strict';

import {
  assinaturaDePartida,
  assinaturaDePresenca,
  compararResumos,
  descreverDivergencias,
  partidasParaAmostra,
  resumoVazio,
  type ResumoDaMigracao,
} from '@/lib/migracao/conferir';

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

function resumo(parcial: Partial<ResumoDaMigracao>): ResumoDaMigracao {
  return { ...resumoVazio(), ...parcial };
}

export const migracaoConferirTestCases: TestCase[] = [
  {
    name: 'resumos iguais nao acusam nada',
    run() {
      const igual = resumo({
        contagens: { matches: 71, attendance: 1659 },
        somas: { despesas_cents: 6000 },
        amostras: { 'partida m1': '2026-08-20 | finished | Panelinha | 3x2' },
      });

      assert.deepEqual(compararResumos(igual, igual), []);
      assert.equal(descreverDivergencias([]), '');
    },
  },
  {
    name: 'linha que nao chegou e acusada',
    run() {
      const divergencias = compararResumos(
        resumo({ contagens: { attendance: 1659 } }),
        resumo({ contagens: { attendance: 1658 } }),
      );

      assert.equal(divergencias.length, 1);
      assert.equal(divergencias[0].assunto, 'contagem: attendance');
      assert.equal(divergencias[0].noFirestore, '1659');
      assert.equal(divergencias[0].noPostgres, '1658');
    },
  },
  {
    name: 'contagem igual com soma diferente e o pior caso, e e pego',
    run() {
      // Parece certo e nao e: mesma quantidade de linhas, valor torto.
      const divergencias = compararResumos(
        resumo({ contagens: { expenses: 4 }, somas: { despesas_cents: 6000 } }),
        resumo({ contagens: { expenses: 4 }, somas: { despesas_cents: 600 } }),
      );

      assert.equal(divergencias.length, 1);
      assert.match(divergencias[0].assunto, /soma: despesas_cents/);
    },
  },
  {
    name: 'tabela que existe so de um lado tambem e divergencia',
    run() {
      // Iterar so por um dos mapas deixaria isso invisivel.
      const soNoFirestore = compararResumos(
        resumo({ contagens: { lineups: 5 } }),
        resumo({ contagens: {} }),
      );

      assert.equal(soNoFirestore.length, 1);
      assert.equal(soNoFirestore[0].noPostgres, '(ausente)');

      const soNoPostgres = compararResumos(
        resumo({ contagens: {} }),
        resumo({ contagens: { lineups: 5 } }),
      );

      assert.equal(soNoPostgres.length, 1);
      assert.equal(soNoPostgres[0].noFirestore, '(ausente)');
    },
  },
  {
    name: 'placar invertido nao passa pela amostra',
    run() {
      // Contagem e soma nao enxergariam: e a mesma partida, com os numeros
      // trocados de lado.
      const certo = assinaturaDePartida({
        id: 'm1',
        date: '2026-08-20',
        status: 'finished',
        opponentName: 'Panelinha',
        team: 3,
        opponent: 2,
      });

      const invertido = assinaturaDePartida({
        id: 'm1',
        date: '2026-08-20',
        status: 'finished',
        opponentName: 'Panelinha',
        team: 2,
        opponent: 3,
      });

      assert.notEqual(certo, invertido);
      assert.match(certo, /3x2/);
    },
  },
  {
    name: 'data deslocada por fuso muda a assinatura',
    run() {
      const original = assinaturaDePartida({
        id: 'm1',
        date: '2026-08-20',
        status: 'finished',
        opponentName: 'Panelinha',
        team: 1,
        opponent: 0,
      });

      const deslocada = assinaturaDePartida({
        id: 'm1',
        date: '2026-08-19',
        status: 'finished',
        opponentName: 'Panelinha',
        team: 1,
        opponent: 0,
      });

      assert.notEqual(original, deslocada);
    },
  },
  {
    name: 'partida sem placar nao vira 0x0',
    run() {
      // 0x0 e um resultado real; confundir com "ainda nao tem placar" faria a
      // comparacao aceitar dado faltando.
      const semPlacar = assinaturaDePartida({
        id: 'm1',
        date: '2026-08-27',
        status: 'scheduled',
        opponentName: 'A definir',
        team: null,
        opponent: null,
      });

      assert.match(semPlacar, /sem-placar/);
      assert.notEqual(
        semPlacar,
        assinaturaDePartida({
          id: 'm1',
          date: '2026-08-27',
          status: 'scheduled',
          opponentName: 'A definir',
          team: 0,
          opponent: 0,
        }),
      );
    },
  },
  {
    name: 'assinatura de presenca conta cada situacao',
    run() {
      const assinatura = assinaturaDePresenca([
        { status: 'confirmed' },
        { status: 'confirmed' },
        { status: 'absent' },
        { status: 'pending' },
        { status: 'inventado' },
      ]);

      assert.equal(assinatura, 'c2 a1 p1');
    },
  },
  {
    name: 'a amostra pega as partidas mais recentes',
    run() {
      // Sao as que o time olha e as que mudaram por ultimo — onde um erro de
      // migracao apareceria primeiro.
      const partidas = [
        { id: 'a', date: '2026-01-10' },
        { id: 'b', date: '2026-08-20' },
        { id: 'c', date: '2026-07-15' },
        { id: 'd', date: '2026-08-13' },
      ];

      assert.deepEqual(
        partidasParaAmostra(partidas, 2).map((item) => item.id),
        ['b', 'd'],
      );
    },
  },
  {
    name: 'empate de data usa o id para a ordem nao variar',
    run() {
      // Sem desempate estavel, a amostra mudaria entre execucoes e a
      // comparacao acusaria divergencia que nao existe.
      const partidas = [
        { id: 'z', date: '2026-08-20' },
        { id: 'a', date: '2026-08-20' },
      ];

      assert.deepEqual(
        partidasParaAmostra(partidas, 2).map((item) => item.id),
        ['a', 'z'],
      );
    },
  },
  {
    name: 'o relatorio mostra os dois lados da divergencia',
    run() {
      const texto = descreverDivergencias([
        { assunto: 'contagem: attendance', noFirestore: '1659', noPostgres: '1658' },
      ]);

      assert.match(texto, /attendance/);
      assert.match(texto, /Firestore: 1659/);
      assert.match(texto, /Postgres:  1658/);
    },
  },
];
