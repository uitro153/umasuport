import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { cp, readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const privateAssets = process.env.VITE_PRIVATE_ASSET_VALIDATION === '1';
const assetCache = resolve('data/local/p85-assets/game-assets');
const privateOutput = resolve('.preview/p85-private-static');
async function assertNoPendingPublicImages(directory: string): Promise<void> {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await assertNoPendingPublicImages(path);
    else if (/\.(png|jpe?g|webp|avif)$/i.test(entry.name)) throw new Error('Pending game assets must remain outside public/dist. Use the isolated private asset validation build.');
  }
}

export default defineConfig({
  plugins: [react(), {
    name: 'private-game-asset-boundary',
    configResolved(config) {
      if (privateAssets && resolve(config.build.outDir) !== privateOutput) throw new Error('Private asset validation output must be .preview/p85-private-static; it cannot be a public dist.');
    },
    async buildStart() { await assertNoPendingPublicImages(resolve('public/game-assets')); },
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const path = request.url?.split('?')[0] ?? '';
        const match = /^\/game-assets\/(costumes|supports\/icons|supports\/art)\/(\d+)\.png$/.exec(path);
        if (!match) return next();
        if (request.method !== 'GET' && request.method !== 'HEAD') { response.statusCode = 405; response.end(); return; }
        try {
          const body = await readFile(resolve(assetCache, match[1]!, `${match[2]}.png`));
          response.setHeader('Content-Type', 'image/png');
          response.setHeader('Cache-Control', 'private, max-age=86400');
          response.setHeader('X-Asset-Usage', 'local-reference; public-redistribution-not-verified');
          response.end(request.method === 'HEAD' ? undefined : body);
        } catch { response.statusCode = 404; response.end(); }
      });
    },
    async closeBundle() {
      if (privateAssets) await cp(assetCache, resolve(privateOutput, 'game-assets'), { recursive: true });
      else await assertNoPendingPublicImages(resolve('dist/game-assets'));
    },
  }, {
    name: 'local-p1-reference',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const localFiles: Record<string, string> = {
          '/__local/p1-reference': 'p1-reference.json',
          '/__local/p3-skill-support': 'p3-skill-support.json',
          '/__local/p5-forecast': 'p5-forecast.json',
        };
        const file = localFiles[request.url?.split('?')[0] ?? ''];
        if (!file) return next();
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        if (request.method !== 'GET') { response.statusCode = 405; response.end('{"error":"GET only"}'); return; }
        try {
          const body = await readFile(resolve('data/local', file), 'utf8');
          response.end(body);
        } catch {
          response.statusCode = 404;
          response.end('{"error":"local reference not imported"}');
        }
      });
    },
  }],
  base: './',
  build: privateAssets ? { outDir: '.preview/p85-private-static' } : undefined,
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/golden/**/*.test.ts'],
  },
});
