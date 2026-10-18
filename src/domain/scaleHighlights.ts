export type ScaleHighlightKind = 'a' | 'b' | 'shared';

export interface ScaleHighlights {
  notes: number[];
  kinds: ScaleHighlightKind[];
}

export function classifyScaleNotes(
  notesA: number[],
  notesB: number[] | null,
): ScaleHighlights {
  if (!notesB) {
    return { notes: notesA, kinds: notesA.map(() => 'a') };
  }

  const setB = new Set(notesB);
  const notes = [...new Set([...notesA, ...notesB])];
  const kinds: ScaleHighlightKind[] = notes.map((note) => {
    const inA = notesA.includes(note);
    const inB = setB.has(note);
    if (inA && inB) return 'shared';
    return inA ? 'a' : 'b';
  });

  return { notes, kinds };
}
