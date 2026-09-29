import { buildBassChart, type BassChart } from '@/domain/bassChart';
import {
  PsarcError,
  readPsarc,
  type PsarcArchive,
} from '@/services/rocksmith/psarc';
import { SngError, decryptSng, parseSng } from '@/services/rocksmith/sng';

export type PsarcImportErrorKind =
  | 'not-psarc'
  | 'no-bass'
  | 'undecryptable'
  | 'corrupt';

export class PsarcImportError extends Error {
  constructor(readonly kind: PsarcImportErrorKind) {
    super(kind);
    this.name = 'PsarcImportError';
  }
}

/** User-facing (pt-BR) message for an import failure. */
export function psarcImportErrorMessage(error: unknown): string {
  const kind = error instanceof PsarcImportError ? error.kind : null;
  switch (kind) {
    case 'not-psarc':
      return 'Este arquivo não é um pacote Rocksmith (.psarc).';
    case 'no-bass':
      return 'Este pacote não tem arranjo de baixo.';
    case 'undecryptable':
      return 'Não foi possível abrir o arranjo de baixo deste pacote.';
    default:
      return 'Não foi possível importar este arquivo Rocksmith.';
  }
}

export interface ImportedAudio {
  blob: Blob;
  fileName: string;
}

export interface PsarcImportResult {
  chart: BassChart;
  /** Null when the package carries no song audio. */
  audio: ImportedAudio | null;
}

interface ManifestAttributes {
  SongName?: string;
  ArtistName?: string;
  AlbumName?: string;
  SongYear?: number;
}

export async function importPsarc(
  file: Blob & { name: string },
  now: Date = new Date(),
): Promise<PsarcImportResult> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const id = await sha256Hex(bytes);

  let archive: PsarcArchive;
  try {
    archive = await readPsarc(bytes);
  } catch (error) {
    throw new PsarcImportError(
      error instanceof PsarcError && error.message === 'not-psarc'
        ? 'not-psarc'
        : 'corrupt',
    );
  }

  const sngName = pickBassArrangement(archive.names);
  if (!sngName) throw new PsarcImportError('no-bass');

  let chart: BassChart;
  try {
    const arrangement = parseSng(await decryptSng(archive.read(sngName)));
    const attributes = readManifest(archive, sngName);
    chart = buildBassChart({
      id,
      sourceFileName: file.name,
      importedAt: now.toISOString(),
      metadata: {
        title: attributes?.SongName ?? stripExtension(file.name),
        artist: attributes?.ArtistName ?? '',
        album: attributes?.AlbumName ?? '',
        year: attributes?.SongYear ?? null,
      },
      arrangement,
    });
  } catch (error) {
    if (error instanceof SngError && error.message === 'undecryptable') {
      throw new PsarcImportError('undecryptable');
    }
    throw new PsarcImportError('corrupt');
  }

  return { chart, audio: await extractSongAudio(archive, chart.title) };
}

/** The main bass arrangement; a bonus `_bass2` only when it is the only one. */
export function pickBassArrangement(names: string[]): string | null {
  const bass = names
    .filter((n) => /^songs\/bin\/[^/]+\/[^/]+_bass\d*\.sng$/i.test(n))
    .sort((a, b) => a.length - b.length || a.localeCompare(b));
  return bass[0] ?? null;
}

function readManifest(
  archive: PsarcArchive,
  sngName: string,
): ManifestAttributes | null {
  const base = sngName
    .split('/')
    .pop()!
    .replace(/\.sng$/i, '');
  const manifest = archive.names.find((n) =>
    n.toLowerCase().endsWith(`/${base.toLowerCase()}.json`),
  );
  if (!manifest) return null;
  try {
    const json = JSON.parse(new TextDecoder().decode(archive.read(manifest)));
    const entry = Object.values(json.Entries ?? {})[0] as
      | { Attributes?: ManifestAttributes }
      | undefined;
    return entry?.Attributes ?? null;
  } catch {
    return null;
  }
}

/**
 * The song stream is the largest `.wem`; the other one is the short preview
 * clip the game plays in its song list.
 */
async function extractSongAudio(
  archive: PsarcArchive,
  title: string,
): Promise<ImportedAudio | null> {
  const wems = archive.names
    .filter((n) => /\.wem$/i.test(n))
    .map((name) => ({ name, bytes: archive.read(name) }))
    .sort((a, b) => b.bytes.length - a.bytes.length);
  if (wems.length === 0) return null;
  try {
    // Loaded on demand: the converter carries ~200 KB of codebook tables.
    const { wemToOgg } = await import('@/services/rocksmith/wemAudio');
    const ogg = wemToOgg(wems[0].bytes);
    return {
      blob: new Blob([ogg], { type: 'audio/ogg' }),
      fileName: `${title}.ogg`,
    };
  } catch {
    // A chart without audio is still useful: the user can attach a file.
    return null;
  }
}

async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}

function stripExtension(name: string): string {
  return name.replace(/\.[^.]+$/, '');
}
