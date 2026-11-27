import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, relative, extname, sep } from 'node:path';

const root = resolve('docs');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.webm': 'video/webm' };
let port = Number(process.argv[2]) || 4173;
const server = createServer(async (req, res) => {
  try {
    let path = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
    const rel = relative(root, path);
    if (rel === '..' || rel.startsWith('..' + sep)) { res.writeHead(403).end(); return; }
    if ((await stat(path)).isDirectory()) path = resolve(path, 'index.html');
    res.setHeader('Content-Type', mime[extname(path)] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.end(await readFile(path));
  } catch { res.writeHead(404).end(); }
});
server.on('error', error => {
  if (error.code === 'EADDRINUSE' && port < 4273) { server.listen(++port, '127.0.0.1'); return; }
  console.error(error); process.exit(1);
});
server.on('listening', () => console.log(`http://127.0.0.1:${port}/`));
server.listen(port, '127.0.0.1');
