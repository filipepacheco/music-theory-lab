import { useMemo } from "react";
import { useAppStore } from "@/store/useAppStore";
import { useSynth } from "@/hooks/useSynth";
import { useKeyboardPiano } from "@/hooks/useKeyboardPiano";
import { getNoteName } from "@/utils/noteHelpers";
import PianoKey from "./PianoKey";

const BLACK_KEY_SEMITONES = new Set([1, 3, 6, 8, 10]);

const BLACK_KEY_POSITIONS: Record<number, number> = {
  1: 0, // C#: after C
  3: 1, // D#: after D
  6: 3, // F#: after F
  8: 4, // G#: after G
  10: 5, // A#: after A
};

const WHITE_KEY_WIDTH = 48;

interface OctaveProps {
  octave: number;
  highlightedNotes: number[];
  highlightColors: Record<number, string>;
  highlightOctaveMap: Record<number, number> | null;
  rootNoteName: string;
  shortcutMap: Map<string, string>;
  pressedNotes: Set<string>;
  onNoteClick: (noteIndex: number, octave: number) => void;
}

function Octave({
  octave,
  highlightedNotes,
  highlightColors,
  highlightOctaveMap,
  rootNoteName,
  shortcutMap,
  pressedNotes,
  onNoteClick,
}: OctaveProps) {
  const whiteKeys: { noteIndex: number; noteName: string }[] = [];
  const blackKeys: {
    noteIndex: number;
    noteName: string;
    position: number;
  }[] = [];

  for (let semitone = 0; semitone < 12; semitone++) {
    const noteIndex = semitone;
    const noteName = getNoteName(noteIndex, rootNoteName);

    if (BLACK_KEY_SEMITONES.has(semitone)) {
      blackKeys.push({
        noteIndex,
        noteName,
        position: BLACK_KEY_POSITIONS[semitone],
      });
    } else {
      whiteKeys.push({ noteIndex, noteName });
    }
  }

  const noteKey = (noteIndex: number) => `${noteIndex}-${octave}`;
  const isNoteHighlighted = (noteIndex: number) =>
    highlightedNotes.includes(noteIndex) &&
    (highlightOctaveMap === null || highlightOctaveMap[noteIndex] === octave);

  return (
    <div className="relative" style={{ width: WHITE_KEY_WIDTH * 7 }}>
      <div className="flex">
        {whiteKeys.map((key, i) => (
          <PianoKey
            key={`w-${octave}-${i}`}
            noteIndex={key.noteIndex}
            noteName={key.noteName}
            isBlack={false}
            isHighlighted={isNoteHighlighted(key.noteIndex)}
            highlightColor={highlightColors[key.noteIndex]}
            isPressed={pressedNotes.has(noteKey(key.noteIndex))}
            keyboardShortcut={shortcutMap.get(noteKey(key.noteIndex))}
            onClick={(n) => onNoteClick(n, octave)}
          />
        ))}
      </div>
      {blackKeys.map((key, i) => (
        <div
          key={`b-${octave}-${i}`}
          className="absolute top-0"
          style={{
            left:
              key.position * WHITE_KEY_WIDTH + WHITE_KEY_WIDTH - 16,
          }}
        >
          <PianoKey
            noteIndex={key.noteIndex}
            noteName={key.noteName}
            isBlack={true}
            isHighlighted={isNoteHighlighted(key.noteIndex)}
            highlightColor={highlightColors[key.noteIndex]}
            isPressed={pressedNotes.has(noteKey(key.noteIndex))}
            keyboardShortcut={shortcutMap.get(noteKey(key.noteIndex))}
            onClick={(n) => onNoteClick(n, octave)}
          />
        </div>
      ))}
    </div>
  );
}

export default function Piano() {
  const highlightedNotes = useAppStore((s) => s.highlightedNotes);
  const highlightColors = useAppStore((s) => s.highlightColors);
  const highlightRootName = useAppStore((s) => s.highlightRootName);
  const highlightOctaveMap = useAppStore((s) => s.highlightOctaveMap);
  const rootNote = useAppStore((s) => s.rootNote);
  const { playNote } = useSynth();
  const { pressedKeys, KEY_MAP } = useKeyboardPiano();

  const rootNoteName = highlightRootName ?? getNoteName(rootNote);

  // Build lookup maps for shortcuts and pressed state
  const { shortcutMap, pressedNotes } = useMemo(() => {
    const sMap = new Map<string, string>();
    const pSet = new Set<string>();

    for (const [key, mapping] of Object.entries(KEY_MAP)) {
      const id = `${mapping.noteIndex}-${mapping.octave}`;
      sMap.set(id, key.toUpperCase());
      if (pressedKeys.has(key)) {
        pSet.add(id);
      }
    }
    return { shortcutMap: sMap, pressedNotes: pSet };
  }, [KEY_MAP, pressedKeys]);

  const handleNoteClick = (noteIndex: number, octave: number) => {
    playNote(noteIndex, octave);
  };

  return (
    <div>
      <h3 className="font-heading text-sm text-text-secondary mb-3">Piano</h3>
      <div className="flex overflow-x-auto relative">
        {[3, 4].map((octave) => (
          <Octave
            key={octave}
            octave={octave}
            highlightedNotes={highlightedNotes}
            highlightColors={highlightColors}
            highlightOctaveMap={highlightOctaveMap}
            rootNoteName={rootNoteName}
            shortcutMap={shortcutMap}
            pressedNotes={pressedNotes}
            onNoteClick={handleNoteClick}
          />
        ))}
      </div>
    </div>
  );
}
