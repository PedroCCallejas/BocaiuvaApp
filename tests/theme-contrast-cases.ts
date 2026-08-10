import assert from 'node:assert/strict';

import { TEAM_COLOR_PRESETS } from '@/constants/options';
import {
  buildActionPalette,
  contrastRatio,
  darkenColor,
  isReadableSurface,
  relativeLuminance,
  resolveActionColor,
} from '@/lib/color-contrast';

const AA_NORMAL_TEXT = 4.5;

// Espelha os valores de `src/constants/theme.ts`. Aquele modulo importa React Native
// e nao pode ser carregado pelo runner de testes, entao as cores base ficam aqui.
const FALLBACK_ACTION = '#D7FF64';
const APP_BACKGROUND = '#070A0D';
const APP_SURFACE = '#111820';
const APP_TEXT = '#F7F9F8';
const APP_TEXT_MUTED = '#A2AFBA';
const APP_TEXT_SUBTLE = '#75828D';
const APP_SUCCESS = '#5DE38B';
const APP_WARNING = '#FFC857';
const APP_DANGER = '#FF717D';

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

export const themeContrastTestCases: TestCase[] = [
  {
    name: 'contraste: preto e branco atingem a razao maxima e cor igual atinge a minima',
    run() {
      assert.equal(Math.round(contrastRatio('#000000', '#FFFFFF')), 21);
      assert.equal(contrastRatio('#123456', '#123456'), 1);
    },
  },
  {
    name: 'contraste: hex de tres digitos e aceito e equivale a forma longa',
    run() {
      assert.equal(relativeLuminance('#fff'), relativeLuminance('#FFFFFF'));
      assert.equal(contrastRatio('#000', '#fff'), contrastRatio('#000000', '#FFFFFF'));
    },
  },
  {
    name: 'contraste: hex invalido nao quebra e cai para razao neutra',
    run() {
      assert.equal(relativeLuminance('nao-e-cor'), null);
      assert.equal(relativeLuminance('#12345'), null);
      assert.equal(contrastRatio('nao-e-cor', '#FFFFFF'), 1);
      assert.equal(isReadableSurface('nao-e-cor'), false);
    },
  },
  {
    name: 'escurecer cor mantem hex valido e reduz a luminancia',
    run() {
      const original = '#D7FF64';
      const darker = darkenColor(original);

      assert.match(darker, /^#[0-9a-f]{6}$/i);
      assert.equal(
        (relativeLuminance(darker) ?? 1) < (relativeLuminance(original) ?? 0),
        true,
      );
      assert.equal(darkenColor('nao-e-cor'), 'nao-e-cor');
    },
  },
  {
    name: 'cor de acao usa a primeira cor do time que e legivel e visivel sobre o fundo',
    run() {
      // Sem informar o fundo, preto puro passa: ele comporta texto claro legivel.
      assert.equal(resolveActionColor(['#000000', '#D7FF64'], '#FF00FF'), '#000000');

      // Informando o fundo escuro do app, o preto e descartado porque o botao sumiria.
      assert.equal(
        resolveActionColor(['#000000', '#D7FF64'], '#FF00FF', APP_BACKGROUND),
        '#D7FF64',
      );

      assert.equal(resolveActionColor([null, undefined, ''], '#FF00FF'), '#FF00FF');
    },
  },
  {
    name: 'todo preset de time gera botao primario legivel (AA) sem perder a identidade',
    run() {
      for (const preset of TEAM_COLOR_PRESETS) {
        const palette = buildActionPalette(
          [preset.accent, preset.secondary, preset.primary],
          FALLBACK_ACTION,
          APP_BACKGROUND,
        );

        const ratio = contrastRatio(palette.actionText, palette.action);

        assert.equal(
          ratio >= AA_NORMAL_TEXT,
          true,
          `preset ${preset.id}: contraste ${ratio.toFixed(2)} ficou abaixo de ${AA_NORMAL_TEXT}`,
        );

        // A cor de acao precisa sair da identidade do time, nao do fallback global.
        assert.equal(
          [preset.primary, preset.secondary, preset.accent].includes(palette.action),
          true,
          `preset ${preset.id}: cor de acao ${palette.action} nao veio das cores do time`,
        );

        // O botao tambem precisa se destacar do fundo da tela.
        const vsBackground = contrastRatio(palette.action, APP_BACKGROUND);
        assert.equal(
          vsBackground >= 3,
          true,
          `preset ${preset.id}: botao com contraste ${vsBackground.toFixed(2)} sobre o fundo`,
        );
      }
    },
  },
  {
    name: 'time sem cores definidas cai no tema padrao e continua legivel',
    run() {
      const palette = buildActionPalette([null, null, null], FALLBACK_ACTION);

      assert.equal(palette.action, FALLBACK_ACTION);
      assert.equal(contrastRatio(palette.actionText, palette.action) >= AA_NORMAL_TEXT, true);
      assert.equal(palette.focus, palette.action);
    },
  },
  {
    name: 'time com cores invalidas nao gera botao ilegivel',
    run() {
      const palette = buildActionPalette(['roxo', '', '#zzzzzz'], FALLBACK_ACTION);

      assert.equal(palette.action, FALLBACK_ACTION);
      assert.equal(contrastRatio(palette.actionText, palette.action) >= AA_NORMAL_TEXT, true);
    },
  },
  {
    name: 'texto padrao e texto secundario passam em AA sobre o fundo do app',
    run() {
      assert.equal(contrastRatio(APP_TEXT, APP_BACKGROUND) >= 7, true);
      assert.equal(contrastRatio(APP_TEXT_MUTED, APP_BACKGROUND) >= AA_NORMAL_TEXT, true);
      assert.equal(contrastRatio(APP_TEXT_SUBTLE, APP_BACKGROUND) >= AA_NORMAL_TEXT, true);
      assert.equal(contrastRatio(APP_TEXT_SUBTLE, APP_SURFACE) >= AA_NORMAL_TEXT, true);
    },
  },
  {
    name: 'cores de estado (sucesso, alerta, erro) passam em AA sobre o fundo do app',
    run() {
      const stateColors = {
        success: APP_SUCCESS,
        warning: APP_WARNING,
        danger: APP_DANGER,
      };

      for (const [name, color] of Object.entries(stateColors)) {
        const ratio = contrastRatio(color, APP_BACKGROUND);
        assert.equal(
          ratio >= AA_NORMAL_TEXT,
          true,
          `${name}: contraste ${ratio.toFixed(2)} ficou abaixo de ${AA_NORMAL_TEXT}`,
        );
      }
    },
  },
];
