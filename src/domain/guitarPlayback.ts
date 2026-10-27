import type { GuitarChartNote } from '@/domain/guitarChart';

const MIN_NOTE_SECONDS = 0.1;
const MUTED_NOTE_SECONDS = 0.06;

/** One note of a guitar chart for the plucked-string synth. */
export interface GuitarSynthNote {
  time: number;
  midi: number;
  string: number;
  seconds: number;
}

/**
 * The notes of a guitar chart as the synth plays them: the sounding pitch,
 * and a length. A note rings to its written length, or to the next onset on
 * its own string when that comes first. A muted note is short.
 */
export function guitarSynthNotes(
  notes: readonly GuitarChartNote[],
): GuitarSynthNote[] {
  const nextOnsetOnString = new Map<number, number>();
  const result: GuitarSynthNote[] = new Array(notes.length);
  for (let i = notes.length - 1; i >= 0; i -= 1) {
    const note = notes[i];
    const written = note.sustain > 0 ? note.sustain : note.endTime - note.time;
    const next = nextOnsetOnString.get(note.string) ?? Infinity;
    const seconds = note.techniques.includes('mute')
      ? MUTED_NOTE_SECONDS
      : Math.max(MIN_NOTE_SECONDS, Math.min(written, next - note.time));
    result[i] = {
      time: note.time,
      midi: note.midi,
      string: note.string,
      seconds,
    };
    nextOnsetOnString.set(note.string, note.time);
  }
  return result;
}
