// Static server for the fixtures. Port 4173 serves tests/fixtures; port 4174 is the "second
// origin" whose stylesheet the cross-origin fixture links without CORS.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../fixtures/', import.meta.url));
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

function serve(dir, port) {
  const server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(
      /^([/\\])+/,
      '',
    );
    try {
      const body = await readFile(join(dir, path || 'classic.html'));
      res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end('not found');
    }
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, () => resolve(server));
  });
}

export async function startServers() {
  const main = await serve(root, 4173);
  const second = await serve(join(root, 'second-origin'), 4174);
  return () => Promise.all([main, second].map((s) => new Promise((r) => s.close(r))));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await startServers();
  console.log('fixtures on http://127.0.0.1:4173 and http://localhost:4174');
}
