import { describe, expect, it } from 'vitest';
import { zlibSync } from 'fflate';
import { hexBytes } from '@/services/rocksmith/psarc';
import { SngError, decryptSng, parseSng } from '@/services/rocksmith/sng';

/** Little-endian writer mirroring the SNG layout the parser walks. */
class Writer {
  private bytes: number[] = [];
  private view = new DataView(new ArrayBuffer(8));
  private push(width: number) {
    for (let i = 0; i < width; i += 1) this.bytes.push(this.view.getUint8(i));
  }
  i8(v: number) {
    this.view.setInt8(0, v);
    this.push(1);
    return this;
  }
  i16(v: number) {
    this.view.setInt16(0, v, true);
    this.push(2);
    return this;
  }
  i32(v: number) {
    this.view.setInt32(0, v, true);
    this.push(4);
    return this;
  }
  u32(v: number) {
    this.view.setUint32(0, v, true);
    this.push(4);
    return this;
  }
  f32(v: number) {
    this.view.setFloat32(0, v, true);
    this.push(4);
    return this;
  }
  f64(v: number) {
    this.view.setFloat64(0, v, true);
    this.push(8);
    return this;
  }
  zeros(n: number) {
    for (let i = 0; i < n; i += 1) this.bytes.push(0);
    return this;
  }
  text(s: string, n: number) {
    const encoded = new TextEncoder().encode(s);
    for (let i = 0; i < n; i += 1) this.bytes.push(encoded[i] ?? 0);
    return this;
  }
  done() {
    return Uint8Array.from(this.bytes);
  }
}

interface NoteSpec {
  time: number;
  string: number;
  fret: number;
  iteration: number;
  mask?: number;
  chordId?: number;
  slideTo?: number;
  sustain?: number;
}

function writeNote(w: Writer, n: NoteSpec) {
  w.u32(n.mask ?? 0)
    .u32(0)
    .u32(0)
    .f32(n.time);
  w.i8(n.string).i8(n.fret).i8(0).i8(4);
  w.i32(n.chordId ?? -1)
    .i32(-1)
    .i32(0)
    .i32(n.iteration);
  w.zeros(4 + 6);
  w.i8(n.slideTo ?? -1)
    .i8(-1)
    .zeros(5)
    .i16(0);
  w.f32(n.sustain ?? 0).f32(0);
  w.i32(0); // bends
}

/** A two-bar 4/4 arrangement at 120 bpm with two difficulty levels. */
function buildSngBody(): Uint8Array {
  const w = new Writer();
  w.i32(8);
  for (let i = 0; i < 8; i += 1) {
    w.f32(10 + i * 0.5)
      .i16(1 + Math.floor(i / 4))
      .i16(i % 4)
      .i32(0)
      .i32(0);
  }
  w.i32(1).zeros(4).i32(1).i32(0).text('riff', 32); // phrases
  w.i32(1).u32(0); // chord templates
  [0, -1, 2, -1, -1, -1].forEach((f) => w.i8(f));
  w.zeros(6 + 24).text('B5', 32);
  w.i32(0); // chord notes
  w.i32(0); // vocals
  w.i32(1).i32(0).f32(10).f32(14).zeros(12); // phrase iterations
  w.i32(0); // phrase extra info
  w.i32(1).i32(0).i32(1).i32(0); // linked difficulty with one phrase
  w.i32(0); // actions
  w.i32(1).f32(10).text('TS:4/4', 256); // events
  w.i32(0).i32(0); // tones, DNAs
  w.i32(2); // sections
  w.text('intro', 32).i32(1).f32(10).f32(12).i32(0).i32(0).zeros(36);
  w.text('verse', 32).i32(1).f32(12).f32(14).i32(0).i32(0).zeros(36);
  w.i32(2); // levels
  const levels: NoteSpec[][] = [
    [{ time: 10, string: 0, fret: 7, iteration: 0 }],
    [
      { time: 10, string: 0, fret: 7, iteration: 0, sustain: 0.4 },
      { time: 10.5, string: 1, fret: 2, iteration: 0, mask: 0x20000 },
      { time: 12, string: 0, fret: 0, iteration: 0, chordId: 0, mask: 0x2 },
    ],
  ];
  levels.forEach((notes, difficulty) => {
    w.i32(difficulty);
    w.i32(1).zeros(28); // anchors
    w.i32(0).i32(0).i32(0); // anchor extensions, fingerprints
    w.i32(notes.length);
    notes.forEach((n) => writeNote(w, n));
    w.i32(1).f32(1).i32(1).i32(notes.length).i32(1).i32(notes.length);
  });
  w.f64(100000).f64(3).f64(3).f64(1).f32(0.5).f32(10);
  w.i8(-1).text('01-01-26 00:00', 32).i16(1).f32(14);
  w.i32(6);
  [0, 0, 0, 0, 0, 0].forEach((t) => w.i16(t));
  w.f32(10).f32(10).i32(1);
  return w.done();
}

const PC_KEY = hexBytes(
  'CB648DF3D12A16BF71701414E69619EC171CCA5D2A142E3E59DE7ADDA18A3A30',
);

async function encryptSng(body: Uint8Array): Promise<Uint8Array> {
  const size = new Uint8Array(4);
  new DataView(size.buffer).setUint32(0, body.length, true);
  const compressed = zlibSync(body);
  const plain = new Uint8Array(4 + compressed.length);
  plain.set(size, 0);
  plain.set(compressed, 4);
  const iv = Uint8Array.from({ length: 16 }, (_, i) => i * 17);
  const key = await crypto.subtle.importKey('raw', PC_KEY, 'AES-CTR', false, [
    'encrypt',
  ]);
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-CTR', counter: iv, length: 128 },
      key,
      plain,
    ),
  );
  const out = new Uint8Array(24 + cipher.length);
  new DataView(out.buffer).setUint32(0, 0x4a, true);
  new DataView(out.buffer).setUint32(4, 3, true);
  out.set(iv, 8);
  out.set(cipher, 24);
  return out;
}

describe('decryptSng', () => {
  it('recovers the plaintext body of a PC-encrypted SNG', async () => {
    const body = buildSngBody();
    expect(await decryptSng(await encryptSng(body))).toEqual(body);
  });

  it('rejects data without the SNG magic', async () => {
    await expect(decryptSng(new Uint8Array(64))).rejects.toThrow(SngError);
  });
});

describe('parseSng', () => {
  it('reads beats, phrases, sections, levels and metadata', () => {
    const sng = parseSng(buildSngBody());
    expect(sng.beats).toHaveLength(8);
    expect(sng.beats.filter((b) => b.beat === 0).map((b) => b.time)).toEqual([
      10, 12,
    ]);
    expect(sng.phrases).toEqual([{ name: 'riff', maxDifficulty: 1 }]);
    expect(sng.chordTemplates[0]).toEqual({
      name: 'B5',
      frets: [0, -1, 2, -1, -1, -1],
    });
    expect(sng.sections.map((s) => s.name)).toEqual(['intro', 'verse']);
    expect(sng.levels.map((l) => l.notes.length)).toEqual([1, 3]);
    expect(sng.levels[1].notes[1]).toMatchObject({
      time: 10.5,
      string: 1,
      fret: 2,
      mask: 0x20000,
    });
    expect(sng.levels[1].notes[0].sustain).toBeCloseTo(0.4);
    expect(sng.metadata).toMatchObject({ songLength: 14, capoFret: -1 });
    expect(sng.metadata.tuning).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('rejects a truncated body', () => {
    const body = buildSngBody();
    expect(() => parseSng(body.subarray(0, body.length - 3))).toThrow();
  });
});
