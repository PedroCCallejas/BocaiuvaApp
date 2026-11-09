import assert from 'node:assert/strict';
import fs from 'node:fs';
import { sharePreparedImage, pngDataUrlToFile } from '@/lib/image-sharing';
const file = new File(['png'], 'arte.png', { type: 'image/png' });
export const imageSharingTestCases = [
  { name: 'compartilhar chama API imediatamente com arquivo pronto', async run() {
    let called = false;
    const pending = sharePreparedImage(file, 'Arte', { canShare: () => true, share: async (data) => {
      called = true; assert.equal(data.files?.[0], file); assert.equal(data.title, 'Arte');
    } });
    assert.equal(called, true); assert.equal(await pending, 'shared');
  }},
  { name: 'cancelamento nao aciona fallback ou nova tentativa', async run() {
    let calls = 0;
    assert.equal(await sharePreparedImage(file, 'Arte', { canShare: () => true, share: async () => {
      calls++; throw Object.assign(new Error('cancelado'), { name: 'AbortError' });
    } }), 'canceled');
    assert.equal(calls, 1);
  }},
  { name: 'navegador sem suporte nao envia arquivo', async run() {
    assert.equal(await sharePreparedImage(file, 'Arte', {}), 'unsupported');
    assert.equal(await sharePreparedImage(file, 'Arte', { canShare: () => false, share: async () => { assert.fail('nao deve enviar'); } }), 'unsupported');
  }},
  { name: 'permissao negada e capacidade com erro preservam escolha manual', async run() {
    assert.equal(await sharePreparedImage(file, 'Arte', { canShare: () => true, share: async () => { throw new Error('negado'); } }), 'failed');
    assert.equal(await sharePreparedImage(file, 'Arte', { canShare: () => { throw new Error('capacidade'); }, share: async () => {} }), 'failed');
  }},
  { name: 'conversao PNG preserva bytes e filename', async run() {
    const output = pngDataUrlToFile('data:image/png;base64,cG5n', 'jogo.png');
    assert.equal(output.name, 'jogo.png'); assert.equal(output.type, 'image/png'); assert.equal(await output.text(), 'png');
  }},
  { name: 'escalacao prepara antes de compartilhar e invalida imagem antiga', run() {
    const source = fs.readFileSync('src/app/(app)/lineup/[matchId].tsx', 'utf8');
    assert.match(source, /latestExportKey.current === captureKey/);
    assert.match(source, /preparedImage\?\.key === exportKey && canExportLineup/);
    assert.doesNotMatch(source, /navigator.share|webDownload/);
    const actions = fs.readFileSync('src/components/ui/ImageShareActions.tsx', 'utf8');
    assert.match(actions, /Compartilhar no Instagram/); assert.match(actions, /Compartilhar no WhatsApp/);
    assert.doesNotMatch(actions, /wa.me|window.open/);
  }},
];

