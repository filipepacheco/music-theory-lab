import { useMemo, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { getNoteName, computeVoicingOctaveMap } from '@/utils/noteHelpers';
import { toBassMidi } from '@/utils/growlybass';
import { GROWLYBASS_SOURCE_COMMIT } from '@/constants/growlybass.generated';
import { useBassSynth } from '@/hooks/useBassSynth';
import BassFret from '@/components/instruments/BassFret';
import { libraryFretHighlightKind } from '@/domain/libraryChordSync';
import Segmented from '@/components/shared/Segmented';

export interface BassNeckHighlight {
  pitchClasses: number[];
  rootPitchClass: number | null;
  positions?: { string: number; fret: number }[];
}

interface Props {
  highlight?: BassNeckHighlight;
}

const TUNING = [4, 9, 2, 7];
const TUNING_OCTAVES = [1, 1, 2, 2];
const DISPLAY_ORDER = [3, 2, 1, 0];
const STRING_LABELS = ['G', 'D', 'A', 'E'];
const FRET_COUNT = 12;
const FRET_MARKERS = new Set([3, 5, 7, 9, 12]);

export default function BassNeck({ highlight }: Props = {}) {
  const storedHighlightedNotes = useAppStore((s) => s.highlightedNotes);
  const storedHighlightRootName = useAppStore((s) => s.highlightRootName);
  const storedHighlightOctaveMap = useAppStore((s) => s.highlightOctaveMap);
  const rootNote = useAppStore((s) => s.rootNote);
  const [showAllNotes, setShowAllNotes] = useState(false);
  const { playBassNote, samplerStatus } = useBassSynth();

  const highlightedNotes = highlight?.pitchClasses ?? storedHighlightedNotes;
  const highlightOctaveMap = highlight ? null : storedHighlightOctaveMap;
  const rootPitchClass = highlight?.rootPitchClass ?? null;
  const rootNoteName = highlight
    ? getNoteName(rootPitchClass ?? rootNote)
    : (storedHighlightRootName ?? getNoteName(rootNote));
  const hasAnyHighlights = highlightedNotes.length > 0;

  const bassHighlightPositions = useMemo(() => {
    if (highlightOctaveMap === null) return null;
    const octaveMap = computeVoicingOctaveMap(highlightedNotes, 1);
    const positions = new Set<string>();

    for (const noteIdx of highlightedNotes) {
      const targetOctave = octaveMap[noteIdx];
      if (targetOctave === undefined) continue;

      let bestString = -1;
      let bestFret = FRET_COUNT + 1;

      for (const tryOctave of [targetOctave, targetOctave + 1]) {
        for (let si = 0; si < 4; si++) {
          const open = TUNING[si];
          for (let f = 0; f <= FRET_COUNT; f++) {
            if ((open + f) % 12 !== noteIdx) continue;
            const oct = Math.floor((TUNING_OCTAVES[si] * 12 + open + f) / 12);
            if (oct === tryOctave && f < bestFret) {
              bestFret = f;
              bestString = si;
            }
            break;
          }
        }
        if (bestString >= 0) break;
      }

      if (bestString >= 0) {
        positions.add(`${bestString}-${bestFret}`);
      }
    }

    return positions;
  }, [highlightOctaveMap, highlightedNotes]);

  const handleNoteClick = (noteIndex: number, octave: number) => {
    playBassNote(toBassMidi(noteIndex, octave));
  };

  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between mb-3">
        <h3 className="lh-label">Baixo (4 cordas)</h3>
        <Segmented
          label="Notas no braço"
          value={showAllNotes ? 'all' : 'chords'}
          onChange={(value) => setShowAllNotes(value === 'all')}
          options={[
            { value: 'chords', label: 'Apenas acordes' },
            { value: 'all', label: 'Todas as notas' },
          ]}
        />
      </div>
      <div className="overflow-x-auto min-w-0">
        <div
          className="grid gap-0 mb-1"
          style={{
            gridTemplateColumns: `44px repeat(${FRET_COUNT + 1}, minmax(44px, 1fr))`,
          }}
        >
          <div />
          {Array.from({ length: FRET_COUNT + 1 }, (_, fret) => (
            <div key={fret} className="text-center text-xs text-text-muted">
              {fret === 0 ? '' : fret}
            </div>
          ))}
        </div>

        {DISPLAY_ORDER.map((stringIdx, rowIdx) => {
          const openNote = TUNING[stringIdx];
          return (
            <div
              key={stringIdx}
              className="grid gap-0"
              style={{
                gridTemplateColumns: `44px repeat(${FRET_COUNT + 1}, minmax(44px, 1fr))`,
              }}
            >
              <div className="flex items-center justify-center text-sm text-text-secondary">
                {STRING_LABELS[rowIdx]}
              </div>

              {Array.from({ length: FRET_COUNT + 1 }, (_, fret) => {
                const noteIndex = (openNote + fret) % 12;
                const noteName = getNoteName(noteIndex, rootNoteName);
                const octave = Math.floor(
                  (TUNING_OCTAVES[stringIdx] * 12 + openNote + fret) / 12,
                );
                const prevOctave =
                  fret > 0
                    ? Math.floor(
                        (TUNING_OCTAVES[stringIdx] * 12 + openNote + fret - 1) /
                          12,
                      )
                    : octave;
                const isOctaveStart = fret > 0 && octave !== prevOctave;
                const libraryHighlightKind = highlight?.positions
                  ? highlight.positions.some(
                      (p) => p.string === stringIdx && p.fret === fret,
                    )
                    ? 'root'
                    : null
                  : highlight
                    ? libraryFretHighlightKind(noteIndex, highlight)
                    : null;
                const isHighlighted = highlight
                  ? libraryHighlightKind !== null
                  : bassHighlightPositions !== null
                    ? bassHighlightPositions.has(`${stringIdx}-${fret}`)
                    : highlightedNotes.includes(noteIndex);

                return (
                  <BassFret
                    key={fret}
                    noteIndex={noteIndex}
                    noteName={noteName}
                    isHighlighted={isHighlighted}
                    isRootHighlighted={libraryHighlightKind === 'root'}
                    hasAnyHighlights={hasAnyHighlights}
                    showAllNotes={showAllNotes}
                    isOpenString={fret === 0}
                    hasFretMarker={
                      FRET_MARKERS.has(fret) &&
                      rowIdx === DISPLAY_ORDER.length - 1
                    }
                    isOctaveStart={isOctaveStart}
                    octave={octave}
                    onClick={handleNoteClick}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
      <div className="mt-3 text-small text-text-muted">
        {samplerStatus === 'loading' && (
          <span role="status">Carregando o timbre do baixo… </span>
        )}
        {samplerStatus === 'error' && (
          <span role="alert" className="text-text-error">
            Não foi possível carregar o timbre do baixo. Toque novamente para
            tentar de novo.{' '}
          </span>
        )}
        Samples derivados de{' '}
        <a
          className="underline hover:text-text-secondary"
          href={`https://github.com/sfzinstruments/karoryfer.growlybass/tree/${GROWLYBASS_SOURCE_COMMIT}`}
          target="_blank"
          rel="noreferrer"
        >
          Growlybass por Karoryfer Lecolds (2014)
        </a>
        , dedicados ao domínio público sob{' '}
        <a
          className="underline hover:text-text-secondary"
          href="https://creativecommons.org/publicdomain/zero/1.0/"
          target="_blank"
          rel="noreferrer"
        >
          CC0 1.0
        </a>
        . Selecionados e convertidos para o Music Theory Lab.
      </div>
    </div>
  );
}
