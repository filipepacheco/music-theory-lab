import type { VocalChartNote } from '@/domain/vocalChart';

const MIN_NOTE_SECONDS = 0.1;

/** One note of a vocal chart for the soft lead synth. */
export interface VocalSynthNote {
  time: number;
  midi: number;
  seconds: number;
}

/**
 * The notes of a vocal chart as the lead synth plays them. Each note keeps its
 * own entry, also notes that sound at once, and rings to its written length.
 */
export function vocalSynthNotes(
  notes: readonly VocalChartNote[],
): VocalSynthNote[] {
  return notes.map((note) => ({
    time: note.time,
    midi: note.midi,
    seconds: Math.max(
      MIN_NOTE_SECONDS,
      note.sustain > 0 ? note.sustain : note.endTime - note.time,
    ),
  }));
}
