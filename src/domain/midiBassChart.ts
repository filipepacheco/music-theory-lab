import { STANDARD_OPEN_MIDI } from '@/domain/bassChart';
import type { MidiFile } from '@/services/midi/midiFile';
import type {
  SngArrangement,
  SngBeat,
  SngNote,
} from '@/services/rocksmith/sng';

// A MIDI file says which pitches a bass plays and when, but not where on the
// neck. This module turns one MIDI channel into the arrangement shape the
// bass chart is built from, suggesting a string and fret for every note.

const DRUM_CHANNEL = 9;
/** General MIDI programs 33–40: acoustic, finger, pick, fretless, slap, synth. */
const FIRST_BASS_PROGRAM = 32;
const LAST_BASS_PROGRAM = 39;
const DEFAULT_MICROS_PER_QUARTER = 500_000;
const MAX_FRET = 24;
const BEND_MASK = 0x1000;
/** Shown as the only section of a file without markers. */
const WHOLE_SONG_SECTION = 'Música';

/**
 * The channel that carries the bass line: the busiest one on a General MIDI
 * bass program, otherwise the lowest-pitched melodic channel. Null when the
 * file has no melodic notes at all.
 */
export function pickBassChannel(midi: MidiFile): number | null {
  const pitches = new Map<number, number[]>();
  for (const note of midi.notes) {
    if (note.channel === DRUM_CHANNEL) continue;
    const list = pitches.get(note.channel) ?? [];
    list.push(note.pitch);
    pitches.set(note.channel, list);
  }
  const channels = [...pitches.keys()].sort((a, b) => a - b);
  if (channels.length === 0) return null;

  const basses = channels.filter((channel) => {
    const program = midi.programs[channel] ?? 0;
    return program >= FIRST_BASS_PROGRAM && program <= LAST_BASS_PROGRAM;
  });
  if (basses.length > 0) {
    return basses.reduce((best, channel) =>
      pitches.get(channel)!.length > pitches.get(best)!.length ? channel : best,
    );
  }
  const median = (channel: number) => {
    const sorted = [...pitches.get(channel)!].sort((a, b) => a - b);
    return sorted[sorted.length >> 1];
  };
  return channels.reduce((best, channel) =>
    median(channel) < median(best) ? channel : best,
  );
}

/**
 * One channel of a MIDI file as a single-level arrangement on the file's own
 * tempo map: a beat per time-signature beat, a section per marker, and every
 * note placed on a four-string bass by `suggestFingering`.
 */
export function midiToArrangement(
  midi: MidiFile,
  channel: number,
  importedTuning?: number[],
): SngArrangement {
  const toSeconds = tickToSeconds(midi);
  const played = midi.notes.filter((n) => n.channel === channel);
  const tuning = importedTuning ?? tuningFor(played.map((n) => n.pitch));
  const openPitches = STANDARD_OPEN_MIDI.map((open, i) => open + tuning[i]);
  const highest = openPitches[openPitches.length - 1] + MAX_FRET;

  const timed = played.map((note) => {
    // Above the last fret there is nowhere to play it: drop it an octave.
    let pitch = note.pitch;
    while (pitch > highest) pitch -= 12;
    return { note, pitch, time: toSeconds(note.startTick) };
  });
  const fingering = suggestFingering(timed, openPitches);
  const notes: SngNote[] = timed.map(({ note, time }, i) => ({
    mask: note.bent ? BEND_MASK : 0,
    time,
    string: fingering[i].string,
    fret: fingering[i].fret,
    chordId: -1,
    phraseIterationId: 0,
    slideTo: -1,
    slideUnpitchTo: -1,
    sustain: toSeconds(note.endTick) - time,
  }));

  const songLength = toSeconds(midi.endTick);
  const sections = midi.markers.map((marker, i) => ({
    name: marker.text,
    startTime: toSeconds(marker.tick),
    endTime: toSeconds(midi.markers[i + 1]?.tick ?? midi.endTick),
  }));
  return {
    beats: beatGrid(midi, toSeconds),
    phrases: [{ name: 'midi', maxDifficulty: 0 }],
    chordTemplates: [],
    phraseIterations: [{ phraseId: 0, startTime: 0 }],
    sections:
      sections.length > 0
        ? sections
        : [{ name: WHOLE_SONG_SECTION, startTime: 0, endTime: songLength }],
    levels: [{ difficulty: 0, notes }],
    metadata: { songLength, capoFret: -1, tuning },
  };
}

/** Seconds elapsed at a tick, following every tempo change in the file. */
export function tickToSeconds(midi: MidiFile): (tick: number) => number {
  const segments = [
    { tick: 0, seconds: 0, microsPerQuarter: DEFAULT_MICROS_PER_QUARTER },
  ];
  for (const tempo of midi.tempos) {
    const last = segments[segments.length - 1];
    const seconds =
      last.seconds +
      ((tempo.tick - last.tick) * last.microsPerQuarter) /
        midi.ticksPerQuarter /
        1e6;
    const segment = { ...tempo, seconds };
    if (tempo.tick === last.tick) segments[segments.length - 1] = segment;
    else segments.push(segment);
  }
  return (tick) => {
    let segment = segments[0];
    for (const candidate of segments) {
      if (candidate.tick > tick) break;
      segment = candidate;
    }
    return (
      segment.seconds +
      ((tick - segment.tick) * segment.microsPerQuarter) /
        midi.ticksPerQuarter /
        1e6
    );
  };
}

