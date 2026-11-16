// Wwise `.wem` → Ogg Vorbis, repackaging the stripped Vorbis stream without
// re-encoding. The stream does not say which packed codebook set its encoder
// used: official Rocksmith 2014 streams need aoTuV 6.03, and some custom
// songs need the standard set. With the wrong set the output does not decode,
// so each set is tried in turn and a short prefix of the result is decoded.

import { OggVorbisDecoder } from '@wasm-audio-decoders/ogg-vorbis';
import { convertWwiseRiffToOgg } from 'ww2ogg-ts';
import {
  AOTUV_603_CODEBOOKS_B64,
  STANDARD_CODEBOOKS_B64,
} from 'ww2ogg-ts/dist/codebooks.data';

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

const CODEBOOK_SETS = [AOTUV_603_CODEBOOKS_B64, STANDARD_CODEBOOKS_B64];
const decodedSets = new Map<string, Uint8Array>();

function codebooks(b64: string): Uint8Array {
  let bytes = decodedSets.get(b64);
  if (!bytes) {
    bytes = Uint8Array.from(atob(b64), (char) => char.charCodeAt(0));
    decodedSets.set(b64, bytes);
  }
  return bytes;
}

/** Enough pages for the three headers and about a second of audio. */
const PROBE_BYTES = 64_000;

/** End of the first Ogg page that reaches `minBytes`, or the whole stream. */
export function oggPrefixEnd(ogg: Uint8Array, minBytes: number): number {
  let offset = 0;
  while (offset < minBytes && offset + 27 <= ogg.length) {
    const segments = ogg[offset + 26];
    if (offset + 27 + segments > ogg.length) break;
    let body = 0;
    for (let i = 0; i < segments; i++) body += ogg[offset + 27 + i];
    const next = offset + 27 + segments + body;
    if (next > ogg.length) break;
    offset = next;
  }
  return offset;
}

async function decodesCleanly(ogg: Uint8Array): Promise<boolean> {
  const decoder = new OggVorbisDecoder();
  try {
    await decoder.ready;
    const prefix = ogg.subarray(0, oggPrefixEnd(ogg, PROBE_BYTES));
    const result = await decoder.decodeFile(prefix);
    return result.errors.length === 0 && result.samplesDecoded > 0;
  } catch {
    return false;
  } finally {
    decoder.free();
  }
}

export class WemAudioError extends Error {
  constructor() {
    super('undecodable');
    this.name = 'WemAudioError';
  }
}

export async function wemToOgg(
  wem: Uint8Array,
): Promise<Uint8Array<ArrayBuffer>> {
  ensureBufferFrom();
  for (const set of CODEBOOK_SETS) {
    let ogg: Uint8Array<ArrayBuffer>;
    try {
      const out = convertWwiseRiffToOgg(wem, { codebooks: codebooks(set) }).ogg;
      ogg = new Uint8Array(
        out.buffer as ArrayBuffer,
        out.byteOffset,
        out.byteLength,
      );
    } catch {
      continue;
    }
    if (await decodesCleanly(ogg)) return ogg;
  }
  throw new WemAudioError();
}
