import {createServer} from 'node:http';
import {readFile, stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {getFreePort, commonHosts} from './get-free-port.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(root, '..');
const distDir = path.join(projectRoot, 'dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

// Serve files out of dist/, defaulting to index.html. Path traversal is blocked
// by resolving against distDir and rejecting anything that escapes it.
export function createStaticServer(dir = distDir) {
  return createServer(async (req, res) => {
    try {
      const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
      let filePath = path.join(dir, urlPath === '/' ? 'index.html' : urlPath);
      if (!filePath.startsWith(dir)) {
        res.writeHead(403).end('Forbidden');
        return;
      }
      const info = await stat(filePath).catch(() => null);
      if (info?.isDirectory()) filePath = path.join(filePath, 'index.html');
      const body = await readFile(filePath);
      res.writeHead(200, {
        'Content-Type':
          MIME[path.extname(filePath)] ?? 'application/octet-stream',
      });
      res.end(body);
    } catch {
      res.writeHead(404, {'Content-Type': 'text/plain'}).end('Not found');
    }
  });
}

export async function serve(startPort = 8080) {
  const port = await getFreePort(startPort, commonHosts);
  const server = createStaticServer();
  await new Promise(resolve => server.listen(port, resolve));
  const url = `http://localhost:${port}/`;
  return {server, port, url};
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const {url} = await serve();
  console.log(`Serving dist/ at ${url}`);
}
