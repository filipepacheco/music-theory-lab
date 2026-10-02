import {
  buildBassChart,
  type BassChart,
  type BassChartMetadata,
} from '@/domain/bassChart';
import { midiToArrangement, pickBassChannel } from '@/domain/midiBassChart';
import { MidiError, parseMidi } from '@/services/midi/midiFile';

export type MidiImportErrorKind =
  | 'not-midi'
  | 'unsupported'
  | 'no-bass'
  | 'corrupt';

export class MidiImportError extends Error {
  constructor(readonly kind: MidiImportErrorKind) {
    super(kind);
    this.name = 'MidiImportError';
  }
}

/** User-facing (pt-BR) message for an import failure. */
export function midiImportErrorMessage(error: unknown): string {
  const kind = error instanceof MidiImportError ? error.kind : null;
  switch (kind) {
    case 'not-midi':
      return 'Este arquivo não é um MIDI (.mid).';
    case 'unsupported':
      return 'Este tipo de MIDI não é suportado (formato 2 ou tempo SMPTE).';
    case 'no-bass':
      return 'Este MIDI não tem notas além da bateria.';
    default:
      return 'Não foi possível importar este arquivo MIDI.';
  }
}

/**
 * A MIDI file carries no recording: the chart is imported without audio and
 * the user attaches one, which only lines up if the file follows its timing.
 */
export async function importMidi(
  file: Blob & { name: string },
  now: Date = new Date(),
): Promise<{ chart: BassChart; audio: null }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const id = await sha256Hex(bytes);

  let chart: BassChart;
  try {
    const midi = parseMidi(bytes);
    const channel = pickBassChannel(midi);
    if (channel === null) throw new MidiImportError('no-bass');
    chart = buildBassChart({
      id,
      sourceFileName: file.name,
      importedAt: now.toISOString(),
      metadata: metadataFromFileName(file.name),
      arrangement: midiToArrangement(midi, channel),
      source: 'midi',
    });
  } catch (error) {
    if (error instanceof MidiImportError) throw error;
    const kind = error instanceof MidiError ? error.message : null;
    throw new MidiImportError(
      kind === 'not-midi' || kind === 'unsupported' ? kind : 'corrupt',
    );
  }
  return { chart, audio: null };
}

/**
 * MIDI files rarely name the song inside, so it comes from the file name:
 * `Title - Artist.mid`, with underscores standing in for spaces.
 */
export function metadataFromFileName(name: string): BassChartMetadata {
  const [title, ...artist] = name
    .replace(/\.[^.]+$/, '')
    .replace(/_/g, ' ')
    .split(' - ')
    .map((part) => part.trim());
  return { title, artist: artist.join(' - '), album: '', year: null };
}

async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}
