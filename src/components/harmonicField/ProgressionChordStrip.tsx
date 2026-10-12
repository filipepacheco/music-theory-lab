import { useMemo } from "react";
import { motion } from "framer-motion";
import { useAppStore } from "@/store/useAppStore";
import { resolveStep } from "@/domain/stepResolution";
import { functionColor, functionTint } from "@/constants/functionColors";
import type { HarmonicFunction } from "@/constants/harmonicFields";

const FUNCTION_LABELS: Record<string, string> = {
  T: "Tônica",
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

    return prog.steps.map((step) => {
      const resolved = resolveStep(step, harmonicField, rootNote);
      return {
        label: step.label,
        chordName: resolved.chordName,
        noteNames: resolved.noteNames,
        harmonicFunction: resolved.harmonicFunction,
        beats: step.beats ?? 4,
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
          const color = functionColor(fn);

          return (
            <div
              key={idx}
              className="flex-1 min-w-0 px-2 py-1.5"
              style={{
                backgroundColor: functionTint(fn, isActive ? 35 : 12),
                // The lamp marks the chord that sounds now.
                borderLeft: isActive
                  ? "3px solid var(--color-live)"
                  : "3px solid transparent",
                flex: step.beats / 4,
              }}
            >
              <div className="flex items-baseline gap-1.5 mb-0.5">
                <span
                  className="font-mono text-xs font-medium"
                  style={{ color }}
                >
                  {step.label}
                </span>
                <span className="font-mono text-micro text-text-secondary truncate">
                  {step.chordName}
                </span>
              </div>
              <div className="font-mono text-micro text-text-muted truncate">
                {step.noteNames.join(" ")}
              </div>
              {fn && (
                <div
                  className="text-micro mt-0.5 opacity-60 truncate"
                  style={{ color }}
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
