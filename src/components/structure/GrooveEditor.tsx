import {
  DEFAULT_GROOVE_SUBDIVISION,
  DRUM_PIECES,
  GROOVE_SUBDIVISIONS,
  grooveStepCount,
  grooveStepsPerBeat,
} from '@/constants/groove';
import type { GroovePlayer } from '@/hooks/useGroovePlayer';
import { useAppStore } from '@/store/useAppStore';
import type {
  GroovePattern,
  GrooveSubdivision,
  StructureSection,
} from '@/types';

const INACTIVE_DOT = 'var(--color-border-default)';

function hasAnyHit(groove: GroovePattern): boolean {
  return DRUM_PIECES.some((piece) => groove[piece.id].some(Boolean));
}

/** Condensed groove dot strip: the at-a-glance pattern on a section card. */
export function GroovePreview({
  groove,
  color,
}: {
  groove?: GroovePattern;
  color: string;
}) {
  if (!groove || !hasAnyHit(groove)) return null;

  const subdivision = groove.subdivision ?? DEFAULT_GROOVE_SUBDIVISION;
  const stepCount = grooveStepCount(subdivision);
  const stepsPerBeat = grooveStepsPerBeat(subdivision);

  return (
    <div className="flex flex-col gap-[3px]">
      {DRUM_PIECES.map((piece) => (
        <div key={piece.id} className="flex gap-[3px]">
          {Array.from({ length: stepCount }, (_, step) => (
            <span
              key={step}
              className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full"
              style={{
                backgroundColor: groove[piece.id][step] ? color : INACTIVE_DOT,
                marginLeft:
                  step % stepsPerBeat === 0 && step > 0 ? '4px' : undefined,
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Full editor: three toggleable rows with a selectable resolution. */
export function GrooveEditor({
  section,
  color,
  groovePlayer,
}: {
  section: StructureSection;
  color: string;
  groovePlayer: GroovePlayer;
}) {
  const toggleGrooveHit = useAppStore((s) => s.toggleGrooveHit);
  const clearGroove = useAppStore((s) => s.clearGroove);
  const setGrooveSubdivision = useAppStore((s) => s.setGrooveSubdivision);
  const structureBpm = useAppStore((s) => s.structureBpm);
  const setFocusedSection = useAppStore((s) => s.setFocusedSection);

  const hasGrooveHits = section.groove ? hasAnyHit(section.groove) : false;
  const subdivision = section.groove?.subdivision ?? DEFAULT_GROOVE_SUBDIVISION;
  const stepCount = grooveStepCount(subdivision);
  const stepsPerBeat = grooveStepsPerBeat(subdivision);
  const isPlaying =
    groovePlayer.isPlaying && groovePlayer.playingSectionId === section.id;

  return (
    <div className="flex flex-col gap-2 border-t border-border-default pt-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!hasGrooveHits && !isPlaying}
            onClick={(e) => {
              e.stopPropagation();
              setFocusedSection(section.id);
              if (isPlaying) {
                groovePlayer.stop();
              } else if (section.groove) {
                void groovePlayer.play(section.groove, structureBpm);
              }
            }}
            className={`text-[10px] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
              isPlaying
                ? 'text-red-400 hover:text-red-300'
                : 'text-accent hover:text-accent/80'
            }`}
            aria-label={isPlaying ? 'Parar groove' : 'Ouvir groove'}
          >
            {isPlaying ? 'Parar' : 'Ouvir groove'}
          </button>
          <span className="text-[10px] uppercase tracking-wider text-text-muted">
            Groove
          </span>
          <select
            value={subdivision}
            aria-label="Resolução do groove"
            onPointerDown={(e) => e.stopPropagation()}
            onChange={(e) => {
              e.stopPropagation();
              setFocusedSection(section.id);
              setGrooveSubdivision(
                section.id,
                e.target.value as GrooveSubdivision,
              );
            }}
            className="bg-bg-tertiary/70 border border-border-default rounded px-1.5 py-0.5 text-[10px] text-text-secondary focus:outline-none focus:border-accent cursor-pointer"
          >
            {GROOVE_SUBDIVISIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.shortLabel} · {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (isPlaying) groovePlayer.stop();
              clearGroove(section.id);
            }}
            className="text-[10px] text-text-muted hover:text-red-400 transition-colors cursor-pointer"
          >
            Limpar
          </button>
        </div>
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
          <div className="flex-1 min-w-0 overflow-x-auto pb-0.5">
            <div className="flex gap-[3px] min-w-max">
              {Array.from({ length: stepCount }, (_, step) => {
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
                    className="w-4 h-4 sm:w-5 sm:h-5 shrink-0 rounded-[3px] transition-colors cursor-pointer"
                    style={{
                      backgroundColor: active
                        ? color
                        : 'var(--color-bg-tertiary)',
                      marginLeft:
                        step % stepsPerBeat === 0 && step > 0
                          ? '6px'
                          : undefined,
                      border:
                        step % stepsPerBeat === 0
                          ? '1px solid var(--color-border-default)'
                          : '1px solid transparent',
                    }}
                  />
                );
              })}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
