import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createGroovePlayback,
  type GroovePlayback,
} from '@/services/groovePlayback';
import {
  ensureAudio,
  ensureGrooveSamples,
  playbackEngine,
} from '@/services/playbackEngine';
import { transport } from '@/services/toneClock';
import { useAppStore } from '@/store/useAppStore';
import type { GroovePattern } from '@/types';

export interface GroovePlayer {
  play: (groove: GroovePattern, bpm: number) => Promise<void>;
  stop: () => void;
  isPlaying: boolean;
  playingSectionId: string | null;
  currentTick: number;
}

/**
 * The groove hook: a thin adapter over the transport. The transport owns the
 * clock and the tempo; the playback plays the groove that the caller gives.
 */
export function useGroovePlayer(): GroovePlayer {
  const focusedSectionId = useAppStore((state) => state.focusedSectionId);
  const structureSections = useAppStore((state) => state.structureSections);
  const [playingSectionId, setPlayingSectionId] = useState<string | null>(
    null,
  );
  const [currentTick, setCurrentTick] = useState(-1);

  const playback: GroovePlayback = useMemo(
    () =>
      createGroovePlayback(transport, {
        prepare: async () => {
          const ready = await ensureAudio();
          if (ready) await ensureGrooveSamples();
          return ready;
        },
        playHit: (piece, time) => playbackEngine.playGrooveHit(piece, time),
        onTick: setCurrentTick,
        onSectionChange: setPlayingSectionId,
        silence: () => playbackEngine.stopGroove(),
      }),
    [],
  );

  const stop = useCallback(() => playback.stop(), [playback]);

  const play = useCallback(
    (groove: GroovePattern, bpm: number) =>
      playback.play({
        groove,
        bpm,
        sectionId: useAppStore.getState().focusedSectionId,
      }),
    [playback],
  );

  // The stored groove of the playing section is the one that plays: an edit
  // to it replaces the groove given to play() from the next tick, and a
  // removed section, or one with no groove, stops the playback.
  useEffect(() => {
    const playing = playback.playingSectionId();
    if (!playing) return;
    const section = structureSections.find((item) => item.id === playing);
    if (!section?.groove) {
      playback.stop();
      return;
    }
    playback.update(section.groove);
  }, [structureSections, playback]);

  useEffect(() => {
    const playing = playback.playingSectionId();
    if (playing && focusedSectionId !== playing) playback.stop();
  }, [focusedSectionId, playback]);

  useEffect(() => () => playback.stop(), [playback]);

  return {
    play,
    stop,
    isPlaying: playingSectionId !== null,
    playingSectionId,
    currentTick,
  };
}
