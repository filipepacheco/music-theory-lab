import { useCallback } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { playbackEngine } from '@/services/playbackEngine';

export function useSynth() {
  const activePresetId = useAppStore((state) => state.activePresetId);

  const playNote = useCallback(
    (noteIndex: number, octave: number = 4, duration: string = '8n') => {
      playbackEngine.playNote(noteIndex, octave, duration, activePresetId);
    },
    [activePresetId],
  );

  const playChord = useCallback(
    (
      noteIndices: number[],
      octave: number = 3,
      duration: string = '2n',
      presetId?: string,
      time?: number,
    ) => {
      playbackEngine.playChord(
        noteIndices,
        octave,
        duration,
        presetId ?? activePresetId,
        time,
      );
    },
    [activePresetId],
  );

  const playScale = useCallback(
    (noteIndices: number[], octave: number = 4) => {
      playbackEngine.playScale(noteIndices, octave, activePresetId);
    },
    [activePresetId],
  );

  const stopAll = useCallback(() => {
    playbackEngine.stopAll(activePresetId);
  }, [activePresetId]);

  return { playNote, playChord, playScale, stopAll };
}
