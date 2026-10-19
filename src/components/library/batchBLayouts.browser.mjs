import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

// With npm run dev: node --experimental-websocket src/components/library/batchBLayouts.browser.mjs
const base = process.env.LAYOUT_URL ?? 'http://localhost:5173';
const output = process.env.LAYOUT_OUTPUT ?? join(tmpdir(), 'batch-b-layouts');
const profile = await mkdtemp(join(tmpdir(), 'batch-b-chrome-'));
const browser = spawn(
  process.env.LAYOUT_BROWSER ??
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
  [
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--disable-background-networking',
    'about:blank',
  ],
  { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] },
);
let socket;
const measurements = [];
try {
  const endpoint = await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(Error('Chrome startup timeout')),
      15000,
    );
    browser.once('error', reject);
    browser.stderr.on('data', (chunk) => {
      const match = String(chunk).match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(match[1]);
      }
    });
  });
  const tabs = await fetch(
    `${endpoint.replace('ws:', 'http:').split('/devtools')[0]}/json`,
  ).then((r) => r.json());
  socket = new WebSocket(
    tabs.find((tab) => tab.type === 'page').webSocketDebuggerUrl,
  );
  await new Promise((resolve) =>
    socket.addEventListener('open', resolve, { once: true }),
  );
  let sequence = 0;
  const pending = new Map();
  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      const timeout = setTimeout(
        () => reject(Error(`CDP timeout: ${method}`)),
        15000,
      );
      pending.set(id, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) {
      const request = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) request.reject(Error(JSON.stringify(message.error)));
      else request.resolve(message.result);
    } else if (message.method === 'Runtime.exceptionThrown') {
      console.error(message.params.exceptionDetails.exception?.description);
    } else if (
      message.method === 'Log.entryAdded' &&
      message.params.entry.level === 'error'
    ) {
      console.error(message.params.entry.text);
    } else if (message.method === 'Fetch.requestPaused') {
      const { requestId, request } = message.params;
      const path = new URL(request.url).pathname;
      let body = [];
      if (path === '/intake/health')
        body = { ok: true, device: 'CPU', missing_checkpoints: [] };
      if (path === '/intake/jobs')
        body = {
          jobs: [
            {
              id: 'fixture',
              title: 'Música de teste',
              artist: 'Artista de teste',
              filename: 'teste.wav',
              status: 'succeeded',
              stages: [],
            },
          ],
        };
      if (path === '/library/index.json')
        body = {
          tracks: Array.from({ length: 4 }, (_, i) => ({
            source_sha256: `fixture-${i}`,
            title: `Música de teste ${i + 1}`,
            artist: 'Artista de teste',
            duration_seconds: 180,
            detected_key: { tonic_pc: 0, mode: 'major' },
            detected_tempo_bpm: 120,
          })),
        };
      void send('Fetch.fulfillRequest', {
        requestId,
        responseCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
        body: Buffer.from(JSON.stringify(body)).toString('base64'),
      }).catch((error) => {
        if (!error.message.includes('Invalid InterceptionId')) throw error;
      });
    }
  });
  async function evaluate(expression) {
    const result = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails)
      throw Error(
        result.exceptionDetails.exception?.description ??
          'Browser evaluation failed',
      );
    return result.result.value;
  }
  async function until(expression) {
    for (let i = 0; i < 200; i++) {
      if (await evaluate(expression)) return;
      await delay(100);
    }
    throw Error(
      `Timed out: ${expression}; ${await evaluate('location.href + document.documentElement.outerHTML.slice(0, 1000)')}`,
    );
  }
  async function viewport(width, orientation) {
    const height =
      orientation === 'portrait'
        ? Math.round(width * 1.4)
        : Math.round(width * 0.72);
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await send('Emulation.setTouchEmulationEnabled', {
      enabled: true,
      maxTouchPoints: 5,
    });
    await delay(300);
  }
  await mkdir(output, { recursive: true });
  await send('Runtime.enable');
  console.log('Browser runtime ready');
  await send('Log.enable');
  await send('Fetch.enable', {
    patterns: [
      { urlPattern: '*/api/*' },
      { urlPattern: '*/intake/*' },
      { urlPattern: '*/library/index.json' },
    ],
  });
  await viewport(1024, 'landscape');
  console.log('Viewport ready');
  await send('Page.navigate', { url: base });
  console.log('Page navigated');
  await until("!!document.querySelector('.app-workspace')");
  await evaluate(`(async () => {
    const { useAppStore } = await import('/src/store/useAppStore.ts');
    window.layoutStore = useAppStore;
    const s = useAppStore.getState();
    s.clearSong(); s.addSection('intro');
    for (let i = 0; i < 8; i++) s.addSongStep(0, { degree: i % 7, label: 'C', beats: 4, confidence: 'unsure' });
    useAppStore.setState({
      structureBars: Array.from({ length: 12 }, (_, index) => ({ id: 'bar-' + index, index, timeSignature: '4/4' })),
      structureSections: [
        { id: 'intro', name: 'Intro', color: '#dfb577', barIds: Array.from({ length: 8 }, (_, i) => 'bar-' + i), comment: 'Entrada suave; repetir a seção antes do refrão.' },
        { id: 'verse', name: 'Verso', color: '#7799bb', barIds: ['bar-8', 'bar-9', 'bar-10', 'bar-11'], comment: 'Entrada suave; repetir a seção antes do refrão.' },
      ], instrumentsPanelOpen: true,
    });
  })()`);

  await evaluate("layoutStore.getState().setActiveModule('transcription')");
  await until("!!document.querySelector('.transcription-module')");
  await evaluate(
    "[...document.querySelectorAll('button')].find(b => b.textContent.includes('Importar do Guitar Pro')).click()",
  );
  await delay(300);
  const preview = await evaluate(`(() => {
    const p = [...document.querySelectorAll('p')].find(p => p.textContent.includes('A prévia aparece') || p.textContent.includes('A previa aparece'));
    return { width: p.getBoundingClientRect().width, text: p.textContent };
  })()`);
  assert.ok(
    preview.width >= 240,
    `Import preview must remain readable beside instruments: ${preview.width}px`,
  );
  console.log('PASS import preview remains readable at 1024 landscape');

  const failures = [];
  const columns = {
    analyze: '.analyze-columns',
    transcription: '.transcription-review-columns',
    structure: '.structure-controls',
    library: '.library-list-columns',
  };
  for (const module of Object.keys(columns)) {
    if (process.argv.includes('--interactions')) break;
    await evaluate(
      `layoutStore.getState().setActiveModule(${JSON.stringify(module)})`,
    );
    await until(`!!document.querySelector('.${module}-module')`);
    if (module === 'library')
      await until("!!document.querySelector('[role=search]')");
    for (const width of [375, 507, 768, 834, 1024, 1366]) {
      for (const orientation of ['portrait', 'landscape']) {
        await viewport(width, orientation);
        const result = await evaluate(`(() => {
          const root = document.querySelector('.${module}-module');
          const bounds = root.getBoundingClientRect();
          const instrument = document.querySelector('.instrument-workspace').getBoundingClientRect();
          const outside = [...root.querySelectorAll('button, input:not([type=file]), select, textarea, [role=button]')].flatMap(el => {
            const r = el.getBoundingClientRect();
            if (!r.width || !r.height || el.closest('.sr-only')) return [];
            return r.left < bounds.left - 1 || r.right > bounds.right + 1
              ? [{ label: el.getAttribute('aria-label') || el.textContent.trim().slice(0, 50), left: r.left, right: r.right }] : [];
          });
          return {
            pageWidth: document.documentElement.scrollWidth,
            viewport: document.documentElement.clientWidth,
            moduleWidth: root.clientWidth, contentWidth: root.scrollWidth,
            columns: getComputedStyle(document.querySelector('${columns[module]}')).gridTemplateColumns,
            sideBySide: instrument.left >= bounds.right,
            frame: !!root.closest('.lh-frame') || !!root.querySelector('.lh-frame'),
            outside,
          };
        })()`);
        measurements.push({ module, width, orientation, ...result });
        const label = `${module} ${width} ${orientation}`;
        if (module === 'structure') {
          const commentWidths = await evaluate(
            `[...document.querySelectorAll('.structure-module button')].filter(b => b.textContent.includes('Entrada suave')).map(b => b.getBoundingClientRect().width)`,
          );
          if (commentWidths.length !== 2 || Math.min(...commentWidths) < 200)
            failures.push(
              `${label}: section comment squeezed to ${commentWidths.join(', ')}px`,
            );
        }
        if (
          result.pageWidth > result.viewport ||
          result.contentWidth > result.moduleWidth + 1 ||
          result.outside.length
        ) {
          failures.push(`${label}: overflow ${JSON.stringify(result)}`);
        }
        if ([768, 834].includes(width) && result.columns.split(' ').length < 2)
          failures.push(`${label}: missing medium columns`);
        if (width >= 1024 && !result.sideBySide)
          failures.push(`${label}: instruments not alongside module`);
        if (!result.frame) failures.push(`${label}: missing shared Frame`);
        const screenshot = await send('Page.captureScreenshot', {
          format: 'png',
          captureBeyondViewport: true,
          clip: {
            x: 0,
            y: 0,
            width,
            height: Math.min(
              1800,
              await evaluate('document.documentElement.scrollHeight'),
            ),
            scale: 1,
          },
        });
        await writeFile(
          join(output, `${module}-${width}-${orientation}.png`),
          Buffer.from(screenshot.data, 'base64'),
        );
      }
    }
  }
  assert.deepEqual(
    failures,
    [],
    'All four populated modules fit the width/orientation matrix',
  );
  if (measurements.length)
    console.log(
      `PASS ${measurements.length} layouts: medium columns, contained controls, no page scroll, shared Frames and landscape instruments`,
    );

  for (const module of ['library', 'transcription']) {
    await evaluate(`layoutStore.getState().setActiveModule('${module}')`);
    await until(`!!document.querySelector('.${module}-module')`);
    if (module === 'transcription') {
      await evaluate(
        "[...document.querySelectorAll('button')].find(b => b.textContent.includes('Importar do Guitar Pro')).click()",
      );
    }
    await until(
      `!!document.querySelector('.${module}-module input[type=file]')`,
    );
    await evaluate(`(() => {
      const input = document.querySelector('.${module}-module input[type=file]');
      const data = new DataTransfer();
      data.items.add(new File(['unsupported'], 'unsupported.gp5'));
      input.files = data.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await until(`!!document.querySelector('.${module}-module [role=alert]')`);
    for (const width of [375, 768, 1024]) {
      await viewport(width, 'landscape');
      const feedback = await evaluate(`(() => {
        const alert = document.querySelector('.${module}-module [role=alert]');
        const r = alert.getBoundingClientRect();
        return { text: alert.textContent, shared: alert.classList.contains('lh-callout'),
          visible: r.width > 200 && r.left >= 0 && r.right <= innerWidth,
          contained: alert.scrollWidth <= alert.clientWidth };
      })()`);
      assert.match(
        feedback.text,
        module === 'library'
          ? /Tipos aceitos: \.gp, \.psarc, \.mid ou \.midi/
          : /Guitar Pro 7\/8 \(\.gp\)/,
      );
      assert.ok(
        feedback.shared && feedback.visible && feedback.contained,
        `${module} import feedback at ${width}`,
      );
    }
  }
  console.log(
    'PASS supported-file messages remain visible in shared Callouts at 375, 768 and 1024',
  );

  await viewport(1024, 'landscape');
  await evaluate("layoutStore.getState().setActiveModule('structure')");
  await until("!!document.querySelector('.structure-section-content')");
  await evaluate(
    "document.querySelector('.structure-section-content').scrollIntoView(); window.scrollBy(0, -130)",
  );
  const positions = await evaluate(`(() => {
    const sections = [...document.querySelectorAll('.structure-section-content')];
    const bar = sections[0].querySelector('div[role=button]').getBoundingClientRect();
    const target = sections[1].getBoundingClientRect();
    return { from: { x: bar.x + bar.width / 2, y: bar.y + bar.height / 2 },
      to: { x: target.x + target.width / 2, y: target.y + target.height / 2 } };
  })()`);
  await send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ ...positions.from, id: 1 }],
  });
  await delay(250);
  for (let step = 1; step <= 8; step++) {
    await send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        {
          x:
            positions.from.x + ((positions.to.x - positions.from.x) * step) / 8,
          y:
            positions.from.y + ((positions.to.y - positions.from.y) * step) / 8,
          id: 1,
        },
      ],
    });
    await delay(25);
  }
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await until(
    "layoutStore.getState().structureSections[1].barIds.includes('bar-0')",
  );
  assert.equal(
    await evaluate(
      "document.querySelectorAll('.structure-section-content')[1].querySelectorAll('div[role=button]').length",
    ),
    5,
  );
  console.log(
    'PASS touch long-press moves a bar into the next section after reflow',
  );
} finally {
  await mkdir(output, { recursive: true });
  await writeFile(
    join(output, 'measurements.json'),
    JSON.stringify(measurements, null, 2),
  );
  socket?.close();
  browser.kill();
  await new Promise((resolve) => browser.once('exit', resolve));
  await rm(profile, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 200,
  }).catch(() => {});
}
