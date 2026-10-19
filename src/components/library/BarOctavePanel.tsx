const OCTAVE_BUTTON =
  'border border-border-default bg-bg-card px-3 py-1.5 font-heading text-text-primary hover:bg-accent hover:text-on-accent cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed';

function octaveText(octave: number): string {
  if (octave === 0) return 'original';
  const count = Math.abs(octave);
  return `${octave > 0 ? '+' : '−'}${count} ${count === 1 ? 'oitava' : 'oitavas'}`;
}

interface Props {
  bar: number | null;
  octave: number;
  canLower: boolean;
  canRaise: boolean;
  likeCount: number;
  alike: boolean;
  movedCount: number;
  onAlike: (alike: boolean) => void;
  onOctave: (octave: number) => void;
  onClear: () => void;
}

export default function BarOctavePanel({
  bar,
  octave,
  canLower,
  canRaise,
  likeCount,
  alike,
  movedCount,
  onAlike,
  onOctave,
  onClear,
}: Props) {
  return (
    <div
      role="group"
      aria-label="Oitava por compasso"
      className="flex flex-wrap items-center gap-2 text-xs"
    >
      {bar === null ? (
        <span className="text-text-secondary">
          Clique em um compasso para mudar a oitava dele.
        </span>
      ) : (
        <>
          <span className="text-text-secondary">Compasso {bar + 1}</span>
          <button
            type="button"
            aria-label="Uma oitava abaixo"
            disabled={!canLower}
            onClick={() => onOctave(octave - 1)}
            className={OCTAVE_BUTTON}
          >
            −1 oitava
          </button>
          <span
            role="status"
            className="min-w-20 text-center font-heading tabular-nums text-text-primary"
          >
            {octaveText(octave)}
          </span>
          <button
            type="button"
            aria-label="Uma oitava acima"
            disabled={!canRaise}
            onClick={() => onOctave(octave + 1)}
            className={OCTAVE_BUTTON}
          >
            +1 oitava
          </button>
          {likeCount > 1 && (
            <label className="flex items-center gap-1.5 text-text-muted cursor-pointer">
              <input
                type="checkbox"
                checked={alike}
                onChange={(e) => onAlike(e.target.checked)}
                className="accent-text-primary"
              />
              Aplicar aos {likeCount} compassos iguais
            </label>
          )}
        </>
      )}
      {movedCount > 0 && (
        <button type="button" onClick={onClear} className={OCTAVE_BUTTON}>
          Voltar todos ao original ({movedCount})
        </button>
      )}
    </div>
  );
}
