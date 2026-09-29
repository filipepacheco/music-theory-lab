// Decoder for Rocksmith 2014 `.sng` arrangement files.
//
// An SNG is AES-256-CTR encrypted (platform key, per-file IV), then a
// little-endian uint32 plaintext size followed by a zlib stream. The payload
// is a fixed sequence of counted arrays; every array must be walked even when
// its contents are ignored, because nothing in the file says where the next
// one starts. Layout follows the community Rocksmith 2014 toolkit.

import { unzlibSync } from 'fflate';
import { hexBytes } from '@/services/rocksmith/psarc';

const SNG_MAGIC = 0x4a;
const SNG_KEYS = {
  pc: hexBytes(
    'CB648DF3D12A16BF71701414E69619EC171CCA5D2A142E3E59DE7ADDA18A3A30',
  ),
  mac: hexBytes(
    '9821330E34B91F70D0A48CBD625993126970CEA09192C0E6CDA676CC9838289A',
  ),
};

export class SngError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SngError';
  }
}

export interface SngBeat {
  time: number;
  measure: number;
  /** Beat index within its measure; 0 marks a downbeat. */
  beat: number;
}

export interface SngNote {
  mask: number;
  time: number;
  string: number;
  fret: number;
  chordId: number;
  phraseIterationId: number;
  slideTo: number;
  slideUnpitchTo: number;
  sustain: number;
}

export interface SngLevel {
  difficulty: number;
  notes: SngNote[];
}

export interface SngArrangement {
  beats: SngBeat[];
  phrases: { name: string; maxDifficulty: number }[];
  chordTemplates: { name: string; frets: number[] }[];
  phraseIterations: { phraseId: number; startTime: number }[];
  sections: { name: string; startTime: number; endTime: number }[];
  levels: SngLevel[];
  metadata: {
    songLength: number;
    capoFret: number;
    tuning: number[];
  };
}

export async function decryptSng(raw: Uint8Array): Promise<Uint8Array> {
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  if (raw.length < 28 || view.getUint32(0, true) !== SNG_MAGIC) {
    throw new SngError('not-sng');
  }
  const iv = raw.slice(8, 24);
  const payload = raw.slice(24);
  // The platform is not recorded in the file: try PC first, then Mac, and
  // accept whichever key yields a zlib stream of the declared size.
  for (const rawKey of [SNG_KEYS.pc, SNG_KEYS.mac]) {
    const key = await crypto.subtle.importKey('raw', rawKey, 'AES-CTR', false, [
      'decrypt',
    ]);
    const plain = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: 'AES-CTR', counter: iv, length: 128 },
        key,
        payload,
      ),
    );
    const size = new DataView(plain.buffer).getUint32(0, true);
    try {
      const body = unzlibSync(plain.subarray(4));
      if (body.length === size) return body;
    } catch {
      // Wrong key: the "zlib stream" is noise. Try the next platform.
    }
  }
  throw new SngError('undecryptable');
}

class Reader {
  private view: DataView;
  offset = 0;

