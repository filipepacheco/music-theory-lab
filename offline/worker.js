const { cacheName, urls, samples } = __OFFLINE_MANIFEST__;
// Library files and CDN samples do not change with a release, so they keep
// their own caches across updates. The kill switch deletes them by prefix.
const libraryCache = 'music-theory-lab-offline-library';
const sampleCache = 'music-theory-lab-offline-samples';
const keptCaches = new Set([cacheName, libraryCache, sampleCache]);
const absolute = (url) => new URL(url, self.location.origin).href;
const precachedUrls = new Set(urls.map(absolute));
const sampleUrls = new Set(samples.map(absolute));

const download = (url) =>
  new Request(absolute(url), {
    cache: 'reload',
    mode: 'cors',
    credentials: 'same-origin',
  });

async function installSamples() {
  const cache = await caches.open(sampleCache);
  const cached = await Promise.all(
    samples.map((url) => cache.match(absolute(url))),
  );
  await cache.addAll(
    samples.filter((_, index) => !cached[index]).map(download),
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(cacheName).then((cache) => cache.addAll(urls.map(download))),
      installSamples(),
    ]),
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
              !keptCaches.has(name),
          )
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

async function libraryFile(request) {
  const cache = await caches.open(libraryCache);
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
  // A Blob from Cache Storage is read from disk only for the slice it sends.
  const body = await response.blob();
  const size = body.size;
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  const start = match?.[1]
    ? Number(match[1])
    : Math.max(0, size - Number(match?.[2]));
  const end =
    match?.[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  const headers = new Headers(response.headers);
  headers.set('accept-ranges', 'bytes');
  if (!match || (!match[1] && !match[2]) || start > end || start >= size) {
    headers.set('content-range', `bytes */${size}`);
    headers.delete('content-length');
    return new Response(null, { status: 416, headers });
  }
  headers.set('content-range', `bytes ${start}-${end}/${size}`);
  headers.set('content-length', String(end - start + 1));
  return new Response(body.slice(start, end + 1), { status: 206, headers });
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
  const sample = sampleUrls.has(url.href);
  if (navigation || sample || precachedUrls.has(url.href)) {
    event.respondWith(
      caches.open(sample ? sampleCache : cacheName).then(
        async (cache) =>
          (await cache.match(navigation ? '/index.html' : request, {
            ignoreVary: true,
          })) || fetch(request),
      ),
    );
  }
});
