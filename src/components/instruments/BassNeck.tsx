import { useMemo, useState } from "react";
import { useAppStore } from "@/store/useAppStore";
import { useSynth } from "@/hooks/useSynth";
import { getNoteName, computeVoicingOctaveMap } from "@/utils/noteHelpers";
import BassFret from "./BassFret";

// Standard bass tuning: E1, A1, D2, G2 (note indices)
const TUNING = [4, 9, 2, 7]; // E, A, D, G
const TUNING_OCTAVES = [1, 1, 2, 2]; // E1, A1, D2, G2
// Display order: G (highest) to E (lowest), top to bottom
const DISPLAY_ORDER = [3, 2, 1, 0]; // G, D, A, E
const STRING_LABELS = ["G", "D", "A", "E"];
const FRET_COUNT = 12;
const FRET_MARKERS = new Set([3, 5, 7, 9, 12]);

export default function BassNeck() {
  const highlightedNotes = useAppStore((s) => s.highlightedNotes);
  const highlightRootName = useAppStore((s) => s.highlightRootName);
  const highlightOctaveMap = useAppStore((s) => s.highlightOctaveMap);
  const rootNote = useAppStore((s) => s.rootNote);
  const { playNote } = useSynth();
  const [showAllNotes, setShowAllNotes] = useState(false);

  const rootNoteName = highlightRootName ?? getNoteName(rootNote);
  const hasAnyHighlights = highlightedNotes.length > 0;

  // When a chord voicing is active, compute exact (string, fret) positions
  // so each chord tone appears once on the bass, like the piano.
  // Pick the lowest-fret position for each note (most natural fingering).
  const bassHighlightPositions = useMemo(() => {
    if (highlightOctaveMap === null) return null;
    const octaveMap = computeVoicingOctaveMap(highlightedNotes, 1);
    const positions = new Set<string>();

    for (const noteIdx of highlightedNotes) {
      const targetOctave = octaveMap[noteIdx];
      if (targetOctave === undefined) continue;

      let bestString = -1;
      let bestFret = FRET_COUNT + 1;

      // Try target octave first, then octave+1 as fallback
      // (e.g. D1 doesn't exist on bass - lowest note is E1)
      for (const tryOctave of [targetOctave, targetOctave + 1]) {
        for (let si = 0; si < 4; si++) {
          const open = TUNING[si];
          for (let f = 0; f <= FRET_COUNT; f++) {
            if ((open + f) % 12 !== noteIdx) continue;
            const oct = Math.floor(
              (TUNING_OCTAVES[si] * 12 + open + f) / 12,
            );
            if (oct === tryOctave && f < bestFret) {
              bestFret = f;
              bestString = si;
            }
            break;
          }
        }
        if (bestString >= 0) break; // found at this octave, no fallback needed
      }

      if (bestString >= 0) {
        positions.add(`${bestString}-${bestFret}`);
      }
    }

    return positions;
  }, [highlightOctaveMap, highlightedNotes]);

  const handleNoteClick = (noteIndex: number, octave: number) => {
    playNote(noteIndex, octave);
  };

  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-heading text-sm text-text-secondary">
          Baixo (4 cordas)
        </h3>
        <button
          onClick={() => setShowAllNotes(!showAllNotes)}
          className={`text-xs font-medium px-2.5 py-1 rounded-md border transition-colors cursor-pointer ${
            showAllNotes
              ? "border-accent bg-accent/15 text-accent"
              : "border-border-default bg-bg-tertiary text-text-muted hover:text-text-secondary"
          }`}
        >
          {showAllNotes ? "Todas as notas" : "Apenas acordes"}
        </button>
      </div>
      <div className="overflow-x-auto min-w-0">
        {/* Fret numbers */}
        <div
          className="grid gap-0 mb-1"
          style={{
            gridTemplateColumns: `44px repeat(${FRET_COUNT + 1}, minmax(44px, 1fr))`,
          }}
        >
          <div />
          {Array.from({ length: FRET_COUNT + 1 }, (_, fret) => (
            <div
              key={fret}
              className="text-center text-xs text-text-muted font-mono"
            >
              {fret === 0 ? "" : fret}
            </div>
          ))}
        </div>

        {/* Strings */}
        {DISPLAY_ORDER.map((stringIdx, rowIdx) => {
          const openNote = TUNING[stringIdx];
          return (
            <div
              key={stringIdx}
              className="grid gap-0"
              style={{
                gridTemplateColumns: `44px repeat(${FRET_COUNT + 1}, minmax(44px, 1fr))`,
              }}
            >
              {/* String label */}
              <div className="flex items-center justify-center text-sm font-mono text-text-secondary">
                {STRING_LABELS[rowIdx]}
              </div>

              {/* Frets (0 = open string) */}
              {Array.from({ length: FRET_COUNT + 1 }, (_, fret) => {
                const noteIndex = (openNote + fret) % 12;
                const noteName = getNoteName(noteIndex, rootNoteName);
                const octave = Math.floor(
                  (TUNING_OCTAVES[stringIdx] * 12 + openNote + fret) / 12,
                );
                const prevOctave = fret > 0
                  ? Math.floor((TUNING_OCTAVES[stringIdx] * 12 + openNote + fret - 1) / 12)
                  : octave;
                const isOctaveStart = fret > 0 && octave !== prevOctave;
                const isHighlighted =
                  bassHighlightPositions !== null
                    ? bassHighlightPositions.has(`${stringIdx}-${fret}`)
                    : highlightedNotes.includes(noteIndex);

                return (
                  <BassFret
                    key={fret}
                    noteIndex={noteIndex}
                    noteName={noteName}
                    isHighlighted={isHighlighted}
                    hasAnyHighlights={hasAnyHighlights}
                    showAllNotes={showAllNotes}
                    isOpenString={fret === 0}
                    hasFretMarker={
                      FRET_MARKERS.has(fret) && rowIdx === DISPLAY_ORDER.length - 1
                    }
                    isOctaveStart={isOctaveStart}
                    octave={octave}
                    onClick={handleNoteClick}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
