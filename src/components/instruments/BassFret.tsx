import { memo } from "react";
import NoteIndicator from "./NoteIndicator";

interface BassFretProps {
  noteIndex: number;
  noteName: string;
  isHighlighted: boolean;
  hasAnyHighlights: boolean;
  showAllNotes: boolean;
  isOpenString: boolean;
  hasFretMarker: boolean;
  isOctaveStart: boolean;
  octave: number;
  onClick: (noteIndex: number, octave: number) => void;
}

const OCTAVE_COLORS: Record<number, string> = {
  1: "rgba(251, 191, 36, 0.75)",  // amber
  2: "rgba(94, 234, 212, 0.75)", // teal
  3: "rgba(147, 197, 253, 0.75)", // blue
};

const DIMMED_OCTAVE_COLORS: Record<number, string> = {
  1: "rgba(251, 191, 36, 0.25)",
  2: "rgba(94, 234, 212, 0.25)",
  3: "rgba(147, 197, 253, 0.25)",
};

const BASS_HIGHLIGHT_COLOR = "#34d399"; // bright emerald green

const BassFret = memo(function BassFret({
  noteIndex,
  noteName,
  isHighlighted,
  hasAnyHighlights,
  showAllNotes,
  isOpenString,
  hasFretMarker,
  isOctaveStart,
  octave,
  onClick,
}: BassFretProps) {
  const shouldShowNote = isHighlighted || showAllNotes;

  return (
    <button
      onPointerDown={() => onClick(noteIndex, octave)}
      aria-label={`${noteName}${isOpenString ? " (corda solta)" : ""}`}
      className={`
        h-14 flex items-center justify-center relative cursor-pointer transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-accent focus-visible:z-20
        ${isOpenString ? "bg-bg-tertiary border-r-2 border-r-text-muted" : "border-r border-r-fret-border bg-fret-bg hover:bg-bg-hover"}
        ${isOctaveStart ? "border-l-[3px] border-l-accent/60 bg-white/[0.03]" : ""}
      `}
    >
      {/* String line */}
      <div className="absolute inset-x-0 top-1/2 h-[2px] bg-string" />

      {/* Fret marker */}
      {hasFretMarker && (
        <div className="absolute bottom-0.5 w-2 h-2 rounded-full bg-text-muted opacity-40" />
      )}

      {/* Note indicator */}
      <div className="relative z-10">
        {shouldShowNote ? (
          isHighlighted ? (
            <NoteIndicator noteName={noteName} color={BASS_HIGHLIGHT_COLOR} size="lg" />
          ) : (
            <span
              className={`w-7 h-7 rounded-full flex items-center justify-center font-mono font-bold text-xs shrink-0 ${hasAnyHighlights ? "text-bg-primary/50" : "text-bg-primary"}`}
              style={{
                backgroundColor:
                  (hasAnyHighlights ? DIMMED_OCTAVE_COLORS : OCTAVE_COLORS)[
                    octave
                  ] ?? "rgba(255,255,255,0.3)",
              }}
            >
              {noteName}
            </span>
          )
        ) : null}
      </div>
    </button>
  );
});

export default BassFret;
