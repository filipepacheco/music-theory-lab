import { useCallback, useRef, useEffect, useState } from 'react';
import * as Tone from 'tone';
import { motion } from 'framer-motion';
import { useAppStore } from '@/store/useAppStore';
import { useSynth } from '@/hooks/useSynth';
import { useMetronome } from '@/hooks/useMetronome';
import SpeedControl from '@/components/shared/SpeedControl';
import type { ProgressionStep, ProgressionExample } from '@/constants/progressions';

function findStepAtEighth(
  cycleEighth: number,
  stepEighths: number[]
): [number, number] {
  let accumulated = 0;
  for (let i = 0; i < stepEighths.length; i++) {
    if (cycleEighth < accumulated + stepEighths[i]) {
      return [i, accumulated];
    }
    accumulated += stepEighths[i];
  }
  return [0, 0];
}

export default function SongPlaybackControls({
  onPlayingSectionChange,
}: {
  onPlayingSectionChange?: (sectionIndex: number | undefined) => void;
}) {
  const songSections = useAppStore((s) => s.songSections);
  const activeSectionIndex = useAppStore((s) => s.activeSectionIndex);
  const loopSection = useAppStore((s) => s.loopSection);
  const setLoopSection = useAppStore((s) => s.setLoopSection);
  const practiceSpeed = useAppStore((s) => s.practiceSpeed);
  const setPracticeSpeed = useAppStore((s) => s.setPracticeSpeed);
  const bpm = useAppStore((s) => s.bpm);
  const setBpm = useAppStore((s) => s.setBpm);
  const isMinor = useAppStore((s) => s.isMinor);
  const activePresetId = useAppStore((s) => s.activePresetId);
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

  const [originalBpm, setOriginalBpm] = useState(bpm);

  useEffect(() => {
    return () => {
      onBeat(null);
    };
  }, [onBeat]);

  // Compute which steps to play based on loopSection
  const getPlaybackSteps = useCallback((): ProgressionStep[] => {
    if (loopSection) {
      const section = songSections[activeSectionIndex];
      return section?.steps ?? [];
    }
    return songSections.flatMap((s) => s.steps);
  }, [songSections, activeSectionIndex, loopSection]);

  const hasSteps = songSections.some((s) => s.steps.length > 0);

  const stop = useCallback(() => {
    onBeat(null);
    playingRef.current = false;
    progRef.current = null;
    selectChord(null);
    setCurrentEighth(-1);
    setPlayingProgression(null);
    stopMetronome();
    onPlayingSectionChange?.(undefined);
  }, [
    onBeat,
    selectChord,
    setCurrentEighth,
    setPlayingProgression,
    stopMetronome,
    onPlayingSectionChange,
  ]);

  const handleSpeedChange = useCallback(
    (percent: number) => {
      setPracticeSpeed(percent);
      const effectiveBpm = Math.round((originalBpm * percent) / 100);
      setBpm(effectiveBpm);
    },
    [originalBpm, setPracticeSpeed, setBpm]
  );

  const play = useCallback(() => {
    const steps = getPlaybackSteps();
    if (steps.length === 0) return;

    if (playingRef.current) {
      stop();
      return;
    }

    setOriginalBpm(bpm);

    const prog: ProgressionExample = {
      id: '__song__',
      name: 'Song',
      description: '',
      steps,
      mode: isMinor ? 'minor' : 'major',
      presetId: activePresetId,
      bpm,
    };

    progRef.current = prog;
    eighthCountRef.current = -2;
    playingRef.current = true;
    setPlayingProgression(prog);

    // Compute section boundaries for full-song mode
    const sectionBoundaries: { start: number; end: number }[] = [];
    if (!loopSection) {
      let eighthOffset = 0;
      for (const section of songSections) {
        const sectionEighths = section.steps.reduce(
          (sum, s) => sum + Math.round((s.beats ?? 4) * 2),
          0
        );
        sectionBoundaries.push({
          start: eighthOffset,
          end: eighthOffset + sectionEighths,
        });
        eighthOffset += sectionEighths;
      }
    }

    const playStep = (idx: number, scheduleTime: number) => {
      const step = prog.steps[idx];
      if (step.degree !== null) {
        const field = useAppStore.getState().harmonicField;
        const chord = field[step.degree];
        if (chord) {
          playChord(chord.notes, 3, '2n', activePresetId, scheduleTime);
        }
        Tone.getDraw().schedule(() => {
          selectChord(step.degree);
        }, scheduleTime);
      } else if (step.intervals) {
        const rn = useAppStore.getState().rootNote;
        const notes = step.intervals.map((i) => (rn + i) % 12);
        playChord(notes, 3, '2n', activePresetId, scheduleTime);
        Tone.getDraw().schedule(() => {
          selectChord(null);
          setHighlightedNotes(notes, 'var(--color-accent)');
        }, scheduleTime);
      }
    };

    onBeat((_beat, time) => {
      if (!playingRef.current || !progRef.current) return;

      eighthCountRef.current += 2;
      const p = progRef.current;
      const stepEighths = p.steps.map((s) =>
        Math.round((s.beats ?? 4) * 2)
      );
      const totalEighths = stepEighths.reduce((a, b) => a + b, 0);
      const eighthDuration = Tone.Time('8n').toSeconds();

      for (let sub = 0; sub < 2; sub++) {
        const globalEighth = eighthCountRef.current + sub;
        const cycleEighth =
          ((globalEighth % totalEighths) + totalEighths) % totalEighths;
        const scheduleTime = time + sub * eighthDuration;

        Tone.getDraw().schedule(() => {
          setCurrentEighth(cycleEighth);

          // Highlight which section is playing in full-song mode
          if (!loopSection && sectionBoundaries.length > 0) {
            for (let si = 0; si < sectionBoundaries.length; si++) {
              const b = sectionBoundaries[si];
              if (cycleEighth >= b.start && cycleEighth < b.end) {
                onPlayingSectionChange?.(si);
                break;
              }
            }
          }
        }, scheduleTime);

        const [stepIdx, accumulated] = findStepAtEighth(
          cycleEighth,
          stepEighths
        );
        const isFirstEighthOfStep = cycleEighth === accumulated;
        const stepOffset = p.steps[stepIdx].offsetEighths ?? 0;

        if (stepOffset === 0 && isFirstEighthOfStep) {
          playStep(stepIdx, scheduleTime);
        } else if (stepOffset > 0 && isFirstEighthOfStep) {
          playStep(stepIdx, scheduleTime + stepOffset * eighthDuration);
        } else if (
          stepOffset < 0 &&
          isFirstEighthOfStep &&
          globalEighth <= 0
        ) {
          playStep(stepIdx, scheduleTime);
        }

        const nextCycleEighth = (cycleEighth + 1) % totalEighths;
        const [nextStepIdx, nextAccumulated] = findStepAtEighth(
          nextCycleEighth,
          stepEighths
        );
        const nextOffset = p.steps[nextStepIdx].offsetEighths ?? 0;
        if (nextCycleEighth === nextAccumulated && nextOffset < 0) {
          const anticipationTime =
            scheduleTime + eighthDuration + nextOffset * eighthDuration;
          if (anticipationTime >= scheduleTime) {
            playStep(nextStepIdx, anticipationTime);
          }
        }
      }
    });

    if (!isMetronomeOn) {
      startMetronome();
    }
  }, [
    getPlaybackSteps,
    loopSection,
    songSections,
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
    onPlayingSectionChange,
  ]);

  const isPlaying = playingProgression?.id === '__song__';

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <motion.button
          onClick={isPlaying ? stop : play}
          disabled={!hasSteps}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          className={`px-6 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
            isPlaying
              ? 'bg-red-500 text-white shadow-[0_0_16px_rgba(239,68,68,0.3)]'
              : 'bg-accent text-white shadow-[0_0_16px_rgba(79,110,247,0.3)]'
          }`}
        >
          <span className="flex items-center gap-2">
            <span>{isPlaying ? '\u25A0' : '\u25B6'}</span>
            <span>
              {isPlaying
                ? 'Parar'
                : loopSection
                  ? 'Tocar Secao'
                  : 'Tocar Tudo'}
            </span>
          </span>
        </motion.button>

        {/* Loop section toggle */}
        <button
          onClick={() => setLoopSection(!loopSection)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer border ${
            loopSection
              ? 'border-accent/40 text-accent bg-accent/10'
              : 'border-border-default text-text-secondary hover:border-accent/40'
          }`}
        >
          {loopSection ? 'Repetir secao' : 'Tocar tudo'}
        </button>

        {isPlaying && (
          <span className="text-xs text-text-muted animate-pulse">
            Tocando...
          </span>
        )}
      </div>

      <SpeedControl
        percent={practiceSpeed}
        onChange={handleSpeedChange}
        originalBpm={originalBpm}
      />
    </div>
  );
}
