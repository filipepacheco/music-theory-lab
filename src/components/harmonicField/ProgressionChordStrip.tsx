import { useMemo } from "react";
import { motion } from "framer-motion";
import { useAppStore } from "@/store/useAppStore";
import { getNoteName } from "@/utils/noteHelpers";
import type { HarmonicFunction } from "@/constants/harmonicFields";

const FUNCTION_BG: Record<string, string> = {
  T: "rgba(59, 130, 246, 0.12)",
  SD: "rgba(34, 197, 94, 0.12)",
  D: "rgba(249, 115, 22, 0.12)",
};

const FUNCTION_BG_ACTIVE: Record<string, string> = {
  T: "rgba(59, 130, 246, 0.35)",
  SD: "rgba(34, 197, 94, 0.35)",
  D: "rgba(249, 115, 22, 0.35)",
};

const FUNCTION_BORDER: Record<string, string> = {
  T: "var(--color-tonic)",
  SD: "var(--color-subdominant)",
  D: "var(--color-dominant)",
};

const FUNCTION_LABELS: Record<string, string> = {
  T: "Tonica",
  SD: "Subdominante",
  D: "Dominante",
};

interface StepInfo {
  label: string;
  chordName: string;
  noteNames: string[];
  harmonicFunction: HarmonicFunction | null;
  beats: number;
}

export default function ProgressionChordStrip() {
  const prog = useAppStore((s) => s.playingProgression);
  const currentEighth = useAppStore((s) => s.currentEighth);
  const harmonicField = useAppStore((s) => s.harmonicField);
  const rootNote = useAppStore((s) => s.rootNote);

  const steps = useMemo<StepInfo[]>(() => {
    if (!prog) return [];
    const rootName = getNoteName(rootNote);

    return prog.steps.map((step) => {
      const beats = step.beats ?? 4;

      if (step.degree !== null && harmonicField[step.degree]) {
        const chord = harmonicField[step.degree];
        return {
          label: step.label,
          chordName: chord.chordName,
          noteNames: chord.noteNames,
          harmonicFunction: chord.harmonicFunction,
          beats,
        };
      }

      // Chromatic / custom chord
      const notes = step.intervals
        ? step.intervals.map((i) => (rootNote + i) % 12)
        : [];
      return {
        label: step.label,
        chordName: step.label,
        noteNames: notes.map((n) => getNoteName(n, rootName)),
        harmonicFunction: null,
        beats,
      };
    });
  }, [prog, harmonicField, rootNote]);

  if (!prog || steps.length === 0) return null;

  // Compute current step index from currentEighth
  let activeStepIdx = -1;
  if (currentEighth >= 0) {
    let accumulated = 0;
    for (let i = 0; i < steps.length; i++) {
      const eighths = steps[i].beats * 2;
      if (currentEighth < accumulated + eighths) {
        activeStepIdx = i;
        break;
      }
      accumulated += eighths;
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.3 }}
      className="mt-2"
    >
      <div className="flex gap-1.5 overflow-x-auto" style={{ scrollbarWidth: "thin" }}>
        {steps.map((step, idx) => {
          const isActive = idx === activeStepIdx;
          const fn = step.harmonicFunction;
          const borderColor = fn ? FUNCTION_BORDER[fn] : "var(--color-accent)";
          const bg = isActive
            ? fn
              ? FUNCTION_BG_ACTIVE[fn]
              : "rgba(79, 110, 247, 0.35)"
            : fn
              ? FUNCTION_BG[fn]
              : "rgba(79, 110, 247, 0.08)";

          return (
            <div
              key={idx}
              className="flex-1 min-w-0 rounded-md px-2 py-1.5 transition-colors duration-100"
              style={{
                backgroundColor: bg,
                borderLeft: isActive ? `3px solid ${borderColor}` : "3px solid transparent",
                flex: step.beats / 4,
              }}
            >
              <div className="flex items-baseline gap-1.5 mb-0.5">
                <span
                  className="font-mono text-xs font-medium"
                  style={{ color: borderColor }}
                >
                  {step.label}
                </span>
                <span className="font-mono text-[10px] text-text-secondary truncate">
                  {step.chordName}
                </span>
              </div>
              <div className="font-mono text-[10px] text-text-muted truncate">
                {step.noteNames.join(" ")}
              </div>
              {fn && (
                <div
                  className="text-[9px] mt-0.5 opacity-60"
                  style={{ color: borderColor }}
                >
                  {FUNCTION_LABELS[fn]}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