  constructor(private bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  get remaining(): number {
    return this.bytes.length - this.offset;
  }

  i8() {
    const v = this.view.getInt8(this.offset);
    this.offset += 1;
    return v;
  }
  u8() {
    const v = this.view.getUint8(this.offset);
    this.offset += 1;
    return v;
  }
  i16() {
    const v = this.view.getInt16(this.offset, true);
    this.offset += 2;
    return v;
  }
  i32() {
    const v = this.view.getInt32(this.offset, true);
    this.offset += 4;
    return v;
  }
  u32() {
    const v = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return v;
  }
  f32() {
    const v = this.view.getFloat32(this.offset, true);
    this.offset += 4;
    return v;
  }
  skip(bytes: number) {
    this.offset += bytes;
  }
  text(length: number): string {
    const raw = this.bytes.subarray(this.offset, this.offset + length);
    this.offset += length;
    const end = raw.indexOf(0);
    return new TextDecoder().decode(end === -1 ? raw : raw.subarray(0, end));
  }
  array<T>(readItem: () => T): T[] {
    const count = this.i32();
    // Every item is at least one byte, so a larger count means corruption.
    if (count < 0 || count > this.remaining) throw new SngError('corrupt');
    return Array.from({ length: count }, readItem);
  }
  skipArray(itemBytes: number) {
    const count = this.i32();
    if (count < 0 || count * itemBytes > this.remaining) {
      throw new SngError('corrupt');
    }
    this.offset += count * itemBytes;
  }
}

const BEND_VALUE_BYTES = 12;
const CHORD_NOTES_BYTES = 6 * 4 + 6 * (32 * BEND_VALUE_BYTES + 4) + 6 + 6 + 12;
const ANCHOR_BYTES = 28;
const ANCHOR_EXTENSION_BYTES = 12;
const FINGERPRINT_BYTES = 20;

export function parseSng(body: Uint8Array): SngArrangement {
  const r = new Reader(body);
  const beats = r.array(() => {
    const time = r.f32();
    const measure = r.i16();
    const beat = r.i16();
    r.skip(8); // phrase iteration, mask
    return { time, measure, beat };
  });
  const phrases = r.array(() => {
    r.skip(4); // solo, disparity, ignore, padding
    const maxDifficulty = r.i32();
    r.skip(4); // phrase iteration links
    return { maxDifficulty, name: r.text(32) };
  });
  const chordTemplates = r.array(() => {
    r.skip(4); // mask
    const frets = Array.from({ length: 6 }, () => r.i8());
    r.skip(6 + 24); // fingers, midi notes
    return { frets, name: r.text(32) };
  });
  r.skipArray(CHORD_NOTES_BYTES);
  const vocalCount = r.i32();
  // Vocals are followed by glyph tables whose layout we do not read; only a
  // vocals arrangement has them, and we never parse that one.
  if (vocalCount !== 0) throw new SngError('unsupported-vocals');
  const phraseIterations = r.array(() => {
    const phraseId = r.i32();
    const startTime = r.f32();
    r.skip(4 + 12); // next phrase time, difficulty[3]
    return { phraseId, startTime };
  });
  r.skipArray(16); // phrase extra info
  r.array(() => {
    r.skip(4); // level break
    r.skipArray(4); // phrases
  });
  r.skipArray(260); // actions
  r.skipArray(260); // events
  r.skipArray(8); // tones
  r.skipArray(8); // DNAs
  const sections = r.array(() => {
    const name = r.text(32);
    r.skip(4); // number
    const startTime = r.f32();
    const endTime = r.f32();
    r.skip(8 + 36); // phrase iteration range, string mask
    return { name, startTime, endTime };
  });
  const levels = r.array(() => {
    const difficulty = r.i32();
    r.skipArray(ANCHOR_BYTES);
    r.skipArray(ANCHOR_EXTENSION_BYTES);
    r.skipArray(FINGERPRINT_BYTES);
    r.skipArray(FINGERPRINT_BYTES);
    const notes = r.array((): SngNote => {
      const mask = r.u32();
      r.skip(8); // flags, hash
      const time = r.f32();
      const string = r.i8();
      const fret = r.i8();
      r.skip(2); // anchor fret, anchor width
      const chordId = r.i32();
      r.skip(8); // chord note id, phrase id
      const phraseIterationId = r.i32();
      r.skip(4 + 6); // fingerprint ids, next/prev/parent note links
      const slideTo = r.i8();
      const slideUnpitchTo = r.i8();
      r.skip(5 + 2); // left hand, tap, pick, slap, pluck, vibrato
      const sustain = r.f32();
      r.skip(4); // max bend
      r.skipArray(BEND_VALUE_BYTES);
      return {
        mask,
        time,
        string,
        fret,
        chordId,
        phraseIterationId,
        slideTo,
        slideUnpitchTo,
        sustain,
      };
    });
    r.skipArray(4); // average notes per iteration
    r.skipArray(4); // notes in iteration (count 1)
    r.skipArray(4); // notes in iteration (count 2)
    return { difficulty, notes };
  });
  r.skip(8 * 4 + 4 + 4); // scores, first beat length, start time
  const capoFret = r.i8();
  r.skip(32 + 2); // last conversion date, part
  const songLength = r.f32();
  const tuning = r.array(() => r.i16());
  r.skip(4 + 4 + 4); // first note times, max difficulty
  if (r.remaining !== 0) throw new SngError('corrupt');

  return {
    beats,
    phrases,
    chordTemplates,
    phraseIterations,
    sections,
    levels,
    metadata: { songLength, capoFret, tuning },
  };
}
