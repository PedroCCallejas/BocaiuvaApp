import assert from 'node:assert/strict';
import fs from 'node:fs';

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

const TABS_LAYOUT = 'src/app/(app)/(tabs)/_layout.tsx';
const SCREEN = 'src/components/ui/Screen.tsx';

export const mobileLayoutTestCases: TestCase[] = [
  {
    name: 'modo compacto da barra depende da largura, nunca da plataforma',
    run() {
      const layout = fs.readFileSync(TABS_LAYOUT, 'utf8');

      // O app roda no navegador do celular, onde Platform.OS ja e 'web'.
      // Amarrar o compacto a plataforma fazia a correcao nunca valer
      // justamente no aparelho onde o layout quebrava.
      assert.match(layout, /const isCompact = width < \d+;/);
      assert.doesNotMatch(layout, /const isCompact = !isWeb/);
    },
  },
  {
    name: 'altura da barra soma a area segura em qualquer plataforma',
    run() {
      const layout = fs.readFileSync(TABS_LAYOUT, 'utf8');

      // O navegador do celular tambem tem barra de gestos, e era ela que
      // "comia" os rotulos das abas.
      assert.match(layout, /const barHeight = baseHeight \+ bottomInset;/);
      assert.doesNotMatch(layout, /const barHeight = isWeb \? 72/);
    },
  },
  {
    name: 'rotulo da aba fica em uma linha so',
    run() {
      const layout = fs.readFileSync(TABS_LAYOUT, 'utf8');

      // Quebrando em duas linhas, a segunda ficava sob a borda inferior.
      assert.match(layout, /lineHeight: labelFontSize \+ 3/);
    },
  },
  {
    name: 'cabecalho desktop no web depende de breakpoint',
    run() {
      const screen = fs.readFileSync(SCREEN, 'utf8');

      assert.match(screen, /const isWideWeb = Platform\.OS === 'web' && width >= \d+;/);
      assert.match(screen, /\{isWideWeb && !hideWebHeader \? <WebScreenHeader \/> : null\}/);
      assert.doesNotMatch(
        screen,
        /\{Platform\.OS === 'web' && !hideWebHeader \? <WebScreenHeader \/> : null\}/,
      );
    },
  },
  {
    name: 'telas reservam folga para a barra de abas no fim do conteudo',
    run() {
      const screen = fs.readFileSync(SCREEN, 'utf8');

      // 32px era menor que a propria barra (~68px + area segura) e o ultimo
      // item da lista aparecia cortado no celular.
      assert.match(screen, /const TAB_BAR_CLEARANCE = \d+;/);
      assert.match(screen, /insets\.bottom \+ TAB_BAR_CLEARANCE/);
      assert.doesNotMatch(screen, /Platform\.OS === 'web' \? 32/);

      const clearance = Number(
        /const TAB_BAR_CLEARANCE = (\d+);/.exec(screen)?.[1] ?? '0',
      );
      const baseHeight = Number(
        /const baseHeight = isCompact \? \d+ : (\d+);/.exec(
          fs.readFileSync(TABS_LAYOUT, 'utf8'),
        )?.[1] ?? '0',
      );

      // A folga precisa cobrir a barra mais alta, senao volta a cortar.
      assert.equal(
        clearance >= baseHeight,
        true,
        `folga ${clearance} menor que a barra ${baseHeight}`,
      );
    },
  },
];
