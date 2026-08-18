import { useMemo } from "react";
import { motion } from "framer-motion";
import { useAppStore } from "@/store/useAppStore";
import { resolveStep } from "@/domain/stepResolution";
import { FUNCTION_COLORS } from "@/constants/functionColors";
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
          const borderColor = fn ? FUNCTION_COLORS[fn] : "var(--color-accent)";
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
              className="flex-1 min-w-0 rounded-control px-2 py-1.5 transition-colors duration-100"
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
