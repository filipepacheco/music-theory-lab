import { DRUM_PIECES, GROOVE_STEPS } from '@/constants/groove';
import { useAppStore } from '@/store/useAppStore';
import type { GroovePattern, StructureSection } from '@/types';

const INACTIVE_DOT = 'var(--color-border-default)';

function hasAnyHit(groove: GroovePattern): boolean {
  return DRUM_PIECES.some((piece) => groove[piece.id].some(Boolean));
}

/** Condensed 3×16 dot strip: the at-a-glance groove on a section card. */
export function GroovePreview({
  groove,
  color,
}: {
  groove?: GroovePattern;
  color: string;
}) {
  if (!groove || !hasAnyHit(groove)) return null;

  return (
    <div className="flex flex-col gap-[3px]">
      {DRUM_PIECES.map((piece) => (
        <div key={piece.id} className="flex gap-[3px]">
          {Array.from({ length: GROOVE_STEPS }, (_, step) => (
            <span
              key={step}
              className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full"
              style={{
                backgroundColor: groove[piece.id][step]
                  ? color
                  : INACTIVE_DOT,
                marginLeft: step % 4 === 0 && step > 0 ? '4px' : undefined,
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Full editor: three toggleable 16-step rows plus a clear button. */
export function GrooveEditor({
  section,
  color,
}: {
  section: StructureSection;
  color: string;
}) {
  const toggleGrooveHit = useAppStore((s) => s.toggleGrooveHit);
  const clearGroove = useAppStore((s) => s.clearGroove);

  return (
    <div className="flex flex-col gap-2 border-t border-border-default pt-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-text-muted">
          Groove
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            clearGroove(section.id);
          }}
          className="text-[10px] text-text-muted hover:text-red-400 transition-colors cursor-pointer"
        >
          Limpar
        </button>
      </div>

      {DRUM_PIECES.map((piece) => (
        <div key={piece.id} className="flex items-center gap-1">
          <span
            className="w-5 shrink-0 text-center font-mono text-[9px] text-text-muted"
            title={
              piece.id === 'bumbo'
                ? 'Bumbo'
                : piece.id === 'caixa'
                  ? 'Caixa'
                  : 'Chimbal'
            }
          >
            {piece.label}
          </span>
          <div className="flex gap-[3px] flex-1">
            {Array.from({ length: GROOVE_STEPS }, (_, step) => {
              const active = section.groove?.[piece.id][step] ?? false;
              return (
                <button
                  key={step}
                  type="button"
                  aria-label={`${piece.label} ${step + 1}`}
                  aria-pressed={active}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleGrooveHit(section.id, piece.id, step);
                  }}
                  className="w-4 h-4 sm:w-5 sm:h-5 rounded-[3px] transition-colors cursor-pointer"
                  style={{
                    backgroundColor: active
                      ? color
                      : 'var(--color-bg-tertiary)',
                    marginLeft:
                      step % 4 === 0 && step > 0 ? '6px' : undefined,
                    border:
                      step % 4 === 0
                        ? '1px solid var(--color-border-default)'
                        : '1px solid transparent',
                  }}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
