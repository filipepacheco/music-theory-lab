import { useCallback, useRef, useEffect } from 'react';
import * as Tone from 'tone';
import { motion } from 'framer-motion';
import { useAppStore } from '@/store/useAppStore';
import { useSynth } from '@/hooks/useSynth';
import { useMetronome } from '@/hooks/useMetronome';
import { createEighthPlaybackEvents } from '@/domain/playbackSchedule';
import { resolveStep } from '@/domain/stepResolution';
import type { ProgressionExample } from '@/constants/progressions';

export default function PlaybackControls() {
  const customProgression = useAppStore((s) => s.customProgression);
  const isMinor = useAppStore((s) => s.isMinor);
  const activePresetId = useAppStore((s) => s.activePresetId);
  const bpm = useAppStore((s) => s.bpm);
  const selectChord = useAppStore((s) => s.selectChord);
  const setHighlightedNotes = useAppStore((s) => s.setHighlightedNotes);
  const setCurrentEighth = useAppStore((s) => s.setCurrentEighth);
  const setPlayingProgression = useAppStore((s) => s.setPlayingProgression);
  const playingProgression = useAppStore((s) => s.playingProgression);

  const { playChord } = useSynth();
  const {
    start: startMetronome,
    stop: stopMetronome,
    isMetronomeOn,
    onBeat,
  } = useMetronome();

  const playingRef = useRef(false);
  const eighthCountRef = useRef(0);
  const progRef = useRef<ProgressionExample | null>(null);

  useEffect(() => {
    return () => {
      onBeat(null);
    };
  }, [onBeat]);

  const stop = useCallback(() => {
    onBeat(null);
    playingRef.current = false;
    progRef.current = null;
    selectChord(null);
    setCurrentEighth(-1);
    setPlayingProgression(null);
    stopMetronome();
  }, [
    onBeat,
    selectChord,
    setCurrentEighth,
    setPlayingProgression,
    stopMetronome,
  ]);

  const play = useCallback(() => {
    if (customProgression.length === 0) return;

    if (playingRef.current) {
      stop();
      return;
    }

    const prog: ProgressionExample = {
      id: '__custom__',
      name: 'Custom',
      description: '',
      steps: customProgression,
      mode: isMinor ? 'minor' : 'major',
      presetId: activePresetId,
      bpm,
    };

    progRef.current = prog;
    eighthCountRef.current = -2;
    playingRef.current = true;
    setPlayingProgression(prog);

    const playStep = (idx: number, scheduleTime: number) => {
      const resolved = resolveStep(
        prog.steps[idx],
        useAppStore.getState().harmonicField,
        useAppStore.getState().rootNote,
      );
      if (resolved.notes.length > 0) {
        playChord(resolved.notes, 3, '2n', activePresetId, scheduleTime);
      }
      Tone.getDraw().schedule(() => {
        if (resolved.degree !== null) {
          selectChord(resolved.degree);
        } else if (resolved.notes.length > 0) {
          selectChord(null);
          setHighlightedNotes(resolved.notes, 'var(--color-accent)');
        }
      }, scheduleTime);
    };

    onBeat((_beat, time) => {
      if (!playingRef.current || !progRef.current) return;

      eighthCountRef.current += 2;
      const p = progRef.current;
      const eighthDuration = Tone.Time('8n').toSeconds();
      const events = createEighthPlaybackEvents(
        p.steps,
        eighthCountRef.current,
        time,
        eighthDuration,
      );

      for (const event of events) {
        if (event.type === 'timeline') {
          Tone.getDraw().schedule(() => {
            setCurrentEighth(event.cycleEighth);
          }, event.scheduleTime);
        } else {
          playStep(event.stepIndex, event.scheduleTime);
        }
      }
    });

    if (!isMetronomeOn) {
      startMetronome();
    }
  }, [
    customProgression,
    isMinor,
    activePresetId,
    bpm,
    isMetronomeOn,
    selectChord,
    setHighlightedNotes,
    playChord,
    onBeat,
    startMetronome,
    stop,
    setCurrentEighth,
    setPlayingProgression,
  ]);

  const isPlaying = playingProgression?.id === '__custom__';

  return (
    <div className="flex items-center gap-3">
      <motion.button
        onClick={isPlaying ? stop : play}
        disabled={customProgression.length === 0}
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
        className={`px-4 sm:px-6 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
          isPlaying
            ? 'bg-red-500 text-white shadow-[0_0_16px_rgba(239,68,68,0.3)]'
            : 'bg-accent text-white shadow-[0_0_16px_rgba(79,110,247,0.3)]'
        }`}
      >
        <span className="flex items-center gap-2">
          <span>{isPlaying ? '\u25A0' : '\u25B6'}</span>
          <span className="hidden sm:inline">
            {isPlaying ? 'Parar' : 'Tocar Progressao'}
          </span>
          <span className="sm:hidden">{isPlaying ? 'Parar' : 'Tocar'}</span>
        </span>
      </motion.button>

      {isPlaying && (
        <span className="text-xs text-text-muted animate-pulse">
          Tocando...
        </span>
      )}
    </div>
  );
}
