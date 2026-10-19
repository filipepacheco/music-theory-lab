const { cacheName, urls } = __OFFLINE_MANIFEST__;
const precachedUrls = new Set(
  urls.map((url) => new URL(url, self.location.origin).href),
);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(cacheName).then((cache) =>
      cache.addAll(
        urls.map(
          (url) =>
            new Request(new URL(url, self.location.origin), {
              cache: 'reload',
              mode: 'cors',
              credentials: 'same-origin',
            }),
        ),
      ),
    ),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter(
            (name) =>
              name.startsWith('music-theory-lab-offline-') &&
              name !== cacheName,
          )
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

async function libraryFile(request) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request.url);
  if (request.method === 'HEAD') {
    return cached
      ? new Response(null, { status: 200, headers: cached.headers })
      : fetch(request);
  }
  const response = cached || (await downloadLibraryFile(request, cache));
  const range = request.headers.get('range');
  return range && response.status === 200
    ? rangeResponse(response, range)
    : response;
}

async function downloadLibraryFile(request, cache) {
  const headers = new Headers(request.headers);
  headers.delete('range');
  headers.delete('if-range');
  const fullRequest = new Request(request, { headers });
  const response = await fetch(fullRequest);
  if (
    response.status === 200 &&
    !response.redirected &&
    !response.headers.get('content-type')?.includes('text/html')
  ) {
    try {
      await cache.put(request.url, response.clone());
    } catch {
      // Storage pressure must not prevent online playback.
    }
  }
  return response;
}

async function rangeResponse(response, range) {
  const bytes = await response.arrayBuffer();
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  const start = match?.[1]
    ? Number(match[1])
    : Math.max(0, bytes.byteLength - Number(match?.[2]));
  const end =
    match?.[1] && match[2]
      ? Math.min(Number(match[2]), bytes.byteLength - 1)
      : bytes.byteLength - 1;
  const headers = new Headers(response.headers);
  headers.set('accept-ranges', 'bytes');
  if (
    !match ||
    (!match[1] && !match[2]) ||
    start > end ||
    start >= bytes.byteLength
  ) {
    headers.set('content-range', `bytes */${bytes.byteLength}`);
    headers.delete('content-length');
    return new Response(null, { status: 416, headers });
  }
  headers.set('content-range', `bytes ${start}-${end}/${bytes.byteLength}`);
  headers.set('content-length', String(end - start + 1));
  return new Response(bytes.slice(start, end + 1), { status: 206, headers });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (/^\/(api|intake)(\/|$)/i.test(url.pathname)) return;
  if (
    ['GET', 'HEAD'].includes(request.method) &&
    url.origin === self.location.origin &&
    url.pathname.startsWith('/library/')
  ) {
    event.respondWith(libraryFile(request));
    return;
  }
  if (request.method !== 'GET') return;
  const navigation =
    request.mode === 'navigate' && url.origin === self.location.origin;
  if (navigation || precachedUrls.has(url.href)) {
    event.respondWith(
      caches
        .open(cacheName)
        .then(
          async (cache) =>
            (await cache.match(navigation ? '/index.html' : request)) ||
            fetch(request),
        ),
    );
  }
});
