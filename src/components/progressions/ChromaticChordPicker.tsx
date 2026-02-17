import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { NOTE_NAMES } from '@/constants/notes';
import { CHORD_TYPES } from '@/constants/chords';
import { CHROMATIC_CATEGORIES } from '@/constants/chromaticChords';
import { getNoteName } from '@/utils/noteHelpers';
import { useAppStore } from '@/store/useAppStore';
import { useSynth } from '@/hooks/useSynth';

const CHORD_TYPE_IDS = [
  'major',
  'minor',
  'dom7',
  'maj7',
  'min7',
  'dim',
  'aug',
  'halfDim7',
] as const;

export default function ChromaticChordPicker() {
  const addProgressionStep = useAppStore((s) => s.addProgressionStep);
  const customProgression = useAppStore((s) => s.customProgression);
  const rootNote = useAppStore((s) => s.rootNote);
  const { playChord } = useSynth();

  const [expanded, setExpanded] = useState(false);
  const [selectedRoot, setSelectedRoot] = useState<number | null>(null);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  const rootName = getNoteName(rootNote);

  const handleRootClick = (noteIndex: number) => {
    setSelectedRoot(noteIndex === selectedRoot ? null : noteIndex);
  };

  const handleTypeClick = (chordTypeId: string) => {
    if (selectedRoot === null) return;
    if (customProgression.length >= 64) return;

    const chordType = CHORD_TYPES[chordTypeId];
    const intervals = chordType.intervals.map(
      (i) => (selectedRoot + i) % 12
    );
    const chordRootName = getNoteName(selectedRoot, rootName);
    const label = `${chordRootName}${chordType.symbol}`;

    playChord(intervals);
    addProgressionStep({
      degree: null,
      label,
      intervals: chordType.intervals.map(
        (i) => (selectedRoot - rootNote + i + 12) % 12
      ),
    });

    setSelectedRoot(null);
  };

  const handleCommonChordClick = (
    chordLabel: string,
    rootOffset: number,
    chordTypeId: string
  ) => {
    if (customProgression.length >= 64) return;

    const chordType = CHORD_TYPES[chordTypeId];
    const chordRoot = (rootNote + rootOffset) % 12;
    const intervals = chordType.intervals.map(
      (i) => (chordRoot + i) % 12
    );

    playChord(intervals);
    addProgressionStep({
      degree: null,
      label: chordLabel,
      intervals: chordType.intervals.map(
        (i) => (rootOffset + i) % 12
      ),
    });
  };

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
      >
        <motion.span
          animate={{ rotate: expanded ? 90 : 0 }}
          transition={{ duration: 0.15 }}
          className="text-[10px]"
        >
          &#9654;
        </motion.span>
        Acordes cromaticos
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="pt-3 space-y-3">
              {/* Root note selection */}
              <div>
                <span className="text-[10px] text-text-muted block mb-1.5">
                  Nota raiz
                </span>
                <div className="flex gap-1 flex-wrap">
                  {NOTE_NAMES.map((name, i) => (
                    <button
                      key={name}
                      onClick={() => handleRootClick(i)}
                      className={`px-2.5 py-1.5 rounded text-xs font-mono transition-all cursor-pointer ${
                        selectedRoot === i
                          ? 'bg-accent text-white'
                          : 'bg-bg-tertiary text-text-secondary hover:bg-bg-hover hover:text-text-primary'
                      }`}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Chord type selection */}
              <AnimatePresence>
                {selectedRoot !== null && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <span className="text-[10px] text-text-muted block mb-1.5">
                      Tipo de acorde ({getNoteName(selectedRoot, rootName)})
                    </span>
                    <div className="flex gap-1 flex-wrap">
                      {CHORD_TYPE_IDS.map((typeId) => {
                        const ct = CHORD_TYPES[typeId];
                        const chordRootName = getNoteName(
                          selectedRoot,
                          rootName
                        );
                        return (
                          <button
                            key={typeId}
                            onClick={() => handleTypeClick(typeId)}
                            className="px-2.5 py-1.5 rounded text-xs font-mono bg-bg-tertiary text-text-secondary hover:bg-accent/20 hover:text-accent transition-all cursor-pointer"
                          >
                            {chordRootName}
                            {ct.symbol || 'M'}
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Common chromatic chords */}
              <div>
                <span className="text-[10px] text-text-muted block mb-1.5">
                  Acordes comuns (na tonalidade de {getNoteName(rootNote)})
                </span>
                <div className="space-y-2">
                  {CHROMATIC_CATEGORIES.map((cat) => (
                    <div key={cat.id}>
                      <button
                        onClick={() =>
                          setExpandedCategory(
                            expandedCategory === cat.id ? null : cat.id
                          )
                        }
                        className="flex items-center gap-1 text-[11px] text-text-secondary hover:text-text-primary transition-colors cursor-pointer mb-1"
                      >
                        <motion.span
                          animate={{
                            rotate: expandedCategory === cat.id ? 90 : 0,
                          }}
                          transition={{ duration: 0.1 }}
                          className="text-[8px]"
                        >
                          &#9654;
                        </motion.span>
                        {cat.label}
                      </button>

                      <AnimatePresence>
                        {expandedCategory === cat.id && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.1 }}
                            className="overflow-hidden"
                          >
                            <div className="flex gap-1 flex-wrap pl-3">
                              {cat.chords.map((chord) => {
                                const chordRoot =
                                  (rootNote + chord.rootOffset) % 12;
                                const ct = CHORD_TYPES[chord.chordTypeId];
                                const displayName = `${getNoteName(chordRoot, rootName)}${ct.symbol}`;
                                return (
                                  <button
                                    key={chord.label}
                                    onClick={() =>
                                      handleCommonChordClick(
                                        chord.label,
                                        chord.rootOffset,
                                        chord.chordTypeId
                                      )
                                    }
                                    className="px-2.5 py-1.5 rounded text-xs font-mono bg-bg-tertiary text-text-secondary hover:bg-accent/20 hover:text-accent transition-all cursor-pointer"
                                    title={`${chord.description} (${displayName})`}
                                  >
                                    {chord.label}
                                  </button>
                                );
                              })}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
