// Wwise `.wem` → Ogg Vorbis, repackaging the stripped Vorbis stream without
// re-encoding. Rocksmith 2014 streams use the aoTuV 6.03 packed codebooks;
// with the standard set the output decodes with packet errors and plays
// short, desynchronising the chart.

import { convertWwiseRiffToOgg } from 'ww2ogg-ts';
import { AOTUV_603_CODEBOOKS_B64 } from 'ww2ogg-ts/dist/codebooks.data';

/**
 * ww2ogg-ts hands back its output through Node's `Buffer.from(number[])`.
 * The browser has no `Buffer`, and that single call is all the library needs,
 * so a byte-array shim stands in rather than a full polyfill.
 */
function ensureBufferFrom(): void {
  const scope = globalThis as { Buffer?: unknown };
  if (scope.Buffer === undefined) {
    scope.Buffer = {
      from: (bytes: ArrayLike<number>) => Uint8Array.from(bytes),
    };
  }
}

let codebooks: Uint8Array | null = null;

function aotuvCodebooks(): Uint8Array {
  if (!codebooks) {
    const binary = atob(AOTUV_603_CODEBOOKS_B64);
    codebooks = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  }
  return codebooks;
}

export function wemToOgg(wem: Uint8Array): Uint8Array<ArrayBuffer> {
  ensureBufferFrom();
  const { ogg } = convertWwiseRiffToOgg(wem, { codebooks: aotuvCodebooks() });
  return new Uint8Array(
    ogg.buffer as ArrayBuffer,
    ogg.byteOffset,
    ogg.byteLength,
  );
}
