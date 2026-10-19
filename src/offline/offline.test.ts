import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it, vi } from 'vitest';
import { createOfflineWorker } from '../../build/offline';

const origin = 'https://music.test';
const absolute = (url: string) => new URL(url, origin).href;
const key = (request: Request | string) =>
  absolute(typeof request === 'string' ? request : request.url);

function browser(source: string) {
  const stores = new Map<string, Map<string, Response>>();
  const network = vi.fn(
    async (request: Request | string) =>
      new Response(key(request), {
        headers: { 'content-type': 'application/octet-stream' },
      }),
  );
  const caches = {
    async open(name: string) {
      if (!stores.has(name)) stores.set(name, new Map());
      const entries = stores.get(name)!;
      return {
        async addAll(requests: (Request | string)[]) {
          const responses = await Promise.all(requests.map(network));
          if (responses.some((response) => response.status !== 200))
            throw new Error('Install failed');
          requests.forEach((request, i) =>
            entries.set(key(request), responses[i].clone()),
          );
        },
        async match(request: Request | string) {
          return entries.get(key(request))?.clone();
        },
        async put(request: Request | string, response: Response) {
          if (response.status !== 200) throw new Error('Not a complete file');
          entries.set(key(request), response.clone());
        },
      };
    },
    async keys() {
      return [...stores.keys()];
    },
    async delete(name: string) {
      return stores.delete(name);
    },
  };
  type Event = {
    request?: Request;
    waitUntil: (promise: Promise<unknown>) => void;
    respondWith: (promise: Promise<Response>) => void;
  };
  const listeners = new Map<string, (event: Event) => void>();
  const unregister = vi.fn(async () => true);
  const claim = vi.fn(async () => {});
  const skipWaiting = vi.fn(async () => {});
  const indexedDB = new Proxy(
    {},
    {
      get() {
        throw new Error('The worker must not access IndexedDB');
      },
    },
  );
  runInNewContext(source, {
    caches,
    fetch: network,
    Request,
    Response,
    Headers,
    URL,
    indexedDB,
    self: {
      location: new URL('/sw.js', origin),
      addEventListener: (name: string, listener: (event: Event) => void) =>
        listeners.set(name, listener),
      clients: { claim },
      registration: { unregister },
      skipWaiting,
    },
  });
  async function dispatch(name: string, request?: Request) {
    const pending: Promise<unknown>[] = [];
    let response: Promise<Response> | undefined;
    listeners.get(name)?.({
      request,
      waitUntil: (promise) => {
        pending.push(promise);
      },
      respondWith: (promise) => {
        response = promise;
      },
    });
    const result = await response;
    await Promise.all(pending);
    return result;
  }
  return { caches, network, dispatch, unregister, claim, skipWaiting };
}

const shell = {
  'index.html': '<html>app</html>',
  'assets/app.js': 'app',
  'assets/lazy.js': 'lazy module',
  'assets/app.css': 'styles',
};
const worker = () => createOfflineWorker(shell, 'public');

it('installs the shell, lazy chunks, WASM, fonts, all samplers and drums', async () => {
  const app = browser(worker());
  await app.dispatch('install');
  const downloads = app.network.mock.calls.map(([request]) => key(request));
  expect(downloads).toEqual(
    expect.arrayContaining([
      absolute('/index.html'),
      absolute('/assets/app.js'),
      absolute('/assets/lazy.js'),
      absolute('/assets/app.css'),
      absolute('/sql-wasm.wasm'),
      absolute('/manifest.webmanifest'),
      'https://tonejs.github.io/audio/salamander/C4.mp3',
      'https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/electric_piano_1-mp3/C4.mp3',
      'https://tonejs.github.io/audio/drum-samples/acoustic-kit/kick.mp3',
      'https://tonejs.github.io/audio/drum-samples/acoustic-kit/snare.mp3',
      'https://tonejs.github.io/audio/drum-samples/acoustic-kit/hihat.mp3',
    ]),
  );
  expect(downloads.filter((url) => url.endsWith('.mp3'))).toHaveLength(199);
  expect(downloads.some((url) => url.includes('/fonts/'))).toBe(true);
});

