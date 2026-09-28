import { describe, expect, it } from 'vitest';
import { zlibSync } from 'fflate';
import {
  PsarcError,
  decryptCfb,
  hexBytes,
  readPsarc,
} from '@/services/rocksmith/psarc';

const KEY = hexBytes(
  'C53DB23870A1A2F71CAE64061FDD0E1157309DC85204D4C5BFDF25090DF2572C',
);
const BLOCK_SIZE = 64;

async function aesBlock(block: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', KEY, 'AES-CBC', false, [
    'encrypt',
  ]);
  const out = await crypto.subtle.encrypt(
    { name: 'AES-CBC', iv: new Uint8Array(16) },
    key,
    block.slice(),
  );
  return new Uint8Array(out, 0, 16);
}

/** Reference AES-CFB128 encryption, block by block. */
async function encryptCfb(plain: Uint8Array): Promise<Uint8Array> {
  const cipher = new Uint8Array(plain.length);
  let previous: Uint8Array = new Uint8Array(16);
  for (let at = 0; at < plain.length; at += 16) {
    const keystream = await aesBlock(previous);
    for (let i = 0; i < 16 && at + i < plain.length; i += 1) {
      cipher[at + i] = plain[at + i] ^ keystream[i];
    }
    previous = cipher.slice(at, at + 16);
  }
  return cipher;
}

function writeUint(
  target: Uint8Array,
  at: number,
  width: number,
  value: number,
) {
  for (let i = width - 1; i >= 0; i -= 1) {
    target[at + i] = value % 256;
    value = Math.floor(value / 256);
  }
}

/** Build a PSARC holding `files`, compressing blocks when `compress`. */
async function buildPsarc(
  files: Record<string, Uint8Array>,
  compress: boolean,
): Promise<Uint8Array> {
  const names = Object.keys(files);
  const contents = [
    new TextEncoder().encode(names.join('\n')),
    ...names.map((n) => files[n]),
  ];
  const blocks: Uint8Array[] = [];
  const entries = contents.map((content) => {
    const firstBlock = blocks.length;
    for (let at = 0; at < content.length || at === 0; at += BLOCK_SIZE) {
      const raw = content.subarray(at, at + BLOCK_SIZE);
      blocks.push(compress ? zlibSync(raw) : raw);
      if (content.length === 0) break;
    }
    return { firstBlock, length: content.length };
  });

  const entrySize = 30;
  const tocLength = 32 + entries.length * entrySize + blocks.length * 2;
  const toc = new Uint8Array(tocLength - 32);
  let offset = tocLength;
  entries.forEach((entry, i) => {
    writeUint(toc, i * entrySize + 16, 4, entry.firstBlock);
    writeUint(toc, i * entrySize + 20, 5, entry.length);
    writeUint(toc, i * entrySize + 25, 5, offset);
    for (
      let b = entry.firstBlock;
      b < (entries[i + 1]?.firstBlock ?? blocks.length);
      b += 1
    ) {
      offset += blocks[b].length;
    }
  });
  blocks.forEach((block, i) => {
    // A full-size raw block is recorded as 0.
    const stored = block.length === BLOCK_SIZE && !compress ? 0 : block.length;
    writeUint(toc, entries.length * entrySize + i * 2, 2, stored);
  });

  const header = new Uint8Array(32);
  header.set(new TextEncoder().encode('PSAR'), 0);
  writeUint(header, 4, 4, 0x00010004);
  header.set(new TextEncoder().encode('zlib'), 8);
  writeUint(header, 12, 4, tocLength);
  writeUint(header, 16, 4, entrySize);
  writeUint(header, 20, 4, entries.length);
  writeUint(header, 24, 4, BLOCK_SIZE);
  writeUint(header, 28, 4, 4);

  const out = new Uint8Array(offset);
  out.set(header, 0);
  out.set(await encryptCfb(toc), 32);
  let at = tocLength;
  for (const block of blocks) {
    out.set(block, at);
    at += block.length;
  }
  return out;
}

const payload = (length: number, seed: number) =>
  Uint8Array.from({ length }, (_, i) => (i * seed + 7) % 251);

describe('decryptCfb', () => {
  it('inverts CFB128 encryption, including a trailing partial block', async () => {
    const plain = payload(53, 13);
    expect(await decryptCfb(await encryptCfb(plain), KEY)).toEqual(plain);
  });
});

describe('readPsarc', () => {
  const files = {
    'songs/bin/generic/x_bass.sng': payload(150, 3),
    'manifests/x/x_bass.json': new TextEncoder().encode('{"a":1}'),
    'audio/windows/1.wem': payload(64, 5),
  };

  it.each([true, false])(
    'lists and extracts every entry (compressed=%s)',
    async (compress) => {
      const archive = await readPsarc(await buildPsarc(files, compress));
      expect(archive.names).toEqual(Object.keys(files));
      for (const [name, content] of Object.entries(files)) {
        expect(archive.read(name)).toEqual(content);
      }
    },
  );

  it('rejects files that are not PSARC archives', async () => {
    await expect(readPsarc(payload(64, 1))).rejects.toThrow(PsarcError);
  });

  it('reports a missing entry', async () => {
    const archive = await readPsarc(await buildPsarc(files, true));
    expect(() => archive.read('nope')).toThrow('missing-entry');
  });
});
