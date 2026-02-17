import { memo } from "react";

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

  if (isBlack) {
    const pressed = isPressed;
    return (
      <button
        onPointerDown={handleClick}
        aria-label={`${noteName} (tecla preta)`}
        className="absolute z-10 w-8 h-24 rounded-b-md border border-bg-tertiary transition-colors duration-75 flex flex-col items-center justify-end pb-1 cursor-pointer focus-visible:ring-2 focus-visible:ring-accent"
        style={{
          backgroundColor: pressed
            ? "var(--color-accent)"
            : isHighlighted
              ? highlightColor
              : "var(--color-key-black)",
        }}
      >
        {isHighlighted && (
          <span className="text-[9px] font-mono font-bold text-bg-primary">
            {noteName}
          </span>
        )}
        {keyboardShortcut && !isHighlighted && (
          <span className="text-[8px] font-mono text-text-muted opacity-50 mb-0.5">
            {keyboardShortcut}
          </span>
        )}
      </button>
    );
  }

  const pressed = isPressed;
  return (
    <button
      onPointerDown={handleClick}
      aria-label={`${noteName} (tecla branca)`}
      className="relative w-12 h-36 rounded-b-md border border-border-default transition-colors duration-75 flex flex-col items-center justify-end pb-2 cursor-pointer focus-visible:ring-2 focus-visible:ring-accent"
      style={{
        backgroundColor: pressed
          ? "var(--color-accent-hover)"
          : isHighlighted
            ? highlightColor
            : "var(--color-key-white)",
      }}
    >
      <span
        className="text-xs font-mono"
        style={{
          color:
            pressed || isHighlighted
              ? "var(--color-bg-primary)"
              : "var(--color-text-muted)",
        }}
      >
        {noteName}
      </span>
      {keyboardShortcut && (
        <span className="text-[9px] font-mono text-text-muted opacity-40 mt-0.5">
          {keyboardShortcut}
        </span>
      )}
    </button>
  );
});

export default PianoKey;
