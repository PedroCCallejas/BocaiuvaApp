import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';

const workspace = process.cwd();
const directory = path.resolve(workspace, process.argv[2] ?? 'dist');
if (!directory.startsWith(workspace + path.sep)) throw new Error('A prévia deve usar uma pasta dentro do projeto.');
const root = await fs.realpath(directory);
const port = Number(process.argv[3] ?? 9137);
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.xml': 'application/xml', '.txt': 'text/plain' };

http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
    const requested = path.resolve(root, '.' + pathname);
    if (requested !== root && !requested.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    let target;
    for (const candidate of [requested, requested + '.html', path.join(requested, 'index.html')]) {
      try {
        const resolved = await fs.realpath(candidate);
        if (!resolved.startsWith(root + path.sep)) continue;
        if ((await fs.stat(resolved)).isFile()) { target = resolved; break; }
      } catch { /* Try the next static export path. */ }
    }
    if (!target) { res.writeHead(404).end('Página não encontrada.'); return; }
    res.writeHead(200, { 'Content-Type': mime[path.extname(target)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(await fs.readFile(target));
  } catch { res.writeHead(400).end('Requisição inválida.'); }
}).listen(port, '127.0.0.1', () => console.log(`Prévia local: http://127.0.0.1:${port} (${path.basename(root)})`));
