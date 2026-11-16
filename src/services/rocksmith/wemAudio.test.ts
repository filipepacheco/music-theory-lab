import { beforeEach, describe, expect, it, vi } from 'vitest';

const convert = vi.fn();
const decodeFile = vi.fn();

vi.mock('ww2ogg-ts', () => ({ convertWwiseRiffToOgg: convert }));
vi.mock('ww2ogg-ts/dist/codebooks.data', () => ({
  AOTUV_603_CODEBOOKS_B64: btoa('A'),
  STANDARD_CODEBOOKS_B64: btoa('S'),
}));
vi.mock('@wasm-audio-decoders/ogg-vorbis', () => ({
  OggVorbisDecoder: class {
    ready = Promise.resolve();
    decodeFile = decodeFile;
    free() {}
  },
}));

const { WemAudioError, oggPrefixEnd, wemToOgg } =
  await import('@/services/rocksmith/wemAudio');

function oggPage(bodyLength: number): Uint8Array {
  const segments = Math.ceil(bodyLength / 255) || 1;
  const page = new Uint8Array(27 + segments + bodyLength);
  page.set([0x4f, 0x67, 0x67, 0x53]);
  page[26] = segments;
  for (let i = 0; i < segments; i++) {
    page[27 + i] = Math.min(255, bodyLength - i * 255);
  }
  return page;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** The stub output is one Ogg page whose last byte names its codebook set. */
function oggFor(set: string): { ogg: Uint8Array } {
  const page = oggPage(1);
  page[page.length - 1] = set.charCodeAt(0);
  return { ogg: page };
}

const setOf = (bytes: Uint8Array) =>
  String.fromCharCode(bytes[bytes.length - 1]);

describe('oggPrefixEnd', () => {
  const a = oggPage(100);
  const b = oggPage(600);
  const c = oggPage(50);
  const stream = concat(a, b, c);

  it('ends on the page boundary that reaches the minimum', () => {
    expect(oggPrefixEnd(stream, 1)).toBe(a.length);
    expect(oggPrefixEnd(stream, a.length + 1)).toBe(a.length + b.length);
  });

  it('never cuts inside a page header or body', () => {
    expect(oggPrefixEnd(stream.subarray(0, a.length + 20), 10_000)).toBe(
      a.length,
    );
    expect(oggPrefixEnd(stream.subarray(0, a.length + 40), 10_000)).toBe(
      a.length,
    );
  });

  it('takes the whole stream when it is shorter than the minimum', () => {
    expect(oggPrefixEnd(stream, 10_000)).toBe(stream.length);
  });
});

describe('wemToOgg', () => {
  beforeEach(() => {
    convert.mockReset();
    decodeFile.mockReset();
    convert.mockImplementation((_wem, { codebooks }) =>
      oggFor(setOf(codebooks)),
    );
  });

  const clean = { errors: [], samplesDecoded: 48_000 };
  const broken = { errors: [{ message: 'bad header' }], samplesDecoded: 0 };

  it('keeps the aoTuV output when it decodes', async () => {
    decodeFile.mockResolvedValue(clean);
    const ogg = await wemToOgg(new Uint8Array(4));
    expect(setOf(ogg)).toBe('A');
    expect(convert).toHaveBeenCalledTimes(1);
  });

  it('falls back to the standard set when the aoTuV output fails', async () => {
    decodeFile.mockImplementation(async (ogg: Uint8Array) =>
      setOf(ogg) === 'A' ? broken : clean,
    );
    const ogg = await wemToOgg(new Uint8Array(4));
    expect(setOf(ogg)).toBe('S');
  });

  it('treats a decoder exception as a failed set', async () => {
    decodeFile.mockImplementation(async (ogg: Uint8Array) => {
      if (setOf(ogg) === 'A') throw new RangeError('out of bounds');
      return clean;
    });
    expect(setOf(await wemToOgg(new Uint8Array(4)))).toBe('S');
  });

  it('throws when no set gives decodable audio', async () => {
    decodeFile.mockResolvedValue(broken);
    await expect(wemToOgg(new Uint8Array(4))).rejects.toBeInstanceOf(
      WemAudioError,
    );
  });

  it('skips a set the converter rejects', async () => {
    convert.mockImplementationOnce(() => {
      throw new Error('parse error');
    });
    decodeFile.mockResolvedValue(clean);
    expect(setOf(await wemToOgg(new Uint8Array(4)))).toBe('S');
  });
});
