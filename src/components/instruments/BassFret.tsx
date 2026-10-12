import { memo } from 'react';
import NoteIndicator from '@/components/instruments/NoteIndicator';

interface BassFretProps {
  noteIndex: number;
  noteName: string;
  isHighlighted: boolean;
  isRootHighlighted?: boolean;
  hasAnyHighlights: boolean;
  showAllNotes: boolean;
  isOpenString: boolean;
  hasFretMarker: boolean;
  isOctaveStart: boolean;
  octave: number;
  onClick: (noteIndex: number, octave: number) => void;
}

const OCTAVE_COLORS: Record<number, string> = {
  1: 'var(--color-octave-1)',
  2: 'var(--color-octave-2)',
  3: 'var(--color-octave-3)',
};

const DIMMED_OCTAVE_COLORS: Record<number, string> = {
  1: 'var(--color-octave-1-dim)',
  2: 'var(--color-octave-2-dim)',
  3: 'var(--color-octave-3-dim)',
};

const BASS_HIGHLIGHT_COLOR = 'var(--color-bass-highlight)';
const BASS_ROOT_HIGHLIGHT_COLOR = 'var(--color-bass-root-highlight)';

const BassFret = memo(function BassFret({
  noteIndex,
  noteName,
  isHighlighted,
  isRootHighlighted = false,
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
      aria-label={`${noteName}${isOpenString ? ' (corda solta)' : ''}${
        isRootHighlighted ? ' (fundamental)' : ''
      }`}
      className={`
        h-14 flex items-center justify-center relative cursor-pointer focus-visible:z-20
        ${isOpenString ? 'bg-bg-tertiary border-r-2 border-r-text-muted' : 'border-r border-r-fret-border bg-fret-bg hover:bg-bg-secondary'}
        ${isOctaveStart ? 'border-l-[3px] border-l-text-muted' : ''}
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
            <NoteIndicator
              noteName={noteName}
              color={
                isRootHighlighted
                  ? BASS_ROOT_HIGHLIGHT_COLOR
                  : BASS_HIGHLIGHT_COLOR
              }
              size="lg"
            />
          ) : (
            <span
              className={`w-7 h-7 flex items-center justify-center text-xs shrink-0 ${hasAnyHighlights ? 'text-text-muted' : 'font-bold text-on-accent'}`}
              style={{
                backgroundColor:
                  (hasAnyHighlights ? DIMMED_OCTAVE_COLORS : OCTAVE_COLORS)[
                    octave
                  ] ?? 'var(--color-octave-fallback)',
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
