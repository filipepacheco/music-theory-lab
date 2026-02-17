import { useCallback, useRef, useEffect } from "react";
import * as Tone from "tone";
import { motion } from "framer-motion";
import { useAppStore } from "@/store/useAppStore";
import { useSynth } from "@/hooks/useSynth";
import { useMetronome } from "@/hooks/useMetronome";
import type { ProgressionExample } from "@/constants/progressions";

/**
 * Find which step a given eighth-note position belongs to.
 * Returns [stepIndex, accumulatedEighthsBeforeStep].
 */
function findStepAtEighth(
  cycleEighth: number,
  stepEighths: number[],
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
      id: "__custom__",
      name: "Custom",
      description: "",
      steps: customProgression,
      mode: isMinor ? "minor" : "major",
      presetId: activePresetId,
      bpm,
    };

    progRef.current = prog;
    eighthCountRef.current = -2;
    playingRef.current = true;
    setPlayingProgression(prog);

    const playStep = (idx: number, scheduleTime: number) => {
      const step = prog.steps[idx];
      if (step.degree !== null) {
        const field = useAppStore.getState().harmonicField;
        const chord = field[step.degree];
        if (chord) {
          playChord(chord.notes, 3, "2n", activePresetId, scheduleTime);
        }
        Tone.getDraw().schedule(() => {
          selectChord(step.degree);
        }, scheduleTime);
      } else if (step.intervals) {
        const rn = useAppStore.getState().rootNote;
        const notes = step.intervals.map((i) => (rn + i) % 12);
        playChord(notes, 3, "2n", activePresetId, scheduleTime);
        Tone.getDraw().schedule(() => {
          selectChord(null);
          setHighlightedNotes(notes, "var(--color-accent)");
        }, scheduleTime);
      }
    };

    onBeat((_beat, time) => {
      if (!playingRef.current || !progRef.current) return;

      eighthCountRef.current += 2;
      const p = progRef.current;
      // Convert all step durations to integer eighth counts
      const stepEighths = p.steps.map((s) =>
        Math.round((s.beats ?? 4) * 2),
      );
      const totalEighths = stepEighths.reduce((a, b) => a + b, 0);
      const eighthDuration = Tone.Time("8n").toSeconds();

      // Process both eighth-note positions in this quarter note
      for (let sub = 0; sub < 2; sub++) {
        const globalEighth = eighthCountRef.current + sub;
        const cycleEighth =
          ((globalEighth % totalEighths) + totalEighths) % totalEighths;
        const scheduleTime = time + sub * eighthDuration;

        // Update timeline cursor
        Tone.getDraw().schedule(() => {
          setCurrentEighth(cycleEighth);
        }, scheduleTime);

        // Find which step owns this eighth
        const [stepIdx, accumulated] = findStepAtEighth(
          cycleEighth,
          stepEighths,
        );
        const isFirstEighthOfStep = cycleEighth === accumulated;
        const stepOffset = p.steps[stepIdx].offsetEighths ?? 0;

        // Play step on its first eighth (with offset handling)
        if (stepOffset === 0 && isFirstEighthOfStep) {
          playStep(stepIdx, scheduleTime);
        } else if (stepOffset > 0 && isFirstEighthOfStep) {
          playStep(stepIdx, scheduleTime + stepOffset * eighthDuration);
        } else if (
          stepOffset < 0 &&
          isFirstEighthOfStep &&
          globalEighth <= 0
        ) {
          // First step with negative offset on very first beat: play on downbeat
          playStep(stepIdx, scheduleTime);
        }

        // Look ahead: check if NEXT eighth starts a step with anticipation
        const nextCycleEighth = (cycleEighth + 1) % totalEighths;
        const [nextStepIdx, nextAccumulated] = findStepAtEighth(
          nextCycleEighth,
          stepEighths,
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

  const isPlaying = playingProgression?.id === "__custom__";

  return (
    <div className="flex items-center gap-3">
      <motion.button
        onClick={isPlaying ? stop : play}
        disabled={customProgression.length === 0}
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
        className={`px-6 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
          isPlaying
            ? "bg-red-500 text-white shadow-[0_0_16px_rgba(239,68,68,0.3)]"
            : "bg-accent text-white shadow-[0_0_16px_rgba(79,110,247,0.3)]"
        }`}
      >
        <span className="flex items-center gap-2">
          <span>{isPlaying ? "\u25A0" : "\u25B6"}</span>
          <span>{isPlaying ? "Parar" : "Tocar Progressao"}</span>
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
