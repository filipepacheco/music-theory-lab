import { useCallback, useEffect, useRef } from 'react';
import * as Tone from 'tone';
import { useAppStore } from '@/store/useAppStore';
import { useMetronome } from '@/hooks/useMetronome';
import { useSynth } from '@/hooks/useSynth';
import { createEighthPlaybackEvents } from '@/domain/playbackSchedule';
import { resolveStep } from '@/domain/stepResolution';
import type { ProgressionExample, ProgressionStep } from '@/constants/progressions';

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
  /** Called inside Tone.getDraw when the active step changes; -1 on stop. */
  onStepChange?: (stepIndex: number) => void;
  /** Called inside Tone.getDraw when the active segment changes; undefined on stop. */
  onSegmentChange?: (segmentIndex: number | undefined) => void;
}

/**
 * The step player: one module owning everything a progression transport
 * needs — playing state, metronome subscription, eighth counting, event
 * scheduling, step resolution, voicing, and UI highlight side effects.
 * Callers pass steps and options; `play()` accepts per-play overrides.
 */
export function useStepPlayer(defaults: StepPlayerOptions) {
  const defaultsRef = useRef(defaults);
  defaultsRef.current = defaults;

  const { playChord } = useSynth();
  const {
    start: startMetronome,
    stop: stopMetronome,
    onBeat,
  } = useMetronome();

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
    currentIdRef.current = null;

    const state = useAppStore.getState();
    state.selectChord(null);
    state.setCurrentEighth(-1);
    state.setPlayingProgression(null);
    defaultsRef.current.onStepChange?.(-1);
    defaultsRef.current.onSegmentChange?.(undefined);
    stopMetronome();
  }, [stopMetronome]);

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
        Tone.getDraw().schedule(() => {
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

      unsubscribeRef.current = onBeat((_beat, time) => {
        if (!playingRef.current) return;
        eighthCountRef.current += 2;
        const eighthDuration = Tone.Time('8n').toSeconds();
        const events = createEighthPlaybackEvents(
          prog.steps,
          eighthCountRef.current,
          time,
          eighthDuration,
        );
        for (const event of events) {
          if (event.type === 'timeline') {
            Tone.getDraw().schedule(() => {
              useAppStore.getState().setCurrentEighth(event.cycleEighth);
              opts.onSegmentChange?.(segmentIndexAt(event.cycleEighth));
            }, event.scheduleTime);
          } else {
            playStep(event.stepIndex, event.scheduleTime);
          }
        }
      });

      if (!useAppStore.getState().isMetronomeOn) {
        startMetronome();
      }
    },
    [onBeat, playChord, startMetronome, stop],
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
