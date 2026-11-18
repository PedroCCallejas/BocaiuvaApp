import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('dist');
let checked = 0;
async function verify(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) { await verify(file); continue; }
    if (!entry.name.endsWith('.html')) continue;
    const html = await readFile(file, 'utf8');
    const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map(match => match[1]);
    const bundles = scripts.filter(src => src.startsWith('/_expo/') && src.endsWith('.js'));
    assert.ok(bundles.length, `${path.relative(root, file)} sem bundle de hidratacao Expo`);
    for (const bundle of bundles) {
      assert.ok((await stat(path.join(root, bundle))).isFile(), `Bundle ausente: ${bundle}`);
    }
    checked++;
  }
}
await verify(root);
assert.ok(checked > 0, 'Exportacao sem paginas HTML');
console.log(`Hidratacao: ${checked} paginas com bundles Expo presentes.`);
