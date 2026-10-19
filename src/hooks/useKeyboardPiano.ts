import { useEffect, useRef, useCallback, useState } from 'react';
import { useSynth } from './useSynth';

const KEY_MAP: Record<string, { noteIndex: number; octave: number }> = {
  a: { noteIndex: 0, octave: 3 },
  w: { noteIndex: 1, octave: 3 },
  s: { noteIndex: 2, octave: 3 },
  e: { noteIndex: 3, octave: 3 },
  d: { noteIndex: 4, octave: 3 },
  f: { noteIndex: 5, octave: 3 },
  t: { noteIndex: 6, octave: 3 },
  g: { noteIndex: 7, octave: 3 },
  y: { noteIndex: 8, octave: 3 },
  h: { noteIndex: 9, octave: 3 },
  u: { noteIndex: 10, octave: 3 },
  j: { noteIndex: 11, octave: 3 },
  k: { noteIndex: 0, octave: 4 },
  o: { noteIndex: 1, octave: 4 },
  l: { noteIndex: 2, octave: 4 },
  p: { noteIndex: 3, octave: 4 },
  ';': { noteIndex: 4, octave: 4 },
  "'": { noteIndex: 5, octave: 4 },
};

export function useKeyboardPiano() {
  const { playNote } = useSynth();
  const activeKeysRef = useRef<Set<string>>(new Set());
  const [pressedKeys, setPressedKeys] = useState<Set<string>>(new Set());

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLSelectElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;

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
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [handleKeyDown, handleKeyUp]);

  return { pressedKeys, KEY_MAP };
}
