// Reader for Rocksmith 2014 `.psarc` archives.
//
// A PSARC is a big-endian container: a 32-byte header, a table of contents
// (encrypted with AES-256-CFB under a key that is public knowledge in the
// modding community), a block-size table, and the file data split into
// zlib-compressed blocks. Entry 0 is the manifest: the newline-separated
// names of every other entry.

import { unzlibSync } from 'fflate';

const PSARC_KEY = hexBytes(
  'C53DB23870A1A2F71CAE64061FDD0E1157309DC85204D4C5BFDF25090DF2572C',
);
const HEADER_BYTES = 32;
const FLAG_ENCRYPTED_TOC = 4;

export class PsarcError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PsarcError';
  }
}

export interface PsarcArchive {
  /** Entry names in archive order, e.g. `songs/bin/generic/x_bass.sng`. */
  names: string[];
  read(name: string): Uint8Array;
}

interface TocEntry {
  firstBlock: number;
  length: number;
  offset: number;
}

export async function readPsarc(bytes: Uint8Array): Promise<PsarcArchive> {
  if (bytes.length < HEADER_BYTES || ascii(bytes, 0, 4) !== 'PSAR') {
    throw new PsarcError('not-psarc');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tocLength = view.getUint32(12);
  const entrySize = view.getUint32(16);
  const entryCount = view.getUint32(20);
  const blockSize = view.getUint32(24);
  const flags = view.getUint32(28);
  if (tocLength > bytes.length || entrySize < 30) {
    throw new PsarcError('corrupt-toc');
  }

  let toc = bytes.subarray(HEADER_BYTES, tocLength);
  if (flags === FLAG_ENCRYPTED_TOC) toc = await decryptCfb(toc, PSARC_KEY);

  const entries: TocEntry[] = [];
  for (let i = 0; i < entryCount; i += 1) {
    const at = i * entrySize;
    entries.push({
      firstBlock: readUint(toc, at + 16, 4),
      length: readUint(toc, at + 20, 5),
      offset: readUint(toc, at + 25, 5),
    });
  }

  const widthOfBlockSize =
    blockSize <= 0x10000 ? 2 : blockSize <= 0x1000000 ? 3 : 4;
  const blockSizes: number[] = [];
  for (
    let at = entryCount * entrySize;
    at + widthOfBlockSize <= toc.length;
    at += widthOfBlockSize
  ) {
    blockSizes.push(readUint(toc, at, widthOfBlockSize));
  }

  const extract = (entry: TocEntry): Uint8Array => {
    const out = new Uint8Array(entry.length);
    let written = 0;
    let position = entry.offset;
    let block = entry.firstBlock;
    while (written < entry.length) {
      if (block >= blockSizes.length) throw new PsarcError('corrupt-toc');
      const stored = blockSizes[block] || blockSize;
      block += 1;
      const chunk = bytes.subarray(position, position + stored);
      position += stored;
      const data = inflateBlock(chunk);
      const take = Math.min(data.length, entry.length - written);
      out.set(data.subarray(0, take), written);
      written += take;
    }
    return out;
  };

  if (entries.length === 0) throw new PsarcError('corrupt-toc');
  const names = new TextDecoder()
    .decode(extract(entries[0]))
    .split(/\r?\n/)
    .filter((name) => name.length > 0);
  const byName = new Map(names.map((name, i) => [name, entries[i + 1]]));

  return {
    names,
    read(name) {
      const entry = byName.get(name);
      if (!entry) throw new PsarcError('missing-entry');
      return extract(entry);
    },
  };
}

/**
 * A block is zlib data unless it was stored raw because compression did not
 * help. Raw blocks can start with any bytes, so a zlib-looking header that
 * fails to inflate is treated as raw data too.
 */
function inflateBlock(chunk: Uint8Array): Uint8Array {
  if (chunk.length > 2 && chunk[0] === 0x78) {
    try {
      return unzlibSync(chunk);
    } catch {
      return chunk;
    }
  }
  return chunk;
}

/**
 * AES-CFB128 decryption with a zero IV. Web Crypto has no CFB mode, but each
 * keystream block is just AES(previous ciphertext block), and AES-CBC with a
 * zero IV over a single block computes exactly that.
 */
export async function decryptCfb(
  cipher: Uint8Array,
  rawKey: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', rawKey, 'AES-CBC', false, [
    'encrypt',
  ]);
  const zeroIv = new Uint8Array(16);
  const blockCount = Math.ceil(cipher.length / 16);
  const keystream = await Promise.all(
    Array.from({ length: blockCount }, async (_, i) => {
      const previous = i === 0 ? zeroIv : cipher.slice((i - 1) * 16, i * 16);
      const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-CBC', iv: zeroIv },
        key,
        previous,
      );
      return new Uint8Array(encrypted, 0, 16);
    }),
  );
  const plain = new Uint8Array(cipher.length);
  for (let i = 0; i < cipher.length; i += 1) {
    plain[i] = cipher[i] ^ keystream[i >> 4][i & 15];
  }
  return plain;
}

function readUint(bytes: Uint8Array, at: number, width: number): number {
  let value = 0;
  for (let i = 0; i < width; i += 1) value = value * 256 + bytes[at + i];
  return value;
}

function ascii(bytes: Uint8Array, at: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(at, at + length));
}

export function hexBytes(hex: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}
