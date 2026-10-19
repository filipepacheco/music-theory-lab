import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { preview } from 'vite';

const executable = process.env.OFFLINE_BROWSER;
assert(executable, 'Set OFFLINE_BROWSER to a local Chrome or Edge executable');
assert(globalThis.WebSocket, 'Node 20 needs --experimental-websocket');
const bypassWorker = process.argv.includes('--without-worker');
const profile = await mkdtemp(resolve('.offline-browser-'));
let server;
let browser;
let socket;
let diagnose = async () => {};

async function until(read, description, timeout = 30_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const result = await read();
    if (result) return result;
    await delay(100);
  }
  throw new Error(`Timed out: ${description}`);
}

try {
  server = await preview({
    configFile: false,
    preview: { host: '127.0.0.1', port: 0, strictPort: true, proxy: {} },
  });
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = spawn(
    executable,
    [
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--disable-extensions',
      '--disable-sync',
      'about:blank',
    ],
    { windowsHide: true, stdio: 'ignore' },
  );
  let launchError;
  browser.on('error', (error) => (launchError = error));
  const endpoint = await until(async () => {
    if (launchError) throw launchError;
    if (browser.exitCode !== null) throw new Error('Browser exited at launch');
    try {
      const [port, path] = (
        await readFile(resolve(profile, 'DevToolsActivePort'), 'utf8')
      )
        .trim()
        .split(/\r?\n/);
      return `ws://127.0.0.1:${port}${path}`;
    } catch {
      return false;
    }
  }, 'browser debugging endpoint');
  socket = new WebSocket(endpoint);
  await once(socket, 'open');
  let sequence = 0;
  const pending = new Map();
  const responses = [];
  const failures = [];
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) {
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      clearTimeout(request.timer);
      if (message.error) request.reject(new Error(message.error.message));
      else request.resolve(message.result);
    } else if (message.method === 'Network.responseReceived') {
      responses.push(message.params.response);
    } else if (message.method === 'Network.loadingFailed') {
      failures.push(message.params);
    } else if (message.method === 'Runtime.exceptionThrown') {
      failures.push(message.params.exceptionDetails);
    }
  });
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Timed out: ${method}`));
      }, 120_000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params, sessionId }));
    });
  const { targetId } = await send('Target.createTarget', {
    url: 'about:blank',
  });
  const { sessionId } = await send('Target.attachToTarget', {
    targetId,
    flatten: true,
  });
  const page = (method, params) => send(method, params, sessionId);
  const evaluate = async (expression) => {
    const result = await page('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    assert(!result.exceptionDetails, result.exceptionDetails?.text);
    return result.result.value;
  };
  diagnose = async () => {
    console.error(
      JSON.stringify(
        {
          failures,
          responses: responses.map(({ url, status, fromServiceWorker }) => ({
            url,
            status,
            fromServiceWorker,
          })),
          document: await evaluate(`(async () => ({
        title: document.title,
        text: document.body?.innerText.slice(0, 500),
        keys: document.querySelectorAll('button[aria-label$="(tecla branca)"]').length,
        audio: window.offlineAudio && {
          decoded: window.offlineAudio.decoded,
          sampleStarts: window.offlineAudio.sampleStarts,
          peak: window.offlineAudio.peak,
        },
        assets: await Promise.all([...document.querySelectorAll('script[src],link[rel="stylesheet"]')].map(async node => {
          const url = node.src || node.href;
          const response = await caches.match(url, { ignoreVary: true });
          return { url, cached: !!(await caches.match(url)),
            headers: response && Object.fromEntries(response.headers),
            type: response?.type };
        })),
      }))()`),
        },
        null,
        2,
      ),
    );
  };
  await page('Page.enable');
  await page('Runtime.enable');
  await page('Network.enable');
  await page('Network.setCacheDisabled', { cacheDisabled: true });
  await page('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await page('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      window.offlineAudio = { analysers: [], decoded: 0, sampleStarts: 0 };
      const connect = AudioNode.prototype.connect;
      AudioNode.prototype.connect = function (destination, ...args) {
        const result = connect.call(this, destination, ...args);
        if (destination instanceof AudioDestinationNode && this.context instanceof AudioContext) {
          const analyser = this.context.createAnalyser();
          connect.call(this, analyser);
          window.offlineAudio.analysers.push(analyser);
        }
        return result;
      };
      const decode = BaseAudioContext.prototype.decodeAudioData;
      BaseAudioContext.prototype.decodeAudioData = function (...args) {
        const result = decode.apply(this, args);
        result.then(() => window.offlineAudio.decoded++, () => {});
        return result;
      };
      const start = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (...args) {
        if (this.buffer?.duration > 0.1) window.offlineAudio.sampleStarts++;
        return start.apply(this, args);
      };
    `,
  });
  await page('Page.navigate', { url: origin });
  await until(
    () => evaluate('!!navigator.serviceWorker.controller'),
    'first online visit installs and activates the worker',
    120_000,
  );
  const installed = await evaluate(`(async () => {
    const names = await caches.keys();
    const name = names.find(name => name.startsWith('music-theory-lab-offline-'));
    const urls = (await (await caches.open(name)).keys()).map(r => r.url);
    return { name, urls };
  })()`);
  assert(installed.urls.some((url) => url.endsWith('/index.html')));
  assert(installed.urls.some((url) => url.endsWith('/drum-samples/kick.flac')));
  assert(
    installed.urls.some((url) =>
      url.endsWith('/audio/growlybass/c3_f_rr1.mp3'),
    ),
  );
  assert(installed.urls.some((url) => url.endsWith('/salamander/C4.mp3')));
  assert(
    !installed.urls.some((url) => new URL(url).pathname.startsWith('/api/')),
  );
  assert(
    !installed.urls.some((url) =>
      new URL(url).pathname.startsWith('/library/'),
    ),
  );
  console.log(`Installed ${installed.urls.length} files in ${installed.name}`);

  await page('Network.clearBrowserCache');
  if (bypassWorker) {
    await page('Network.setBypassServiceWorker', { bypass: true });
  }
  const offline = {
    offline: true,
    latency: 0,
    downloadThroughput: 0,
    uploadThroughput: 0,
  };
  const { targetInfos } = await send('Target.getTargets');
  for (const target of targetInfos.filter(
    (item) => item.type === 'service_worker',
  )) {
    const worker = await send('Target.attachToTarget', {
      targetId: target.targetId,
      flatten: true,
    });
    await send('Network.enable', {}, worker.sessionId);
    await send('Network.emulateNetworkConditions', offline, worker.sessionId);
  }
  await page('Network.emulateNetworkConditions', offline);
  const previous = await page('Page.getFrameTree');
  responses.length = 0;
  await page('Page.reload');
  await until(async () => {
    const current = await page('Page.getFrameTree');
    return (
      current.frameTree.frame.loaderId !== previous.frameTree.frame.loaderId
    );
  }, 'offline navigation creates a new document');
  console.log(
    'Offline navigation:',
    JSON.stringify(
      responses
        .map((r) => ({
          path: new URL(r.url).pathname,
          status: r.status,
          fromServiceWorker: r.fromServiceWorker,
        }))
        .filter((r) => r.path === '/'),
    ),
  );
  await until(
    () =>
      evaluate(
        `document.querySelectorAll('button[aria-label$="(tecla branca)"]').length >= 8`,
      ),
    'offline reload renders the piano',
    20_000,
  );
  assert(responses.some((r) => r.url === `${origin}/` && r.fromServiceWorker));
  assert.equal(await evaluate('navigator.onLine'), false);
  assert.equal(
    await evaluate(`fetch('/offline-network-probe').then(
    () => false, () => true)`),
    true,
    'uncached network requests must fail',
  );
  await until(
    () => evaluate('window.offlineAudio.decoded >= 156'),
    'samplers decode after offline reload',
  );
  const key = await evaluate(`(() => {
    const key = document.querySelectorAll('button[aria-label$="(tecla branca)"]')[7];
    key.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
    const r = key.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.bottom - 15 };
  })()`);
  await evaluate(`window.offlineAudio.sampleStarts = 0;
    window.offlineAudio.peak = 0;
    window.offlineAudio.timer = setInterval(() => {
      for (const analyser of window.offlineAudio.analysers) {
        if (analyser.context.state !== 'running') continue;
        const data = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(data);
        for (const value of data) {
          window.offlineAudio.peak = Math.max(window.offlineAudio.peak, Math.abs(value));
        }
      }
    }, 10);`);
  await delay(200);
  assert.equal(
    await evaluate('window.offlineAudio.peak'),
    0,
    'audio output must be silent before the piano click',
  );
  await page('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    ...key,
    button: 'left',
    clickCount: 1,
  });
  await page('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    ...key,
    button: 'left',
    clickCount: 1,
  });
  const audio = await until(
    () =>
      evaluate(`(() => {
      const a = window.offlineAudio;
      return a.peak > 0.001 && a.sampleStarts > 0
        ? { peak: a.peak, sampleStarts: a.sampleStarts, decoded: a.decoded,
            states: [...new Set(a.analysers.map(node => node.context.state))] }
        : false;
    })()`),
    'trusted piano click produces sampled audio at the output',
  );
  const version = await send('Browser.getVersion');
  console.log(
    JSON.stringify(
      {
        browser: version.product,
        offline: true,
        navigationFromServiceWorker: true,
        uncachedRequestFailed: true,
        silentBeforeClick: true,
        audio,
      },
      null,
      2,
    ),
  );
  console.log('PASS: production app reloads and plays a sampled note offline');
  await send('Browser.close');
} catch (error) {
  await diagnose();
  throw error;
} finally {
  socket?.close();
  if (browser && browser.exitCode === null) {
    await Promise.race([once(browser, 'exit'), delay(2_000)]);
    if (browser.exitCode === null) {
      browser.kill();
      await once(browser, 'exit');
    }
  }
  if (server) await new Promise((done) => server.httpServer.close(done));
  assert.equal(dirname(profile), resolve('.'));
  assert(basename(profile).startsWith('.offline-browser-'));
  await rm(profile, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 200,
  });
}
