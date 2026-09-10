import { useCallback, useEffect, useState } from 'react';
import { playbackEngine } from '@/services/playbackEngine';

export function useBassSynth() {
  const [samplerStatus, setSamplerStatus] = useState(
    playbackEngine.getBassSamplerStatus(),
  );

  useEffect(() => playbackEngine.subscribeBassSampler(setSamplerStatus), []);

  const playBassNote = useCallback(
    (midiNote: number, velocity = 0.6, duration = '8n') => {
      void playbackEngine
        .playBassNote(midiNote, velocity, duration)
        .catch(() => {
          // The status subscription exposes a retryable, user-readable failure.
        });
    },
    [],
  );

  return { playBassNote, samplerStatus };
}
