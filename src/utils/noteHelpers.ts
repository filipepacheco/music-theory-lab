import { NOTE_NAMES, NOTE_NAMES_FLAT, FLAT_KEYS } from '@/constants/notes';

export function getNoteName(noteIndex: number, rootName?: string): string {
  const idx = ((noteIndex % 12) + 12) % 12;
  if (rootName && FLAT_KEYS.has(rootName)) {
    return NOTE_NAMES_FLAT[idx];
  }
  return NOTE_NAMES[idx];
}

export function noteToToneString(noteIndex: number, octave: number): string {
  const idx = ((noteIndex % 12) + 12) % 12;
  const name = NOTE_NAMES[idx];
  return `${name}${octave}`;
}

export function midiToNoteName(midi: number): string {
  const noteIndex = midi % 12;
  const octave = Math.floor(midi / 12) - 1;
  return `${NOTE_NAMES[noteIndex]}${octave}`;
}

export function getPreferredRootName(noteIndex: number): string {
  const idx = ((noteIndex % 12) + 12) % 12;
  const flatName = NOTE_NAMES_FLAT[idx];
  if (FLAT_KEYS.has(flatName)) {
    return flatName;
  }
  return NOTE_NAMES[idx];
}

export interface VoicedNote {
  note: number;
  octave: number;
}

export function ascendVoicing(
  noteIndices: number[],
  baseOctave: number,
): VoicedNote[] {
  const voiced: VoicedNote[] = [];
  let currentOctave = baseOctave;
  let prevSemitone = -1;
  for (const n of noteIndices) {
    if (n <= prevSemitone) {
      currentOctave++;
    }
    voiced.push({ note: n, octave: currentOctave });
    prevSemitone = n;
  }
  return voiced;
}

export function computeVoicingOctaveMap(
  noteIndices: number[],
  baseOctave: number,
): Record<number, number> {
  const map: Record<number, number> = {};
  for (const { note, octave } of ascendVoicing(noteIndices, baseOctave)) {
    map[note] = octave;
  }
  return map;
}

export function noteNameToIndex(name: string): number {
  let idx = NOTE_NAMES.indexOf(name as (typeof NOTE_NAMES)[number]);
  if (idx === -1) {
    idx = NOTE_NAMES_FLAT.indexOf(name as (typeof NOTE_NAMES_FLAT)[number]);
  }
  return idx;
}
