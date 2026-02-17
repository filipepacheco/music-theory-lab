import { NOTE_NAMES, NOTE_NAMES_FLAT, FLAT_KEYS } from "@/constants/notes";

/**
 * Get the display name of a note index (0-11), choosing sharps or flats
 * based on the current key context.
 */
export function getNoteName(noteIndex: number, rootName?: string): string {
  const idx = ((noteIndex % 12) + 12) % 12;
  if (rootName && FLAT_KEYS.has(rootName)) {
    return NOTE_NAMES_FLAT[idx];
  }
  return NOTE_NAMES[idx];
}

/**
 * Convert a note index + octave to a Tone.js-compatible string (e.g. "C4", "F#3").
 */
export function noteToToneString(noteIndex: number, octave: number): string {
  const idx = ((noteIndex % 12) + 12) % 12;
  const name = NOTE_NAMES[idx];
  return `${name}${octave}`;
}

/**
 * Convert a MIDI note number to a note name + octave string.
 */
export function midiToNoteName(midi: number): string {
  const noteIndex = midi % 12;
  const octave = Math.floor(midi / 12) - 1;
  return `${NOTE_NAMES[noteIndex]}${octave}`;
}

/**
 * Get the preferred display name for a root note, choosing flats for
 * keys that conventionally use flat notation (F, Bb, Eb, Ab, Db, Gb).
 */
export function getPreferredRootName(noteIndex: number): string {
  const idx = ((noteIndex % 12) + 12) % 12;
  const flatName = NOTE_NAMES_FLAT[idx];
  if (FLAT_KEYS.has(flatName)) {
    return flatName;
  }
  return NOTE_NAMES[idx];
}

/**
 * Compute a per-note octave map matching the chord voicing used for audio
 * playback. Notes that wrap around (index decreases) get bumped to the next
 * octave so the visual highlight matches the ascending voicing.
 */
export function computeVoicingOctaveMap(
  noteIndices: number[],
  baseOctave: number,
): Record<number, number> {
  const map: Record<number, number> = {};
  let currentOctave = baseOctave;
  let prevSemitone = -1;
  for (const n of noteIndices) {
    if (n <= prevSemitone) {
      currentOctave++;
    }
    map[n] = currentOctave;
    prevSemitone = n;
  }
  return map;
}

/**
 * Get the note index (0-11) from a note name string.
 */
export function noteNameToIndex(name: string): number {
  let idx = NOTE_NAMES.indexOf(name as (typeof NOTE_NAMES)[number]);
  if (idx === -1) {
    idx = NOTE_NAMES_FLAT.indexOf(name as (typeof NOTE_NAMES_FLAT)[number]);
  }
  return idx;
}
