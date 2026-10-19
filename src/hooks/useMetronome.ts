import { useEffect, useCallback } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { transport } from '@/services/toneClock';
import type { BeatListener } from '@/services/transport';

/**
 * The metronome hook: a thin adapter over the transport. The transport
 * owns the clock, the click, and the one list of beat listeners.
 */
export function useMetronome() {
  const bpm = useAppStore((s) => s.bpm);
  const isMetronomeOn = useAppStore((s) => s.isMetronomeOn);
  const setBpm = useAppStore((s) => s.setBpm);

  // The app tempo is the metronome tempo. The transport keeps the tempo of
  // a player that owns the clock at its own tempo, such as a song.
  useEffect(() => {
    transport.setMetronomeTempo(bpm);
  }, [bpm]);

  const start = useCallback(async () => {
    await transport.startMetronome(useAppStore.getState().bpm);
  }, []);

  const stop = useCallback(() => {
    transport.stopMetronome();
  }, []);

  const toggle = useCallback(() => {
    if (isMetronomeOn) {
      stop();
    } else {
      void start();
    }
  }, [isMetronomeOn, start, stop]);

  // Register a beat listener on the transport. Returns an unsubscribe function.
  const onBeat = useCallback(
    (cb: BeatListener) => transport.onBeat(cb),
    [],
  );

  return { start, stop, toggle, setBpm, bpm, isMetronomeOn, onBeat };
}
