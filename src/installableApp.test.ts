import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { createServer } from 'vite';

const read = (path: string) => readFileSync(resolve(path), 'utf8');

it('ships a Portuguese fullscreen manifest and usable PNG icons', () => {
  const manifest = JSON.parse(read('public/manifest.webmanifest'));
  expect(manifest).toMatchObject({
    name: 'Laboratório de Teoria Musical',
    short_name: 'Teoria Musical',
    display: 'fullscreen',
    start_url: '/',
    theme_color: '#0f1219',
  });
  expect(manifest.icons.map((icon: { sizes: string }) => icon.sizes)).toEqual([
    '192x192',
    '512x512',
  ]);
  for (const icon of manifest.icons) {
    const png = readFileSync(resolve('public', icon.src.slice(1)));
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    expect(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`).toBe(icon.sizes);
  }
});

it('links a manifest that the running app serves as JSON', async () => {
  const href = read('index.html').match(/rel="manifest" href="([^"]+)"/)?.[1];
  expect(href).toBe('/manifest.webmanifest');
  const server = await createServer({
    configFile: false,
    publicDir: resolve('public'),
    appType: 'custom',
    server: { host: '127.0.0.1', port: 0, watch: null, ws: false },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  try {
    await server.listen();
    const address = server.httpServer!.address() as { port: number };
    const response = await fetch(`http://127.0.0.1:${address.port}${href}`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('manifest+json');
    expect(await response.json()).toMatchObject({ display: 'fullscreen' });
  } finally {
    await server.close();
  }
});

it('provides Apple home-screen metadata and a 180px PNG icon', () => {
  const html = read('index.html');
  expect(html).toContain('name="apple-mobile-web-app-capable" content="yes"');
  expect(html).toContain(
    'name="apple-mobile-web-app-title" content="Teoria Musical"',
  );
  expect(html).toContain(
    'name="apple-mobile-web-app-status-bar-style" content="black-translucent"',
  );
  expect(html).toContain(
    'rel="apple-touch-icon" sizes="180x180" href="/icons/app-180.png"',
  );
  const png = readFileSync(resolve('public/icons/app-180.png'));
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([180, 180]);
});

it('opts into the full viewport and protects shell and fixed navigation edges', () => {
  expect(read('index.html')).toContain('viewport-fit=cover');
  const css = read('src/components/layout/appShell.css');
  for (const edge of ['top', 'bottom', 'left', 'right']) {
    expect(css).toContain(`env(safe-area-inset-${edge}, 0px)`);
  }
  expect(read('src/App.tsx')).toContain('app-shell');
  expect(read('src/components/layout/BottomNav.tsx')).toContain(
    'app-bottom-nav',
  );
  expect(css).toContain('calc(5rem + env(safe-area-inset-bottom, 0px))');
});

it('uses dynamic viewport height for the body and app shell', () => {
  const css = read('src/components/layout/appShell.css');
  expect(css).toMatch(/body,\s*\.app-shell\s*\{[^}]*min-height: 100dvh/);
  expect(read('src/App.tsx')).not.toContain('min-h-screen');
});

it('keeps theme aliases and shared section wrappers in the app shell', () => {
  const app = read('src/App.tsx');
  expect(app).toContain('app-shell bg-bg-primary text-text-primary');
  expect(app).toContain("import Frame from '@/components/shared/Frame'");
  expect(app).toContain('<Frame');
  expect(app).toContain("import '@/components/layout/appShell.css'");
  const css = read('src/components/layout/appShell.css');
  expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
});

it('requests persistence at startup without coupling startup to the database', () => {
  const main = read('src/main.tsx');
  expect(main).toContain('void requestPersistentStorage();');
  expect(main.indexOf('void requestPersistentStorage();')).toBeLessThan(
    main.indexOf('createRoot(document'),
  );
  expect(read('src/services/persistentStorage.ts')).not.toMatch(/\bimport\b/);
});
