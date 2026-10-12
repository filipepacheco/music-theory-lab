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

// The percussion channel of a MIDI file holds the drum part, with General
// MIDI numbers. This module puts its hits on the bar grid that the bass chart
// of the same file uses.

/** The General MIDI percussion channel, 0-based. */
export const DRUM_CHANNEL = 9;
/** A channel with no note: it gives the bar grid alone. */
const NO_CHANNEL = -1;
/**
 * The position of a hit is a whole number of these. It covers the 32nd note
 * and the sextuplet, which the twelfths of the bass chart do not.
 */
export const DRUM_TICKS_PER_BEAT = 48;

/** A hit this much softer than the usual one of its piece is a ghost note. */
export const GHOST_RATIO = 0.6;
/** A hit this much louder than the usual one of its piece is an accent. */
export const ACCENT_RATIO = 1.3;

/**
 * A MIDI file has no score, so the ghost note and the accent come from the
 * velocity of the hit against the median velocity of its drum piece in the
 * file. A piece with a single level of velocity has only normal hits.
 */
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

/**
 * The drum chart of a MIDI file, or null when its percussion channel is
 * empty. All percussion tracks share that channel, so they make one chart.
 * `dynamicOf` gives the ghost note or the accent of a hit, when the source
 * knows it.
 */
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

  // The bass chart builder owns the bars and the sections. A chart with no
  // note gives them, so the two parts of one file cannot differ.
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
    // The notes come in time order, so the bar only moves forward.
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
