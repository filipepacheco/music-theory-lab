import { useCallback, useEffect, useRef } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { transport } from '@/services/toneClock';
import { useSynth } from '@/hooks/useSynth';
import { createEighthPlaybackEvents } from '@/domain/playbackSchedule';
import { resolveStep } from '@/domain/stepResolution';
import type {
  ProgressionExample,
  ProgressionStep,
} from '@/constants/progressions';

export interface StepPlayerOptions {
  /** id stored on the playing descriptor; views match on it. */
  id: string;
  steps: ProgressionStep[];
  mode: 'major' | 'minor';
  presetId: string;
  bpm: number;
  /** Apply the example's mode/preset/bpm globally before playing (example cards do this). */
  applyGlobals?: boolean;
  /** Eighths per segment (e.g. per song section); enables onSegmentChange. */
  segmentLengths?: number[];
  /** Called on the draw scheduler when the active step changes; -1 on stop. */
  onStepChange?: (stepIndex: number) => void;
  /** Called on the draw scheduler when the active segment changes; undefined on stop. */
  onSegmentChange?: (segmentIndex: number | undefined) => void;
}

/**
 * The step player: a thin adapter over the transport for one progression —
 * playing state, eighth counting, event scheduling, step resolution,
 * voicing, and UI highlight side effects. The transport owns the clock: a
 * play takes the clock, and a stop gives it back. Callers pass steps and
 * options; `play()` accepts per-play overrides.
 */
export function useStepPlayer(defaults: StepPlayerOptions) {
  const defaultsRef = useRef(defaults);
  defaultsRef.current = defaults;

  const { playChord } = useSynth();

  const playingRef = useRef(false);
  const eighthCountRef = useRef(0);
  const currentIdRef = useRef<string | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  const playingProgression = useAppStore((s) => s.playingProgression);
  const isPlaying = playingProgression?.id === currentIdRef.current;

  const stop = useCallback(() => {
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
    playingRef.current = false;
    eighthCountRef.current = 0;
    const id = currentIdRef.current;
    currentIdRef.current = null;

    const state = useAppStore.getState();
    state.selectChord(null);
    state.setCurrentEighth(-1);
    state.setPlayingProgression(null);
    defaultsRef.current.onStepChange?.(-1);
    defaultsRef.current.onSegmentChange?.(undefined);
    // Give the clock back; a no-op when another player took it already.
    if (id !== null) transport.releaseClock(id);
  }, []);

  const play = useCallback(
    (overrides?: Partial<StepPlayerOptions>) => {
      const opts = { ...defaultsRef.current, ...overrides };
      if (opts.steps.length === 0) return;

      if (playingRef.current) {
        stop();
        return;
      }

      if (opts.applyGlobals) {
        const state = useAppStore.getState();
        if ((opts.mode === 'minor') !== state.isMinor) {
          state.setIsMinor(opts.mode === 'minor');
        }
        state.setActivePresetId(opts.presetId);
        state.setBpm(opts.bpm);
      }

      const prog: ProgressionExample = {
        id: opts.id,
        name: opts.id,
        description: '',
        steps: opts.steps,
        mode: opts.mode,
        presetId: opts.presetId,
        bpm: opts.bpm,
      };

      // Take the clock first: an old player stops cleanly before this one starts.
      // The caller's tempo plays: a song passes base tempo x practice speed.
      void transport.takeClock(
        { kind: 'progression', id: opts.id },
        { onRelease: stop, click: true, tempo: opts.bpm },
      );

      playingRef.current = true;
      eighthCountRef.current = -2;
      currentIdRef.current = opts.id;
      useAppStore.getState().setPlayingProgression(prog);

      const playStep = (stepIndex: number, scheduleTime: number) => {
        const resolved = resolveStep(
          prog.steps[stepIndex],
          useAppStore.getState().harmonicField,
          useAppStore.getState().rootNote,
        );
        if (resolved.notes.length > 0) {
          playChord(resolved.notes, 3, '2n', opts.presetId, scheduleTime);
        }
        transport.draw(() => {
          opts.onStepChange?.(stepIndex);
          const state = useAppStore.getState();
          if (resolved.degree !== null) {
            state.selectChord(resolved.degree);
          } else if (resolved.notes.length > 0) {
            state.selectChord(null);
            state.setHighlightedNotes(resolved.notes, 'var(--color-accent)');
          }
        }, scheduleTime);
      };

      const segmentIndexAt = (cycleEighth: number): number | undefined => {
        const lengths = opts.segmentLengths;
        if (!lengths || lengths.length === 0) return undefined;
        let accumulated = 0;
        for (let i = 0; i < lengths.length; i++) {
          if (cycleEighth < accumulated + lengths[i]) return i;
          accumulated += lengths[i];
        }
        return undefined;
      };

      unsubscribeRef.current = transport.onBeat((_beat, time) => {
        if (!playingRef.current) return;
        eighthCountRef.current += 2;
        const eighthDuration = transport.eighthSeconds();
        const events = createEighthPlaybackEvents(
          prog.steps,
          eighthCountRef.current,
          time,
          eighthDuration,
        );
        for (const event of events) {
          if (event.type === 'timeline') {
            transport.draw(() => {
              useAppStore.getState().setCurrentEighth(event.cycleEighth);
              opts.onSegmentChange?.(segmentIndexAt(event.cycleEighth));
            }, event.scheduleTime);
          } else {
            playStep(event.stepIndex, event.scheduleTime);
          }
        }
      });
    },
    [playChord, stop],
  );

  // Unmount mid-play: release the beat subscription and fully stop.
  useEffect(() => {
    return () => {
      if (unsubscribeRef.current) {
        stop();
      }
    };
  }, [stop]);

  return { play, stop, isPlaying, currentId: currentIdRef.current };
}
