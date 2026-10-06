import { it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fixtureChart } from '@/domain/bassChartFixture';

// Vite resolves @/ imports in unit tests; Vercel's Node runtime does not.
// Build with the real function builder, then invoke its output without Vite.
const require = createRequire(import.meta.url);
const { build } = require('@vercel/node');
const { FileFsRef, FileBlob } = require('@vercel/build-utils');

it('loads the deployed function and retains charts in a fresh session', async () => {
  const root = process.cwd();
  const directory = await mkdtemp(join(tmpdir(), 'bass-charts-runtime-'));
  try {
    const { output } = await build({
      files: {
        'api/bass-charts.ts': new FileFsRef({
          fsPath: join(root, 'api/bass-charts.ts'),
        }),
      },
      entrypoint: 'api/bass-charts.ts',
      workPath: root,
      meta: { skipDownload: true },
      config: {
        projectSettings: { installCommand: '', buildCommand: 'true' },
      },
      considerBuildCommand: true,
    });
    for (const [path, file] of Object.entries(output.files)) {
      if (path.startsWith('node_modules/')) continue;
      const target = join(directory, path);
      await mkdir(dirname(target), { recursive: true });
      const blob = await FileBlob.fromStream({
        stream: (file as { toStream(): unknown }).toStream(),
      });
      await writeFile(target, blob.data);
    }
    await symlink(join(root, 'node_modules'), join(directory, 'node_modules'));
    const chart = {
      ...fixtureChart(1, [{ bar: 0, beat: 0, midi: 33 }]),
      id: 'a'.repeat(64),
      source: 'gp',
    };
    await writeFile(
      join(directory, 'invoke.mjs'),
      `import assert from 'node:assert/strict';
import handler from './${output.handler}';
const chart = ${JSON.stringify(chart)};
const record = { id: chart.id, updatedAt: '2026-10-05T10:00:00.000Z', chart };
async function request(method, body) {
  const result = {};
  const response = {
    status(code) { result.status = code; return this; },
    json(value) { result.body = value; return this; }
  };
  await handler({ method, body }, response);
  assert.equal(result.status, 200);
  return result.body;
}
if (process.argv[2] === 'write') {
  await request('POST', { device_id: 'first', records: [record] });
} else {
  assert.deepEqual(await request('GET'), [record]);
}
console.log('runtime sync passed');
`,
    );
    const options = {
      cwd: directory,
      env: {
        ...process.env,
        TURSO_DATABASE_URL: `file:${join(directory, 'charts.db')}`,
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
    expect(result).toContain('runtime sync passed');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);
