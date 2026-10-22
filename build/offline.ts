import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin, ResolvedConfig } from 'vite';
import { TONE_PRESETS } from '../src/constants/tonePresets';

function publicFiles(
  directory: string,
  prefix = '',
): Record<string, Uint8Array> {
  const files: Record<string, Uint8Array> = {};
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const name = `${prefix}${entry.name}`;
    if (entry.isDirectory()) {
      Object.assign(
        files,
        publicFiles(resolve(directory, entry.name), `${name}/`),
      );
    } else {
      files[name] = readFileSync(resolve(directory, entry.name));
    }
  }
  return files;
}

export function createOfflineWorker(
  bundle: Record<string, string | Uint8Array>,
  publicDir: string,
): string {
  const template = readFileSync(resolve('offline/worker.js'), 'utf8');
  const files = Object.fromEntries(
    Object.entries({ ...publicFiles(publicDir), ...bundle }).filter(
      ([name]) =>
        !/^(library|api|intake)(\/|$)/i.test(name) && !name.endsWith('.map'),
    ),
  );
  // The Library is not precached, so its files do not change the release.
  const hash = createHash('sha256').update(template);
  for (const name of Object.keys(files).sort()) {
    hash.update(name).update(files[name]);
  }
  const samples = TONE_PRESETS.flatMap((preset) =>
    preset.type === 'sampler'
      ? Object.values(preset.urls).map((file) => preset.baseUrl + file)
      : [],
  );
  const urls = Object.keys(files)
    .sort()
    .map((name) => `/${name}`);
  hash.update(JSON.stringify([...urls, ...samples]));
  return template.replace(
    '__OFFLINE_MANIFEST__',
    JSON.stringify({
      cacheName: `music-theory-lab-offline-${hash.digest('hex').slice(0, 20)}`,
      urls,
      samples,
    }),
  );
}

export function offlinePlugin(): Plugin {
  let config: ResolvedConfig;
  return {
    name: 'music-theory-offline',
    apply: 'build',
    enforce: 'post',
    configResolved(resolved) {
      config = resolved;
    },
    generateBundle(_options, bundle) {
      const files = Object.fromEntries(
        Object.entries(bundle).map(([name, item]) => [
          name,
          item.type === 'chunk' ? item.code : item.source,
        ]),
      );
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: createOfflineWorker(files, config.publicDir),
      });
    },
  };
}