/**
 * Beats from tick 0 to the end of the bar the file ends in. A beat is the
 * time signature's own unit (an eighth note in 6/8); a signature change in
 * the middle of a bar cuts that bar short.
 */
function beatGrid(
  midi: MidiFile,
  toSeconds: (tick: number) => number,
): SngBeat[] {
  const signatures = [{ tick: 0, numerator: 4, denominator: 4 }];
  for (const signature of midi.timeSignatures) {
    if (signature.tick === signatures[signatures.length - 1].tick) {
      signatures[signatures.length - 1] = signature;
    } else {
      signatures.push(signature);
    }
  }

  const beats: SngBeat[] = [];
  let measure = 0;
  signatures.forEach((signature, i) => {
    const beatTicks = (midi.ticksPerQuarter * 4) / signature.denominator;
    const next = signatures[i + 1];
    let tick = signature.tick;
    let beat = 0;
    // The last signature runs until its final bar is complete.
    while (next ? tick < next.tick : tick < midi.endTick || beat !== 0) {
      beats.push({ time: toSeconds(tick), measure, beat });
      tick += beatTicks;
      beat += 1;
      if (beat === signature.numerator) {
        beat = 0;
        measure += 1;
      }
    }
    if (beat !== 0) measure += 1;
  });
  return beats;
}

/**
 * Semitone offsets from E-A-D-G that reach the lowest note: standard when it
 * fits, a dropped fourth string for a whole step or less, and otherwise every
 * string lowered together (B-E-A-D for a five-string's low B).
 */
function tuningFor(pitches: number[]): number[] {
  const lowest = pitches.reduce((min, pitch) => Math.min(min, pitch), Infinity);
  const below = STANDARD_OPEN_MIDI[0] - lowest;
  if (!Number.isFinite(below) || below <= 0) return [0, 0, 0, 0];
  if (below <= 2) return [-below, 0, 0, 0];
  return [-below, -below, -below, -below];
}

export interface FretPosition {
  /** 0 = lowest string. */
  string: number;
  fret: number;
}

const FRET_COST = 0.1;
/** An open string costs about as much as the third fret. */
const OPEN_STRING_COST = 0.3;
const STRING_CHANGE_COST = 0.15;
/** Frets the hand covers without moving. */
const HAND_SPAN = 3;
const SHIFT_COST = 1;
/** After a rest this long the hand has time to move. */
const REST_SECONDS = 2;
const REST_DISCOUNT = 0.25;
const STRING_CLASH_COST = 1000;

interface FingeringState extends FretPosition {
  cost: number;
  previous: number;
  /** Fret of the last stopped note on the way here; open strings keep it. */
  anchor: number | null;
}

/**
 * A playable string and fret for each note, in order. The cheapest path
 * through every possible position prefers low frets, keeps the hand inside a
 * four-fret span, and charges for shifts and string crossings. Notes with the
 * same `time` must be given low to high and land on separate strings.
 */
export function suggestFingering(
  notes: { pitch: number; time: number }[],
  openPitches: number[],
): FretPosition[] {
  const layers: FingeringState[][] = [];
  notes.forEach((note, i) => {
    const before = layers[i - 1];
    const gap = i > 0 ? note.time - notes[i - 1].time : Infinity;
    const layer = positionsFor(note.pitch, openPitches).map((position) => {
      const own =
        position.fret === 0 ? OPEN_STRING_COST : position.fret * FRET_COST;
      const state: FingeringState = {
        ...position,
        cost: before ? Infinity : own,
        previous: -1,
        anchor: position.fret || null,
      };
      before?.forEach((from, index) => {
        const cost = from.cost + own + moveCost(from, position, gap);
        if (cost < state.cost) {
          state.cost = cost;
          state.previous = index;
          state.anchor = position.fret || from.anchor;
        }
      });
      return state;
    });
    layers.push(layer);
  });

  const path: FretPosition[] = [];
  let index = cheapest(layers[layers.length - 1] ?? []);
  for (let i = layers.length - 1; i >= 0; i -= 1) {
    const { string, fret, previous } = layers[i][index];
    path.unshift({ string, fret });
    index = previous;
  }
  return path;
}

function positionsFor(pitch: number, openPitches: number[]): FretPosition[] {
  const positions = openPitches
    .map((open, string) => ({ string, fret: pitch - open }))
    .filter((p) => p.fret >= 0 && p.fret <= MAX_FRET);
  if (positions.length === 0) {
    throw new Error(`pitch ${pitch} is not playable in this tuning`);
  }
  return positions;
}

function moveCost(from: FingeringState, to: FretPosition, gap: number): number {
  if (gap === 0 && to.string <= from.string) return STRING_CLASH_COST;
  const crossing = Math.abs(to.string - from.string) * STRING_CHANGE_COST;
  if (to.fret === 0 || from.anchor === null) return crossing;
  const shift = Math.abs(to.fret - from.anchor);
  const reach =
    shift <= HAND_SPAN
      ? shift * FRET_COST
      : HAND_SPAN * FRET_COST + (shift - HAND_SPAN) * SHIFT_COST;
  return crossing + reach * (gap > REST_SECONDS ? REST_DISCOUNT : 1);
}

function cheapest(layer: FingeringState[]): number {
  let best = 0;
  layer.forEach((state, index) => {
    if (state.cost < layer[best].cost) best = index;
  });
  return best;
}
