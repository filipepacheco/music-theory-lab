import {
  DEFAULT_GROOVE_SUBDIVISION,
  DRUM_PIECES,
  GROOVE_BEATS_PER_MEASURE,
  GROOVE_MEASURE_COUNTS,
  GROOVE_SUBDIVISIONS,
  grooveMeasureCount,
} from '@/constants/groove';
import { grooveBeats, grooveHasHits } from '@/domain/grooveSchedule';
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

export function GroovePreview({
  groove,
  color,
  currentTick,
}: {
  groove?: GroovePattern;
  color: string;
  currentTick?: number;
}) {
  if (!groove || !grooveHasHits(groove)) return null;

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
  const setGrooveBeatSubdivision = useAppStore(
    (s) => s.setGrooveBeatSubdivision,
  );
  const setGrooveMeasureCount = useAppStore((s) => s.setGrooveMeasureCount);
  const structureBpm = useAppStore((s) => s.structureBpm);
  const setFocusedSection = useAppStore((s) => s.setFocusedSection);

  const hasGrooveHits = section.groove ? grooveHasHits(section.groove) : false;
  const subdivision = section.groove?.subdivision ?? DEFAULT_GROOVE_SUBDIVISION;
  const measureCount = grooveMeasureCount(section.groove?.measureCount);
  const beats = grooveBeats(
    section.groove ?? {
      subdivision,
      measureCount,
      bumbo: [],
      caixa: [],
      chimbal: [],
    },
  );
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
            aria-label="Resolução base do groove"
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

      <div className="flex items-start gap-1 overflow-x-auto pb-0.5">
        <div className="flex flex-col gap-[3px] shrink-0">
          <span className="h-5 w-14 font-mono text-micro text-text-muted flex items-center">
            Tempo
          </span>
          {DRUM_PIECES.map((piece) => (
            <span
              key={piece.id}
              className="h-4 sm:h-5 w-14 flex items-center font-mono text-small text-text-muted"
            >
              {DRUM_NAMES[piece.id]}
            </span>
          ))}
        </div>
        {beats.map((view) => (
          <div
            key={view.beat}
            className="flex flex-col gap-[3px] shrink-0"
            style={{
              marginLeft:
                view.beat > 0 && view.beat % GROOVE_BEATS_PER_MEASURE === 0
                  ? '10px'
                  : '3px',
            }}
          >
            <select
              value={view.subdivision}
              aria-label={`Resolução do tempo ${view.beat + 1}`}
              title={
                view.own
                  ? 'Este tempo tem resolução própria'
                  : 'Resolução do tempo: igual à do groove'
              }
              onPointerDown={(e) => e.stopPropagation()}
              onChange={(e) => {
                e.stopPropagation();
                setFocusedSection(section.id);
                setGrooveBeatSubdivision(
                  section.id,
                  view.beat,
                  e.target.value as GrooveSubdivision,
                );
              }}
              className={`h-5 bg-bg-tertiary border px-0.5 text-micro cursor-pointer ${
                view.own
                  ? 'border-border-strong text-text-primary'
                  : 'border-border-default text-text-muted'
              }`}
            >
              {GROOVE_SUBDIVISIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {(view.beat % GROOVE_BEATS_PER_MEASURE) + 1} ·{' '}
                  {option.shortLabel}
                </option>
              ))}
            </select>
            {DRUM_PIECES.map((piece) => (
              <div key={piece.id} className="flex gap-[3px]">
                {Array.from({ length: view.stepsPerBeat }, (_, step) => {
                  const active = view.hits[step].includes(piece.id);
                  return (
                    <button
                      key={step}
                      type="button"
                      aria-label={`${DRUM_NAMES[piece.id]}, tempo ${view.beat + 1}, nota ${step + 1}`}
                      aria-pressed={active}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleGrooveHit(section.id, piece.id, view.beat, step);
                      }}
                      className="w-4 h-4 sm:w-5 sm:h-5 shrink-0 cursor-pointer"
                      style={{
                        backgroundColor: active
                          ? color
                          : 'var(--color-bg-tertiary)',
                        border:
                          step === 0
                            ? '1px solid var(--color-border-default)'
                            : '1px solid transparent',
                      }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
