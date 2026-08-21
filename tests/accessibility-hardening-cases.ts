import assert from 'node:assert/strict';
import fs from 'node:fs';

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

export const accessibilityHardeningTestCases: TestCase[] = [
  {
    name: 'acessibilidade: input anuncia label e erro',
    run() {
      const source = fs.readFileSync('src/components/ui/AppInput.tsx', 'utf8');

      assert.match(source, /accessibilityLabel=\{accessibilityLabel \?\? label\}/);
      assert.match(source, /accessibilityLiveRegion="polite"/);
      assert.match(source, /accessibilityRole="alert"/);
      assert.match(source, /aria-invalid=\{Boolean\(error\)\}/);
    },
  },
  {
    name: 'acessibilidade: modal e identificado e isola a leitura',
    run() {
      const source = fs.readFileSync('src/components/ui/ConfirmModal.tsx', 'utf8');

      assert.match(source, /accessibilityViewIsModal/);
      assert.match(source, /accessibilityRole="alert"/);
      assert.match(source, /accessibilityRole="header"/);
    },
  },
  {
    name: 'acessibilidade: contador tem alvo de toque e rotulos contextuais',
    run() {
      const source = fs.readFileSync('src/components/ui/CounterField.tsx', 'utf8');

      assert.match(source, /accessibilityLabel=\{`Diminuir \$\{label\}`\}/);
      assert.match(source, /accessibilityLabel=\{`Aumentar \$\{label\}`\}/);
      assert.match(source, /width: 44/);
      assert.match(source, /height: 44/);
    },
  },
  {
    name: 'acessibilidade: paginas publicas possuem titulo principal semantico',
    run() {
      const source = fs.readFileSync(
        'src/components/public/PublicPageShell.tsx',
        'utf8',
      );

      assert.match(source, /accessibilityRole="header"[\s\S]{0,80}aria-level=\{1\}/);
      assert.match(source, /accessibilityRole="link"/);
    },
  },
];
