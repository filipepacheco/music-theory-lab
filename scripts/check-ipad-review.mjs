import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Run with a local Vite server; PLAYWRIGHT_MODULE may point to an installed SDK.
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE
    ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href
    : 'playwright'
);
const base = process.env.REVIEW_URL ?? 'http://127.0.0.1:5183';
assert(['127.0.0.1', 'localhost'].includes(new URL(base).hostname));
const output = resolve(process.argv[2] ?? 'dist/ipad-review');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  channel: process.env.REVIEW_BROWSER_CHANNEL ?? 'chrome',
});
const results = [];

try {
  for (const width of [768, 1024]) {
    const height = width === 768 ? 1024 : 768;
    const context = await browser.newContext({
      viewport: { width, height },
      hasTouch: true,
      serviceWorkers: 'block',
    });
    const writes = [];
    const completedWrites = [];
    const errors = [];
    await context.route('**/*', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (!['GET', 'HEAD'].includes(request.method())) {
        writes.push(`${request.method()} ${url.pathname}`);
        return route.abort();
      }
      if (url.origin !== new URL(base).origin) return route.abort();
      if (url.pathname.startsWith('/api/')) {
        return route.fulfill({ json: [] });
      }
      return route.continue();
    });
    await context.addInitScript(() => {
      window.reviewFileReads = 0;
      const read = File.prototype.arrayBuffer;
      File.prototype.arrayBuffer = function () {
        window.reviewFileReads += 1;
        return read.call(this);
      };
    });
    const page = await context.newPage();
    page.on('response', (response) => {
      if (!['GET', 'HEAD'].includes(response.request().method())) {
        completedWrites.push(new URL(response.url()).pathname);
      }
    });
    page.on('pageerror', (error) => errors.push(error.message));
    page.setDefaultTimeout(10000);
    await page.goto(base);
    await page.getByRole('heading', { name: 'Music Theory Lab' }).waitFor();
    await page.evaluate(() => document.fonts.ready);
    const nav = page.getByRole('navigation', { name: 'Módulos', exact: true });
    const hint = page.getByRole('status').filter({ hasText: 'Deslize' });
    const measurements = { width, height, navigation: [], screens: [] };

    async function navigation(position) {
      await nav.evaluate((node, end) => {
        node.scrollLeft = end ? node.scrollWidth : 0;
      }, position === 'end');
      await page.waitForFunction(() => {
        const node = document.querySelector('nav[aria-label="Módulos"]');
        const max = node.scrollWidth - node.clientWidth;
        const text =
          node.parentElement.querySelector('[role="status"]')?.textContent;
        if (max <= 1) return !text;
        return (
          !!text &&
          text.includes('←') === node.scrollLeft > 1 &&
          text.includes('→') === node.scrollLeft < max - 1
        );
      });
      measurements.navigation.push({
        position,
        ...(await nav.evaluate((node) => ({
          viewport: window.innerWidth,
          clientWidth: node.clientWidth,
          scrollWidth: node.scrollWidth,
          scrollLeft: node.scrollLeft,
        }))),
        hint: (await hint.count()) ? await hint.innerText() : null,
      });
    }

    async function screenshot(name) {
      const size = await page.evaluate(() => ({
        viewport: window.innerWidth,
        document: document.documentElement.scrollWidth,
      }));
      assert(size.document <= size.viewport, `${name}: page overflows`);
      measurements.screens.push({ name, ...size });
      await page.screenshot({
        path: resolve(output, `${name}-${width}.png`),
        fullPage: true,
        animations: 'disabled',
      });
    }

    await navigation('start');
    await navigation('end');
    await page.setViewportSize({ width: 1600, height: 1024 });
    await navigation('start');
    assert.equal(await hint.count(), 0, 'No hint when all tabs fit');
    await page.setViewportSize({ width, height });
    await navigation('start');
    await screenshot('navigation');

    await nav.getByRole('button', { name: 'Transcrição', exact: true }).tap();
    await page.getByRole('button', { name: /Importar do Guitar Pro/ }).tap();
    const gpInput = page.locator('input[type="file"]');
    assert.equal(await gpInput.getAttribute('accept'), null);
    await gpInput.setInputFiles({
      name: 'wrong.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('wrong'),
    });
    const gpError = page
      .getByRole('alert')
      .filter({ hasText: 'Guitar Pro 7/8 (.gp)' });
    await gpError.waitFor({ state: 'visible' });
    await gpError.evaluate(async (node) => {
      for (let parent = node; parent; parent = parent.parentElement) {
        await Promise.all(
          parent.getAnimations().map((animation) => animation.finished),
        );
      }
    });
    assert.equal(await page.evaluate(() => window.reviewFileReads), 0);
    assert.match(await gpError.getAttribute('class'), /lh-callout/);
    await screenshot('transcription-import');

    await nav.getByRole('button', { name: 'Biblioteca', exact: true }).tap();
    const libraryInput = page.locator('#rocksmith-psarc-input');
    await libraryInput.waitFor({ state: 'attached' });
    assert.equal(await libraryInput.getAttribute('accept'), null);
    await libraryInput.setInputFiles({
      name: 'wrong.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('wrong'),
    });
    const libraryError = page.getByRole('alert').filter({ hasText: '.psarc' });
    await libraryError.waitFor({ state: 'visible' });
    assert.match(
      await libraryError.innerText(),
      /\.gp.*\.psarc.*\.mid.*\.midi/,
    );
    assert.equal(await page.evaluate(() => window.reviewFileReads), 0);
    assert.match(await libraryError.getAttribute('class'), /lh-callout/);
    await screenshot('library-import');

    await nav.getByRole('button', { name: 'Estrutura', exact: true }).tap();
    await page.getByRole('button', { name: '+ Intro', exact: true }).tap();
    for (let i = 0; i < 3; i += 1) {
      await page.getByRole('button', { name: /\+ Compasso/ }).tap();
    }
    await page.getByRole('button', { name: /^\[?\s*Groove\s*\]?$/ }).tap();
    for (const name of ['Bumbo', 'Caixa', 'Chimbal']) {
      assert(await page.getByText(name, { exact: true }).isVisible());
      const hit = page.getByRole('button', { name: `${name} 1`, exact: true });
      await hit.tap();
      assert.equal(await hit.getAttribute('aria-pressed'), 'true');
      assert(await page.getByText(name, { exact: true }).isVisible());
    }
    await screenshot('structure');

    const remove = page.getByRole('button', {
      name: 'Remover compasso 1',
      exact: true,
    });
    await remove.scrollIntoViewIfNeeded();
    const box = await remove.boundingBox();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }],
    });
    await page.waitForTimeout(300);
    assert.doesNotMatch(
      await page.locator('[aria-live="assertive"]').innerText(),
      /picked up|moved over/i,
    );
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    await page.waitForFunction(
      () =>
        document.querySelectorAll('button[aria-label^="Remover compasso"]')
          .length === 2,
    );
    const handle = page.locator('[aria-roledescription="draggable"]').first();
    assert.equal(
      await handle.evaluate((node) => getComputedStyle(node).touchAction),
      'none',
    );
    assert.equal(
      await page
        .locator('main')
        .evaluate((node) => getComputedStyle(node).touchAction),
      'auto',
    );
    await handle.scrollIntoViewIfNeeded();
    const dragBox = await handle.boundingBox();
    const touch = {
      x: dragBox.x + dragBox.width / 2,
      y: dragBox.y + dragBox.height / 2,
    };
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [touch],
    });
    await page.waitForFunction(() =>
      /picked up|moved over/i.test(
        document.querySelector('[aria-live="assertive"]').textContent,
      ),
    );
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ ...touch, x: touch.x + 30 }],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    await page.waitForFunction(() =>
      document
        .querySelector('[aria-live="assertive"]')
        .textContent.includes('dropped'),
    );
    await page.evaluate(() => window.scrollTo(0, 0));
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: width - 12, y: height - 80 }],
    });
    for (const delta of [100, 200, 300, 400, 500]) {
      const y = height - 80 - delta;
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: width - 12, y }],
      });
    }
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    await page.waitForFunction(() => window.scrollY > 0);
    measurements.removeHold = '300 ms: no drag; bar removed on release';
    measurements.handleDrag =
      'Touch hold activated; movement and drop completed';
    measurements.surroundingScrollY = await page.evaluate(() => window.scrollY);
    measurements.drumNames = ['Bumbo', 'Caixa', 'Chimbal'];
    measurements.fileReadsForUnsupportedNames = await page.evaluate(
      () => window.reviewFileReads,
    );
    assert.deepEqual(
      completedWrites,
      [],
      'No application writes reached a server',
    );
    assert.deepEqual(errors, [], 'No uncaught browser errors');
    measurements.blockedWriteRequests = writes;
    measurements.completedWriteRequests = completedWrites;
    measurements.pageErrors = errors;
    results.push(measurements);
    await context.close();
    console.log(`PASS tablet review at ${width}px`);
  }
} finally {
  await writeFile(
    resolve(output, 'measurements.json'),
    JSON.stringify(results, null, 2),
  );
  await browser.close();
}
