import { useCallback, useRef, useState, useEffect } from "react";
import * as Tone from "tone";
import { motion } from "framer-motion";
import { PROGRESSION_EXAMPLES } from "@/constants/progressions";
import { PRESET_MAP } from "@/constants/tonePresets";
import type { ProgressionExample } from "@/constants/progressions";
import { useAppStore } from "@/store/useAppStore";
import { useSynth } from "@/hooks/useSynth";
import { useMetronome } from "@/hooks/useMetronome";

export default function ProgressionExamples() {
  const selectChord = useAppStore((s) => s.selectChord);
  const setHighlightedNotes = useAppStore((s) => s.setHighlightedNotes);
  const isMinor = useAppStore((s) => s.isMinor);
  const setIsMinor = useAppStore((s) => s.setIsMinor);
  const setActivePresetId = useAppStore((s) => s.setActivePresetId);
  const setBpm = useAppStore((s) => s.setBpm);
  const setCurrentEighth = useAppStore((s) => s.setCurrentEighth);
  const setPlayingProgression = useAppStore((s) => s.setPlayingProgression);
  const { playChord } = useSynth();
  const { start: startMetronome, stop: stopMetronome, isMetronomeOn, onBeat } =
    useMetronome();

  const [playingId, setPlayingId] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(-1);

  const progRef = useRef<ProgressionExample | null>(null);
  const beatCountRef = useRef(0);
  const playingRef = useRef(false);

  useEffect(() => {
    return () => {
      onBeat(null);
    };
  }, [onBeat]);

  const playProgression = useCallback(
    async (prog: ProgressionExample) => {
      if (playingRef.current) {
        onBeat(null);
        playingRef.current = false;
        setPlayingId(null);
        setCurrentStep(-1);
        selectChord(null);
        setCurrentEighth(-1);
        setPlayingProgression(null);
        beatCountRef.current = -1;

        if (progRef.current?.id === prog.id) {
          progRef.current = null;
          if (isMetronomeOn) stopMetronome();
          return;
        }
      }

      if (prog.mode === "minor" && !isMinor) {
        setIsMinor(true);
        await new Promise((r) => setTimeout(r, 100));
      } else if (prog.mode === "major" && isMinor) {
        setIsMinor(false);
        await new Promise((r) => setTimeout(r, 100));
      }

      setActivePresetId(prog.presetId);
      setBpm(prog.bpm);

      progRef.current = prog;
      beatCountRef.current = -1;
      playingRef.current = true;
      setPlayingId(prog.id);
      setPlayingProgression(prog);

      const playStep = (
        p: ProgressionExample,
        idx: number,
        scheduleTime: number,
      ) => {
        const step = p.steps[idx];
        if (step.degree !== null) {
          const field = useAppStore.getState().harmonicField;
          const chord = field[step.degree];
          if (chord) {
            playChord(chord.notes, 3, "2n", p.presetId, scheduleTime);
          }
          Tone.getDraw().schedule(() => {
            setCurrentStep(idx);
            selectChord(step.degree);
          }, scheduleTime);
        } else if (step.intervals) {
          const rootNote = useAppStore.getState().rootNote;
          const notes = step.intervals.map((i) => (rootNote + i) % 12);
          playChord(notes, 3, "2n", p.presetId, scheduleTime);
          Tone.getDraw().schedule(() => {
            setCurrentStep(idx);
            selectChord(null);
            setHighlightedNotes(notes, "var(--color-accent)");
          }, scheduleTime);
        }
      };

      onBeat((_beat, time) => {
        if (!playingRef.current || !progRef.current) return;

        beatCountRef.current++;
        const p = progRef.current;
        const stepBeats = p.steps.map((s) => s.beats ?? 4);
        const totalBeats = stepBeats.reduce((a, b) => a + b, 0);
        const cycleBeat = beatCountRef.current % totalBeats;

        // Emit eighth-note position for BeatTimeline
        const totalEighths = totalBeats * 2;
        const eighthBase = (cycleBeat * 2) % totalEighths;
        Tone.getDraw().schedule(() => {
          setCurrentEighth(eighthBase);
        }, time);
        Tone.getDraw().schedule(() => {
          setCurrentEighth(eighthBase + 1);
        }, time + Tone.Time("8n").toSeconds());

        // Find which step this beat belongs to
        let accumulated = 0;
        let stepIdx = 0;
        for (let i = 0; i < p.steps.length; i++) {
          if (cycleBeat < accumulated + stepBeats[i]) {
            stepIdx = i;
            break;
          }
          accumulated += stepBeats[i];
        }

        const isFirstBeatOfStep = cycleBeat === accumulated;
        const stepOffset = p.steps[stepIdx].offsetEighths ?? 0;

        // Handle current step
        if (stepOffset >= 0) {
          // Normal or late offset: play on first beat of step
          if (isFirstBeatOfStep) {
            const scheduleTime =
              stepOffset > 0
                ? time + stepOffset * Tone.Time("8n").toSeconds()
                : time;
            playStep(p, stepIdx, scheduleTime);
          }
        } else if (beatCountRef.current === 0 && stepIdx === 0) {
          // Very first beat with negative offset: play on downbeat anyway
          playStep(p, 0, time);
        }

        // Look ahead: check if the NEXT beat starts a step with anticipation
        const nextCycleBeat = (cycleBeat + 1) % totalBeats;
        let nextAccumulated = 0;
        let nextStepIdx = 0;
        for (let i = 0; i < p.steps.length; i++) {
          if (nextCycleBeat < nextAccumulated + stepBeats[i]) {
            nextStepIdx = i;
            break;
          }
          nextAccumulated += stepBeats[i];
        }
        const nextOffset = p.steps[nextStepIdx].offsetEighths ?? 0;
        if (nextCycleBeat === nextAccumulated && nextOffset < 0) {
          const scheduleTime =
            time +
            (2 + nextOffset) * Tone.Time("8n").toSeconds();
          playStep(p, nextStepIdx, scheduleTime);
        }
      });

      if (!isMetronomeOn) {
        startMetronome();
      }
    },
    [
      isMinor,
      isMetronomeOn,
      setIsMinor,
      setActivePresetId,
      setBpm,
      selectChord,
      setHighlightedNotes,
      playChord,
      onBeat,
      startMetronome,
      stopMetronome,
      setCurrentEighth,
      setPlayingProgression,
    ],
  );

  const stop = useCallback(() => {
    onBeat(null);
    playingRef.current = false;
    progRef.current = null;
    setPlayingId(null);
    setCurrentStep(-1);
    selectChord(null);
    setCurrentEighth(-1);
    setPlayingProgression(null);
    stopMetronome();
  }, [onBeat, selectChord, setCurrentEighth, setPlayingProgression, stopMetronome]);

  return (
    <div>
      <h3 className="font-heading text-sm text-text-secondary mb-3">
        Progressoes de Exemplo
      </h3>
      {/* Mobile: horizontal scroll / Desktop: grid */}
      <div className="flex gap-2.5 overflow-x-auto pb-2 scrollbar-none sm:grid sm:grid-cols-2 lg:grid-cols-3 sm:gap-3 sm:overflow-visible sm:pb-0">
        {PROGRESSION_EXAMPLES.map((prog) => {
          const isPlaying = playingId === prog.id;
          const preset = PRESET_MAP[prog.presetId];
          return (
            <motion.button
              key={prog.id}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => (isPlaying ? stop() : playProgression(prog))}
              className={`text-left p-3 sm:p-5 rounded-[10px] sm:rounded-xl border transition-all cursor-pointer min-w-40 sm:min-w-0 shrink-0 sm:shrink ${
                isPlaying
                  ? "border-accent bg-accent/10"
                  : "bg-bg-card hover:border-border-focus"
              }`}
              style={{
                boxShadow: isPlaying ? "0 0 16px var(--color-tonic-glow)" : "var(--shadow-card)",
                borderColor: isPlaying ? undefined : "rgba(255,255,255,0.1)",
              }}
            >
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between mb-2 sm:gap-2">
                <span className="font-heading text-sm text-text-primary truncate min-w-0">
                  {prog.name}
                </span>
                <div className="flex gap-1 shrink-0">
                  {preset && (
                    <span className="text-[10px] font-mono text-accent px-1.5 py-0.5 rounded bg-accent/10">
                      {preset.name}
                    </span>
                  )}
                  <span className="text-[10px] font-mono text-text-muted px-1.5 py-0.5 rounded bg-bg-tertiary">
                    {prog.bpm} bpm
                  </span>
                  <span className="text-[10px] font-mono text-text-muted px-1.5 py-0.5 rounded bg-bg-tertiary">
                    {prog.mode === "minor" ? "menor" : "maior"}
                  </span>
                </div>
              </div>

              <div className="flex gap-1 mb-2 sm:mb-3 flex-wrap">
                {prog.steps.map((step, i) => (
                  <span
                    key={i}
                    className={`text-xs font-mono px-1.5 py-0.5 rounded transition-colors ${
                      isPlaying && currentStep === i
                        ? "bg-accent text-white"
                        : step.degree === null
                          ? "bg-accent/20 text-accent"
                          : "bg-bg-tertiary text-text-secondary"
                    }`}
                    style={
                      step.beats && step.beats > 4
                        ? { flexGrow: step.beats / 4 }
                        : undefined
                    }
                  >
                    {step.label}
                    {step.beats && step.beats > 4 && (
                      <span className="text-[9px] opacity-50 ml-0.5">
                        {step.beats / 4}c
                      </span>
                    )}
                  </span>
                ))}
              </div>

              <p className="text-xs text-text-muted leading-relaxed overflow-hidden" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                {prog.description}
              </p>

              {isPlaying && (
                <div className="mt-2 text-[10px] text-accent font-medium">
                  Tocando... (clique para parar)
                </div>
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
