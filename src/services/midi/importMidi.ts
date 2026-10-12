import { buildBassChart, type BassChartMetadata } from '@/domain/bassChart';
import type { Chart } from '@/domain/drumChart';
import { midiToArrangement, pickBassChannel } from '@/domain/midiBassChart';
import { dynamicsByVelocity, midiToDrumChart } from '@/domain/midiDrumChart';
import { partChartId, sha256Hex } from '@/services/chartId';
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
      return 'Este MIDI não tem baixo nem bateria.';
    default:
      return 'Não foi possível importar este arquivo MIDI.';
  }
}

/**
 * A MIDI file carries no recording: the charts are imported without audio and
 * the user attaches one, which only lines up if the file follows its timing.
 * A file gives one chart for each part that it has, the bass chart first, and
 * it asks no question about tracks.
 */
export async function importMidi(
  file: Blob & { name: string },
  now: Date = new Date(),
): Promise<{ charts: Chart[]; audio: null }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const fileHash = await sha256Hex(bytes);

  const charts: Chart[] = [];
  try {
    const midi = parseMidi(bytes);
    const channel = pickBassChannel(midi);
    const shared = {
      sourceFileName: file.name,
      importedAt: now.toISOString(),
      metadata: metadataFromFileName(file.name),
      source: 'midi' as const,
    };
    if (channel !== null) {
      charts.push(
        buildBassChart({
          ...shared,
          // The id of the bass chart stays the hash of the file.
          id: await partChartId(fileHash, 'bass'),
          arrangement: midiToArrangement(midi, channel),
        }),
      );
    }
    const drums = midiToDrumChart({
      ...shared,
      id: await partChartId(fileHash, 'drums'),
      midi,
      dynamicOf: dynamicsByVelocity(midi),
    });
    if (drums) charts.push(drums);
  } catch (error) {
    if (error instanceof MidiImportError) throw error;
    const kind = error instanceof MidiError ? error.message : null;
    throw new MidiImportError(
      kind === 'not-midi' || kind === 'unsupported' ? kind : 'corrupt',
    );
  }
  if (charts.length === 0) throw new MidiImportError('no-bass');
  return { charts, audio: null };
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
