import assert from 'node:assert/strict';
import fs from 'node:fs';

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

const CARD = 'src/components/lineup/LineupShareCard.tsx';

export const lineupShareTestCases: TestCase[] = [
  {
    name: 'nenhum reserva fica de fora da imagem compartilhada',
    run() {
      const card = fs.readFileSync(CARD, 'utf8');

      // O card cortava em 6 e descartava o resto em silencio: quem estava no
      // banco simplesmente nao aparecia na escalacao que o time compartilha.
      assert.doesNotMatch(card, /MAX_BENCH_DISPLAY/);
      assert.doesNotMatch(card, /benchPlayerIds\s*\n?\s*\.slice\(/);

      const trecho = card.slice(card.indexOf('const benchPlayers ='));
      assert.doesNotMatch(trecho.slice(0, 300), /\.slice\(/);
    },
  },
  {
    name: 'o banco encolhe conforme cresce em vez de cortar',
    run() {
      const card = fs.readFileSync(CARD, 'utf8');
      const funcao = card.slice(
        card.indexOf('function resolverDensidadeDoBanco'),
        card.indexOf('export function LineupShareCard'),
      );

      assert.equal(funcao.length > 0, true, 'resolverDensidadeDoBanco nao encontrada');

      // Precisa haver faixa para muito reserva, senao o card estoura.
      assert.match(funcao, /total <= 6/);
      assert.match(funcao, /total <= 10/);
      assert.match(funcao, /total <= 16/);

      // Acima de 16 a foto sai: naquele tamanho ela ja nao identifica ninguem.
      const ultimaFaixa = funcao.slice(funcao.lastIndexOf('return {'));
      assert.match(ultimaFaixa, /foto: 0/);
    },
  },
  {
    name: 'tamanho da foto e da fonte vem da densidade, nao do estilo fixo',
    run() {
      const card = fs.readFileSync(CARD, 'utf8');
      const banco = card.slice(card.indexOf('{/* ── Banco ── */}'));

      // Se continuassem no StyleSheet estatico, a faixa nao teria efeito.
      assert.match(banco, /densidade\.foto/);
      assert.match(banco, /fontSize: densidade\.nome/);
      assert.match(banco, /fontSize: densidade\.numero/);
      assert.match(banco, /maxWidth: densidade\.larguraDoNome/);
    },
  },
  {
    name: 'a faixa de densidade cobre qualquer quantidade sem buraco',
    run() {
      const card = fs.readFileSync(CARD, 'utf8');
      const limites = [...card.matchAll(/total <= (\d+)/g)].map((item) => Number(item[1]));

      assert.equal(limites.length > 0, true, 'nenhuma faixa declarada');

      // Crescente e sem repetir: faixa fora de ordem deixaria um intervalo
      // inalcancavel e reserva voltaria a sumir.
      for (let indice = 1; indice < limites.length; indice += 1) {
        assert.equal(
          limites[indice] > limites[indice - 1],
          true,
          `faixa ${limites[indice]} nao vem depois de ${limites[indice - 1]}`,
        );
      }
    },
  },
];
