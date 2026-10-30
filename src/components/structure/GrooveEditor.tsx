import {
  DEFAULT_GROOVE_SUBDIVISION,
  DRUM_PIECES,
  GROOVE_MEASURE_COUNTS,
  GROOVE_SUBDIVISIONS,
  grooveMeasureCount,
  grooveRow,
  grooveStepCount,
  grooveStepsPerBeat,
  grooveTotalStepCount,
} from '@/constants/groove';
import type { GroovePlayer } from '@/hooks/useGroovePlayer';
import { useAppStore } from '@/store/useAppStore';
import { GrooveChart } from '@/components/structure/GrooveChart';
import type {
  DrumPiece,
  GrooveMeasureCount,
  GroovePattern,
  GrooveSubdivision,
  StructureSection,
} from '@/types';
import Button from '@/components/shared/Button';

const DRUM_NAMES: Record<DrumPiece, string> = {
  bumbo: 'Bumbo',
  caixa: 'Caixa',
  chimbal: 'Chimbal',
  tomAgudo: 'Tom 1',
  tomMedio: 'Tom 2',
  surdo: 'Surdo',
  ride: 'Condução',
  crash: 'Ataque',
};

function hasAnyHit(groove: GroovePattern): boolean {
  return DRUM_PIECES.some((piece) => grooveRow(groove, piece.id).some(Boolean));
}

export function GroovePreview({
  groove,
  color,
  currentTick,
}: {
  groove?: GroovePattern;
  color: string;
  currentTick?: number;
}) {
  if (!groove || !hasAnyHit(groove)) return null;

  return (
    <GrooveChart groove={groove} color={color} currentTick={currentTick} />
  );
}

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
  const setGrooveMeasureCount = useAppStore((s) => s.setGrooveMeasureCount);
  const structureBpm = useAppStore((s) => s.structureBpm);
  const setFocusedSection = useAppStore((s) => s.setFocusedSection);

  const hasGrooveHits = section.groove ? hasAnyHit(section.groove) : false;
  const subdivision = section.groove?.subdivision ?? DEFAULT_GROOVE_SUBDIVISION;
  const measureCount = grooveMeasureCount(section.groove?.measureCount);
  const stepsPerMeasure = grooveStepCount(subdivision);
  const stepCount = grooveTotalStepCount(subdivision, measureCount);
  const stepsPerBeat = grooveStepsPerBeat(subdivision);
  const isPlaying =
    groovePlayer.isPlaying && groovePlayer.playingSectionId === section.id;

  return (
    <div className="flex flex-col gap-2 border-t border-border-default pt-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
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
            size="sm"
            pressed={isPlaying}
            live={isPlaying}
            aria-label={isPlaying ? 'Parar groove' : 'Ouvir groove'}
          >
            {isPlaying ? 'Parar' : 'Ouvir groove'}
          </Button>
          <span className="lh-label">Groove</span>
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
            className="bg-bg-tertiary border border-border-strong px-1.5 py-0.5 text-micro text-text-secondary cursor-pointer"
          >
            {GROOVE_SUBDIVISIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.shortLabel} · {option.label}
              </option>
            ))}
          </select>
          <select
            value={measureCount}
            aria-label="Quantidade de compassos do groove"
            onPointerDown={(e) => e.stopPropagation()}
            onChange={(e) => {
              e.stopPropagation();
              setFocusedSection(section.id);
              setGrooveMeasureCount(
                section.id,
                Number(e.target.value) as GrooveMeasureCount,
              );
            }}
            className="bg-bg-tertiary border border-border-strong px-1.5 py-0.5 text-micro text-text-secondary cursor-pointer"
          >
            {GROOVE_MEASURE_COUNTS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.id}c
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={(e) => {
              e.stopPropagation();
              if (isPlaying) groovePlayer.stop();
              clearGroove(section.id);
            }}
            size="sm"
          >
            Limpar
          </Button>
        </div>
      </div>

      {DRUM_PIECES.map((piece) => (
        <div key={piece.id} className="flex items-center gap-1">
          <span className="w-14 shrink-0 font-mono text-small text-text-muted">
            {DRUM_NAMES[piece.id]}
          </span>
          <div className="flex-1 min-w-0 overflow-x-auto pb-0.5">
            <div className="flex gap-[3px] min-w-max">
              {Array.from({ length: stepCount }, (_, step) => {
                const active = section.groove
                  ? grooveRow(section.groove, piece.id)[step] === true
                  : false;
                return (
                  <button
                    key={step}
                    type="button"
                    aria-label={`${DRUM_NAMES[piece.id]} ${step + 1}`}
                    aria-pressed={active}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleGrooveHit(section.id, piece.id, step);
                    }}
                    className="w-4 h-4 sm:w-5 sm:h-5 shrink-0 cursor-pointer"
                    style={{
                      backgroundColor: active
                        ? color
                        : 'var(--color-bg-tertiary)',
                      marginLeft:
                        step > 0 && step % stepsPerMeasure === 0
                          ? '10px'
                          : step % stepsPerBeat === 0
                            ? '6px'
                            : undefined,
                      border:
                        step % stepsPerMeasure === 0 ||
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
