import { memo } from 'react';

interface PianoKeyProps {
  noteIndex: number;
  noteName: string;
  isBlack: boolean;
  isHighlighted: boolean;
  highlightColor?: string;
  isPressed: boolean;
  keyboardShortcut?: string;
  onClick: (noteIndex: number) => void;
}

const PianoKey = memo(function PianoKey({
  noteIndex,
  noteName,
  isBlack,
  isHighlighted,
  highlightColor,
  isPressed,
  keyboardShortcut,
  onClick,
}: PianoKeyProps) {
  const handleClick = () => onClick(noteIndex);
  const filled = isPressed || isHighlighted;
  const backgroundColor = isPressed
    ? 'var(--color-live)'
    : isHighlighted
      ? (highlightColor ?? 'var(--color-accent)')
      : 'var(--color-bg-primary)';

  if (isBlack) {
    return (
      <button
        onPointerDown={handleClick}
        aria-label={`${noteName} (tecla preta)`}
        className="ink-night absolute z-10 w-8 h-24 border border-border-strong flex flex-col items-center justify-end pb-1 cursor-pointer"
        style={{ backgroundColor }}
      >
        {isHighlighted && (
          <span className="text-micro font-bold text-bg-primary">
            {noteName}
          </span>
        )}
        {keyboardShortcut && !isHighlighted && (
          <span
            className={`text-micro mb-0.5 ${
              isPressed ? 'text-bg-primary' : 'text-text-muted'
            }`}
          >
            {keyboardShortcut}
          </span>
        )}
      </button>
    );
  }

  return (
    <button
      onPointerDown={handleClick}
      aria-label={`${noteName} (tecla branca)`}
      className="ink-day relative w-12 h-36 border border-border-strong flex flex-col items-center justify-end pb-2 cursor-pointer"
      style={{ backgroundColor }}
    >
      <span
        className={`text-xs ${
          filled ? 'font-bold text-bg-primary' : 'text-text-muted'
        }`}
      >
        {noteName}
      </span>
      {keyboardShortcut && (
        <span
          className={`text-micro mt-0.5 ${
            filled ? 'text-bg-primary' : 'text-text-muted'
          }`}
        >
          {keyboardShortcut}
        </span>
      )}
    </button>
  );
});

export default PianoKey;
