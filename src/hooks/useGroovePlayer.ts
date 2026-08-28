import { useCallback, useEffect, useRef, useState } from 'react';
import * as Tone from 'tone';
import { DEFAULT_GROOVE_SUBDIVISION } from '@/constants/groove';
import {
  grooveHits,
  grooveHitsAtTick,
  grooveStepDuration,
} from '@/domain/grooveSchedule';
import { stopScheduledMetronomes } from '@/hooks/useMetronome';
import {
  ensureAudio,
  ensureGrooveSamples,
  playbackEngine,
} from '@/services/playbackEngine';
import { useAppStore } from '@/store/useAppStore';
import type { GroovePattern } from '@/types';

export interface GroovePlayer {
  play: (groove: GroovePattern, bpm: number) => Promise<void>;
  stop: () => void;
  isPlaying: boolean;
  playingSectionId: string | null;
}

interface ScheduledGroove {
  groove: GroovePattern;
}

function toScheduledGroove(groove: GroovePattern): ScheduledGroove {
  return {
    groove: {
      ...groove,
      subdivision: groove.subdivision ?? DEFAULT_GROOVE_SUBDIVISION,
    },
  };
}

/** Plays one section groove on the shared Tone transport. */
export function useGroovePlayer(): GroovePlayer {
  const focusedSectionId = useAppStore((state) => state.focusedSectionId);
  const structureSections = useAppStore((state) => state.structureSections);
  const [isPlaying, setIsPlaying] = useState(false);

  const loopRef = useRef<Tone.Loop | null>(null);
  const tickRef = useRef(0);
  const grooveRef = useRef<ScheduledGroove | null>(null);
  const tokenRef = useRef(0);
  const playingRef = useRef(false);
  const playingSectionIdRef = useRef<string | null>(null);
  const transportOwnedRef = useRef(false);
  const previousTransportBpmRef = useRef<number | null>(null);

  const stop = useCallback(() => {
    tokenRef.current += 1;
    playingRef.current = false;
    tickRef.current = 0;
    grooveRef.current = null;
    playingSectionIdRef.current = null;

    loopRef.current?.dispose();
    loopRef.current = null;
    playbackEngine.stopGroove();

    if (transportOwnedRef.current) {
      const transport = Tone.getTransport();
      transport.stop();
      transport.position = 0;
      if (previousTransportBpmRef.current !== null) {
        transport.bpm.value = previousTransportBpmRef.current;
      }
    }

    transportOwnedRef.current = false;
    previousTransportBpmRef.current = null;
    setIsPlaying(false);
  }, []);

  const play = useCallback(
    async (groove: GroovePattern, bpm: number) => {
      const hits = grooveHits(groove);
      if (!hits.some((step) => step.length > 0)) return;

      stop();

      const state = useAppStore.getState();
      const sectionId = state.focusedSectionId;
      const transport = Tone.getTransport();

      // Groove playback owns the shared transport while it is active.
      previousTransportBpmRef.current = transport.bpm.value;
      stopScheduledMetronomes();
      transport.stop();
      transport.position = 0;
      state.setIsMetronomeOn(false);
      state.setCurrentBeat(-1);
      state.setCurrentEighth(-1);
      state.setPlayingProgression(null);
      transportOwnedRef.current = true;

      const token = tokenRef.current;
      const audioReady = await ensureAudio();
      if (audioReady) await ensureGrooveSamples();
      const latestSection = useAppStore
        .getState()
        .structureSections.find((section) => section.id === sectionId);
      const latestGroove = latestSection?.groove;
      if (
        !audioReady ||
        token !== tokenRef.current ||
        useAppStore.getState().focusedSectionId !== sectionId ||
        !latestGroove ||
        !grooveHits(latestGroove).some((step) => step.length > 0)
      ) {
        if (token === tokenRef.current) stop();
        return;
      }

      transport.bpm.value = bpm;
      tickRef.current = 0;
      grooveRef.current = toScheduledGroove(latestGroove);
      playingRef.current = true;
      playingSectionIdRef.current = sectionId;

      const loop = new Tone.Loop(
        (time) => {
          if (!playingRef.current || tokenRef.current !== token) return;

          const currentGroove = grooveRef.current;
          if (!currentGroove) return;

          const tick = tickRef.current;
          for (const piece of grooveHitsAtTick(currentGroove.groove, tick)) {
            playbackEngine.playGrooveHit(piece, time);
          }

          tickRef.current += 1;
        },
        grooveStepDuration(bpm, '32n'),
      );

      loopRef.current = loop;
      loop.start(0);
      transport.start();
      setIsPlaying(true);
    },
    [stop],
  );

  useEffect(() => {
    const playingSectionId = playingSectionIdRef.current;
    if (!playingSectionId || !playingRef.current) return;

    const section = structureSections.find(
      (item) => item.id === playingSectionId,
    );
    if (!section?.groove) {
      stop();
      return;
    }

    // Read the latest store value on every edit so the next scheduled tick
    // reflects changes made while the groove is already playing.
    grooveRef.current = toScheduledGroove(section.groove);
  }, [structureSections, stop]);

  useEffect(() => {
    const playingSectionId = playingSectionIdRef.current;
    if (playingSectionId && focusedSectionId !== playingSectionId) {
      stop();
    }
  }, [focusedSectionId, stop]);

  useEffect(() => {
    const playingSectionId = playingSectionIdRef.current;
    if (
      playingSectionId &&
      !structureSections.some((section) => section.id === playingSectionId)
    ) {
      stop();
    }
  }, [structureSections, stop]);

  useEffect(() => stop, [stop]);

  return {
    play,
    stop,
    isPlaying,
    playingSectionId: playingSectionIdRef.current,
  };
}