it('downloads Library files only on first opening, then serves them offline', async () => {
  const app = browser(worker());
  await app.dispatch('install');
  expect(
    app.network.mock.calls.some(([request]) =>
      key(request).includes('/library/'),
    ),
  ).toBe(false);
  const request = new Request(
    absolute('/library/tracks/example/chord-analysis-result.json'),
  );
  const first = await app.dispatch('fetch', request);
  expect(await first?.text()).toBe(request.url);
  app.network.mockRejectedValue(new Error('Offline'));
  const second = await app.dispatch('fetch', request);
  expect(await second?.text()).toBe(request.url);
});

it('keeps a whole audio file from its first range request and supports offline HEAD probes and seeking', async () => {
  const app = browser(worker());
  const url = absolute('/library/tracks/example/source.mp3');
  app.network.mockImplementation(async (request) => {
    expect(
      typeof request === 'string' ? null : request.headers.get('range'),
    ).toBeNull();
    return new Response('0123456789', {
      headers: { 'content-type': 'audio/mpeg' },
    });
  });
  const first = await app.dispatch(
    'fetch',
    new Request(url, { headers: { Range: 'bytes=0-1' } }),
  );
  expect(first?.status).toBe(206);
  expect(first?.headers.get('content-range')).toBe('bytes 0-1/10');
  expect(await first?.text()).toBe('01');
  app.network.mockRejectedValue(new Error('Offline'));
  const head = await app.dispatch(
    'fetch',
    new Request(url, { method: 'HEAD' }),
  );
  expect(head?.status).toBe(200);
  expect(head?.headers.get('content-type')).toBe('audio/mpeg');
  expect(await head?.text()).toBe('');
  const seek = await app.dispatch(
    'fetch',
    new Request(url, { headers: { Range: 'bytes=6-' } }),
  );
  expect(await seek?.text()).toBe('6789');
  const suffix = await app.dispatch(
    'fetch',
    new Request(url, { headers: { Range: 'bytes=-3' } }),
  );
  expect(await suffix?.text()).toBe('789');
  const outside = await app.dispatch(
    'fetch',
    new Request(url, { headers: { Range: 'bytes=10-' } }),
  );
  expect(outside?.status).toBe(416);
  expect(outside?.headers.get('content-range')).toBe('bytes */10');
  expect(app.network).toHaveBeenCalledOnce();
});

it('excludes API routes even from install input and never accesses IndexedDB', async () => {
  const app = browser(
    createOfflineWorker({ ...shell, 'api/songs': 'private' }, 'public'),
  );
  await app.dispatch('install');
  await app.dispatch('activate');
  expect(
    app.network.mock.calls.some(([request]) => key(request).includes('/api/')),
  ).toBe(false);
  app.network.mockClear();
  for (const url of [
    '/api',
    '/api/songs?device_id=example',
    '/intake/jobs',
    'https://other.test/api/songs',
  ]) {
    const request = new Request(absolute(url));
    expect(await app.dispatch('fetch', request)).toBeUndefined();
  }
  expect(
    await app.dispatch(
      'fetch',
      new Request(absolute('/library/index.json'), {
        method: 'POST',
        body: 'private',
      }),
    ),
  ).toBeUndefined();
  expect(app.network).not.toHaveBeenCalled();
});

it('replaces only this app caches on activation and gives changed releases a new cache', async () => {
  const source = worker();
  expect(worker()).toBe(source);
  expect(
    createOfflineWorker({ ...shell, 'assets/app.js': 'new release' }, 'public'),
  ).not.toBe(source);
  const app = browser(source);
  await app.caches.open('music-theory-lab-offline-old');
  await app.caches.open('another-app');
  await app.dispatch('install');
  expect(await app.caches.keys()).toContain('music-theory-lab-offline-old');
  expect(app.skipWaiting).not.toHaveBeenCalled();
  await app.dispatch('activate');
  const names = await app.caches.keys();
  expect(names).not.toContain('music-theory-lab-offline-old');
  expect(names).toContain('another-app');
  expect(names).toHaveLength(2);
  expect(app.claim).toHaveBeenCalledOnce();
});

