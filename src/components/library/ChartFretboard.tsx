import { memo, useEffect, useRef } from 'react';
import { DEGREE_COLORS } from '@/components/library/BassTabBar';
import { STANDARD_OPEN_MIDI } from '@/domain/bassChart';
import type { ChordTone } from '@/domain/bassHarmony';
import { useBassSynth } from '@/hooks/useBassSynth';

export interface FretPosition {
  string: number;
  fret: number;
}

interface Props {
  tuning: number[];
  fretCount: number;
  rootPitchClass: number | null;
  tones: ChordTone[];
  active: FretPosition[];
  noteNames: readonly string[];
}

const STRING_COUNT = 4;
const DISPLAY_ORDER = [3, 2, 1, 0];
const FRET_MARKERS = new Set([3, 5, 7, 9, 12, 15, 17, 19, 21, 24]);
const ON_HIGHLIGHT = 'var(--color-on-accent)';

function mod12(n: number): number {
  return ((n % 12) + 12) % 12;
}

function ChartFretboard({
  tuning,
  fretCount,
  rootPitchClass,
  tones,
  active,
  noteNames,
}: Props) {
  const { playBassNote } = useBassSynth();
  const scrollRef = useRef<HTMLDivElement>(null);

  const activeKey = active.map((p) => `${p.string}-${p.fret}`).join(',');
  useEffect(() => {
    const container = scrollRef.current;
    const first = activeKey.split(',')[0];
    if (!container || !first) return;
    const cell = container.querySelector<HTMLElement>(`[data-pos="${first}"]`);
    if (!cell) return;
    const view = container.getBoundingClientRect();
    const box = cell.getBoundingClientRect();
    if (box.left >= view.left && box.right <= view.right) return;
    container.scrollTo({
      left:
        container.scrollLeft +
        box.left -
        view.left -
        (view.width - box.width) / 2,
      behavior: 'smooth',
    });
  }, [activeKey]);
  const openMidi = Array.from(
    { length: STRING_COUNT },
    (_, s) => STANDARD_OPEN_MIDI[s] + (tuning[s] ?? 0),
  );
  const toneAt = (pitchClass: number) =>
    rootPitchClass === null
      ? undefined
      : tones.find((t) => mod12(rootPitchClass + t.interval) === pitchClass);
  const columns = `22px repeat(${fretCount + 1}, minmax(26px, 1fr))`;

  return (
    <div ref={scrollRef} className="overflow-x-auto min-w-0">
      <div className="min-w-max">
        <div className="grid" style={{ gridTemplateColumns: columns }}>
          <div />
          {Array.from({ length: fretCount + 1 }, (_, fret) => (
            <div
              key={fret}
              className="text-center font-heading text-micro text-text-muted tabular-nums"
            >
              {fret === 0 ? '' : fret}
            </div>
          ))}
        </div>
        {DISPLAY_ORDER.map((string, row) => (
          <div
            key={string}
            className="grid"
            style={{ gridTemplateColumns: columns }}
          >
            <div className="flex items-center justify-center font-heading text-micro text-text-secondary">
              {noteNames[mod12(openMidi[string])]}
            </div>
            {Array.from({ length: fretCount + 1 }, (_, fret) => {
              const midi = openMidi[string] + fret;
              const pitchClass = mod12(midi);
              const tone = toneAt(pitchClass);
              const isActive = active.some(
                (p) => p.string === string && p.fret === fret,
              );
              const label = tone?.label ?? noteNames[pitchClass];
              return (
                <button
                  key={fret}
                  type="button"
                  data-pos={`${string}-${fret}`}
                  onPointerDown={() => playBassNote(midi)}
                  aria-label={`${noteNames[pitchClass]}${tone ? ` (${tone.label})` : ''}, corda ${noteNames[mod12(openMidi[string])]}, casa ${fret}${isActive ? ', tocando agora' : ''}`}
                  className={`relative h-8 flex items-center justify-center cursor-pointer ${
                    fret === 0
                      ? 'bg-bg-tertiary border-r-2 border-r-text-muted'
                      : 'bg-fret-bg border-r border-r-fret-border hover:bg-bg-tertiary'
                  }`}
                >
                  <span className="absolute inset-x-0 top-1/2 h-px bg-string" />
                  {row === DISPLAY_ORDER.length - 1 &&
                    FRET_MARKERS.has(fret) && (
                      <span className="absolute bottom-0.5 w-1.5 h-1.5 rounded-full bg-text-muted opacity-40" />
                    )}
                  {isActive ? (
                    <span
                      className="relative z-10 w-7 h-7 flex items-center justify-center font-heading text-micro font-bold"
                      style={{
                        backgroundColor: 'var(--color-bass-root-highlight)',
                        color: ON_HIGHLIGHT,
                        boxShadow:
                          '0 0 0 3px color-mix(in srgb, var(--color-bass-root-highlight) 35%, transparent)',
                      }}
                    >
                      {label}
                    </span>
                  ) : tone ? (
                    <span
                      className={`relative z-10 w-6 h-6 flex items-center justify-center bg-bg-card font-heading text-micro font-bold border-2 ${
                        tone.played ? '' : 'border-dashed opacity-60'
                      }`}
                      style={{
                        borderColor: DEGREE_COLORS[tone.category],
                        color: DEGREE_COLORS[tone.category],
                      }}
                    >
                      {tone.label}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export default memo(ChartFretboard);
