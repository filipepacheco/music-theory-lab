import { it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';

// Vite resolves @/ imports in unit tests; Vercel's Node runtime does not.
// Build with the real function builder, then invoke its output without Vite.
const require = createRequire(import.meta.url);
const { build } = require('@vercel/node');
const { FileFsRef, FileBlob } = require('@vercel/build-utils');

const slashes = (path: string) => path.replace(/\\/g, '/');

it('loads the deployed function and keeps chart settings in a fresh session', async () => {
  const root = process.cwd();
  const directory = await mkdtemp(join(tmpdir(), 'chart-settings-runtime-'));
  try {
    const { output } = await build({
      files: {
        'api/chart-settings.ts': new FileFsRef({
          fsPath: join(root, 'api/chart-settings.ts'),
        }),
      },
      entrypoint: 'api/chart-settings.ts',
      workPath: root,
      meta: { skipDownload: true },
      config: {
        projectSettings: { installCommand: '', buildCommand: 'true' },
      },
      considerBuildCommand: true,
    });
    for (const [path, file] of Object.entries(output.files)) {
      if (slashes(path).startsWith('node_modules/')) continue;
      const target = join(directory, path);
      await mkdir(dirname(target), { recursive: true });
      const blob = await FileBlob.fromStream({
        stream: (file as { toStream(): unknown }).toStream(),
      });
      await writeFile(target, blob.data);
    }
    // A junction needs no special right on Windows; other systems ignore it.
    await symlink(
      join(root, 'node_modules'),
      join(directory, 'node_modules'),
      'junction',
    );
    const record = {
      chartId: 'a'.repeat(64),
      updatedAt: '2026-10-05T10:00:00.000Z',
      songLineLength: 4,
      sectionLineLengths: { 0: 'auto', 8: 2 },
      groupOverride: 'separate',
    };
    await writeFile(
      join(directory, 'invoke.mjs'),
      `import assert from 'node:assert/strict';
import handler from './${slashes(output.handler)}';
const record = ${JSON.stringify(record)};
async function request(method, body, query) {
  const result = {};
  const response = {
    status(code) { result.status = code; return this; },
    json(value) { result.body = value; return this; }
  };
  await handler({ method, body, query }, response);
  assert.equal(result.status, 200);
  return result.body;
}
if (process.argv[2] === 'write') {
  assert.deepEqual(
    await request('POST', { device_id: 'first', records: [record] }),
    { ok: true, counters: [1] },
  );
} else {
  assert.deepEqual(
    await request('GET', undefined, { after: '0' }),
    { records: [record], counter: 1, more: false },
  );
}
console.log('runtime settings sync passed');
`,
    );
    const options = {
      cwd: directory,
      env: {
        ...process.env,
        TURSO_DATABASE_URL: `file:${slashes(join(directory, 'settings.db'))}`,
        TURSO_AUTH_TOKEN: '',
      },
      encoding: 'utf8' as const,
      timeout: 10_000,
    };
    execFileSync(process.execPath, ['invoke.mjs', 'write'], options);
    const result = execFileSync(
      process.execPath,
      ['invoke.mjs', 'read'],
      options,
    );
    expect(result).toContain('runtime settings sync passed');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);
