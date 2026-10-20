import {
  beatPosition,
  buildBassChart,
  type BassChartMetadata,
} from '@/domain/bassChart';
import {
  drumSoundOf,
  type DrumChart,
  type DrumDynamic,
  type DrumHit,
} from '@/domain/drumChart';
import { midiToArrangement, tickToSeconds } from '@/domain/midiBassChart';
import type { MidiFile, MidiNote } from '@/services/midi/midiFile';

export const DRUM_CHANNEL = 9;
const NO_CHANNEL = -1;
export const DRUM_TICKS_PER_BEAT = 48;

export const GHOST_RATIO = 0.6;
export const ACCENT_RATIO = 1.3;

export function dynamicsByVelocity(
  midi: MidiFile,
): (note: MidiNote) => DrumDynamic {
  const velocities = new Map<string, number[]>();
  for (const note of midi.notes) {
    if (note.channel !== DRUM_CHANNEL) continue;
    const { piece } = drumSoundOf(note.pitch);
    velocities.set(piece, [...(velocities.get(piece) ?? []), note.velocity]);
  }
  const usual = new Map<string, number>();
  for (const [piece, list] of velocities) {
    const sorted = [...list].sort((a, b) => a - b);
    const middle = sorted.length >> 1;
    usual.set(
      piece,
      sorted.length % 2
        ? sorted[middle]
        : (sorted[middle - 1] + sorted[middle]) / 2,
    );
  }
  return (note) => {
    const reference = usual.get(drumSoundOf(note.pitch).piece);
    if (reference === undefined) return 'normal';
    if (note.velocity <= reference * GHOST_RATIO) return 'ghost';
    if (note.velocity >= reference * ACCENT_RATIO) return 'accent';
    return 'normal';
  };
}

export function hasDrumNotes(midi: MidiFile): boolean {
  return midi.notes.some((note) => note.channel === DRUM_CHANNEL);
}

export function midiToDrumChart(input: {
  id: string;
  sourceFileName: string;
  source: DrumChart['source'];
  importedAt: string;
  metadata: BassChartMetadata;
  midi: MidiFile;
  dynamicOf?: (note: MidiNote) => DrumDynamic;
}): DrumChart | null {
  const { midi } = input;
  const played = midi.notes.filter((note) => note.channel === DRUM_CHANNEL);
  if (played.length === 0) return null;

  const arrangement = midiToArrangement(midi, NO_CHANNEL);
  const grid = buildBassChart({
    id: input.id,
    sourceFileName: input.sourceFileName,
    importedAt: input.importedAt,
    metadata: input.metadata,
    source: input.source,
    arrangement,
  });
  const beatTimes = arrangement.beats.map((beat) => beat.time);
  const barStartBeats = arrangement.beats.flatMap((beat, index) =>
    beat.beat === 0 ? [index] : [],
  );
  const toSeconds = tickToSeconds(midi);

  let bar = 0;
  const hits: DrumHit[] = played.map((note) => {
    const time = toSeconds(note.startTick);
    const tick = Math.max(
      0,
      Math.round(beatPosition(beatTimes, time) * DRUM_TICKS_PER_BEAT),
    );
    while (
      bar + 1 < barStartBeats.length &&
      barStartBeats[bar + 1] * DRUM_TICKS_PER_BEAT <= tick
    )
      bar += 1;
    return {
      time,
      bar,
      beatInBar:
        (tick - barStartBeats[bar] * DRUM_TICKS_PER_BEAT) / DRUM_TICKS_PER_BEAT,
      ...drumSoundOf(note.pitch),
      dynamic: input.dynamicOf?.(note) ?? 'normal',
      intensity: note.velocity,
      midi: note.pitch,
    };
  });

  return {
    schemaVersion: 1,
    id: input.id,
    part: 'drums',
    sourceFileName: input.sourceFileName,
    source: input.source,
    importedAt: input.importedAt,
    title: input.metadata.title,
    artist: input.metadata.artist,
    album: input.metadata.album,
    year: input.metadata.year,
    songLengthSeconds: grid.songLengthSeconds,
    averageTempoBpm: grid.averageTempoBpm,
    bars: grid.bars,
    sections: grid.sections,
    hits,
  };
}