it('registers at startup only in production and tolerates unavailable or rejected registration', async () => {
  const { registerOfflineWorker } =
    await import('@/services/offlineRegistration');
  const register = vi.fn(async () => ({}));
  vi.stubGlobal('navigator', { serviceWorker: { register } });
  try {
    vi.stubEnv('PROD', false);
    await registerOfflineWorker();
    expect(register).not.toHaveBeenCalled();
    vi.stubEnv('PROD', true);
    await registerOfflineWorker();
    expect(register).toHaveBeenCalledExactlyOnceWith('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    });
    register.mockRejectedValue(new Error('Unavailable'));
    await expect(registerOfflineWorker()).resolves.toBeUndefined();
    vi.stubGlobal('navigator', {});
    await expect(registerOfflineWorker()).resolves.toBeUndefined();
    expect(readFileSync('src/main.tsx', 'utf8')).toContain(
      'void registerOfflineWorker();',
    );
  } finally {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  }
});

it('serves a reload, lazy modules, WASM and note samples with the network off after install', async () => {
  const app = browser(worker());
  await app.dispatch('install');
  await app.dispatch('activate');
  app.network.mockRejectedValue(new Error('Offline'));
  const navigation = new Request(absolute('/?module=scales'));
  Object.defineProperty(navigation, 'mode', { value: 'navigate' });
  expect(await (await app.dispatch('fetch', navigation))?.text()).toBe(
    absolute('/index.html'),
  );
  for (const url of [
    '/assets/lazy.js',
    '/sql-wasm.wasm',
    'https://tonejs.github.io/audio/salamander/C4.mp3',
  ]) {
    expect(
      await (await app.dispatch('fetch', new Request(absolute(url))))?.text(),
    ).toBe(absolute(url));
  }
  const apiNavigation = new Request(absolute('/api/songs'));
  Object.defineProperty(apiNavigation, 'mode', { value: 'navigate' });
  expect(await app.dispatch('fetch', apiNavigation)).toBeUndefined();
});

it('kill switch takes over, deletes only app caches, unregisters and leaves requests and IndexedDB alone', async () => {
  const app = browser(readFileSync('offline/kill-switch.js', 'utf8'));
  await app.caches.open('music-theory-lab-offline-old');
  await app.caches.open('music-theory-lab-offline-current');
  await app.caches.open('another-app');
  await app.dispatch('install');
  expect(app.skipWaiting).toHaveBeenCalledOnce();
  await app.dispatch('activate');
  expect(await app.caches.keys()).toEqual(['another-app']);
  expect(app.claim).toHaveBeenCalledOnce();
  expect(app.unregister).toHaveBeenCalledOnce();
  expect(
    await app.dispatch('fetch', new Request(absolute('/'))),
  ).toBeUndefined();
});

it('documents a rollback copy command that installs the reviewed kill switch at the registered URL', () => {
  const docs = readFileSync('docs/offline-cache.md', 'utf8');
  const command =
    /Copy-Item -LiteralPath '([^']+)' -Destination '([^']+)' -Force/.exec(docs);
  expect(command).not.toBeNull();
  expect(command?.[2]).toBe('dist/sw.js');
  expect(readFileSync(command![1], 'utf8')).toBe(
    readFileSync('offline/kill-switch.js', 'utf8'),
  );
  expect(docs).toContain('IndexedDB');
  expect(docs).toContain('unregister');
});

it('keeps the previous cache if a required install download fails', async () => {
  const app = browser(worker());
  await app.caches.open('music-theory-lab-offline-working');
  app.network.mockRejectedValue(new Error('Sample host unavailable'));
  await expect(app.dispatch('install')).rejects.toThrow(
    'Sample host unavailable',
  );
  expect(await app.caches.keys()).toContain('music-theory-lab-offline-working');
  expect(app.claim).not.toHaveBeenCalled();
  expect(app.skipWaiting).not.toHaveBeenCalled();
});

it('does not retain missing Library files or HTML rewrites as playable audio', async () => {
  const app = browser(worker());
  const request = new Request(absolute('/library/tracks/missing/source.mp3'));
  for (const response of [
    new Response('missing', { status: 404 }),
    new Response('<html>app</html>', {
      headers: { 'content-type': 'text/html' },
    }),
    new Response('partial', { status: 206 }),
  ]) {
    app.network.mockResolvedValueOnce(response);
    await app.dispatch('fetch', request);
  }
  app.network.mockRejectedValue(new Error('Offline'));
  await expect(app.dispatch('fetch', request)).rejects.toThrow('Offline');
  expect(app.network).toHaveBeenCalledTimes(4);
});
