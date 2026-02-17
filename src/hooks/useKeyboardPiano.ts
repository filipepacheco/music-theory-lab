import { useEffect, useRef, useCallback, useState } from "react";
import { useSynth } from "./useSynth";

// Standard virtual piano layout:
// Lower octave (3): home row = white keys, row above = black keys
// Upper octave (4): continues rightward
const KEY_MAP: Record<string, { noteIndex: number; octave: number }> = {
  // Octave 3
  a: { noteIndex: 0, octave: 3 }, // C
  w: { noteIndex: 1, octave: 3 }, // C#
  s: { noteIndex: 2, octave: 3 }, // D
  e: { noteIndex: 3, octave: 3 }, // D#
  d: { noteIndex: 4, octave: 3 }, // E
  f: { noteIndex: 5, octave: 3 }, // F
  t: { noteIndex: 6, octave: 3 }, // F#
  g: { noteIndex: 7, octave: 3 }, // G
  y: { noteIndex: 8, octave: 3 }, // G#
  h: { noteIndex: 9, octave: 3 }, // A
  u: { noteIndex: 10, octave: 3 }, // A#
  j: { noteIndex: 11, octave: 3 }, // B
  // Octave 4
  k: { noteIndex: 0, octave: 4 }, // C
  o: { noteIndex: 1, octave: 4 }, // C#
  l: { noteIndex: 2, octave: 4 }, // D
  p: { noteIndex: 3, octave: 4 }, // D#
  ";": { noteIndex: 4, octave: 4 }, // E
  "'": { noteIndex: 5, octave: 4 }, // F
};

export function useKeyboardPiano() {
  const { playNote } = useSynth();
  const activeKeysRef = useRef<Set<string>>(new Set());
  const [pressedKeys, setPressedKeys] = useState<
    Set<string>
  >(new Set());

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;

      const key = e.key.toLowerCase();
      const mapping = KEY_MAP[key];
      if (!mapping) return;

      e.preventDefault();
      if (activeKeysRef.current.has(key)) return;
      activeKeysRef.current.add(key);
      setPressedKeys(new Set(activeKeysRef.current));
      playNote(mapping.noteIndex, mapping.octave);
    },
    [playNote],
  );

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    if (activeKeysRef.current.has(key)) {
      activeKeysRef.current.delete(key);
      setPressedKeys(new Set(activeKeysRef.current));
    }
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [handleKeyDown, handleKeyUp]);

  return { pressedKeys, KEY_MAP };
}
