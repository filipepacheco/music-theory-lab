import { useRef, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { useAppStore } from "@/store/useAppStore";
import type { HarmonicFunction } from "@/constants/harmonicFields";

const FUNCTION_COLORS: Record<string, { bg: string; active: string }> = {
  T: { bg: "rgba(59, 130, 246, 0.15)", active: "rgba(59, 130, 246, 0.45)" },
  SD: { bg: "rgba(34, 197, 94, 0.15)", active: "rgba(34, 197, 94, 0.45)" },
  D: { bg: "rgba(249, 115, 22, 0.15)", active: "rgba(249, 115, 22, 0.45)" },
};

const FUNCTION_BORDER_COLORS: Record<string, string> = {
  T: "var(--color-tonic)",
  SD: "var(--color-subdominant)",
  D: "var(--color-dominant)",
};

interface TimelineCell {
  stepIdx: number;
  label: string;
  isDownbeat: boolean;
  isMeasureStart: boolean;
  isChordStart: boolean;
  harmonicFunction: HarmonicFunction | null;
}

const BEAT_LABELS = ["1", "e", "2", "e", "3", "e", "4", "e"];

export default function BeatTimeline() {
  const prog = useAppStore((s) => s.playingProgression);
  const currentEighth = useAppStore((s) => s.currentEighth);
  const harmonicField = useAppStore((s) => s.harmonicField);
  const scrollRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (cursorRef.current && scrollRef.current) {
      const container = scrollRef.current;
      const cursor = cursorRef.current;
      const containerRect = container.getBoundingClientRect();
      const cursorRect = cursor.getBoundingClientRect();

      const margin = 60;
      if (
        cursorRect.left < containerRect.left + margin ||
        cursorRect.right > containerRect.right - margin
      ) {
        const scrollLeft =
          cursor.offsetLeft -
          container.clientWidth / 2 +
          cursor.clientWidth / 2;
        container.scrollTo({ left: scrollLeft, behavior: "smooth" });
      }
    }
  }, [currentEighth]);

  const cells = useMemo(() => {
    if (!prog) return [];
    const result: TimelineCell[] = [];
    for (let i = 0; i < prog.steps.length; i++) {
      const step = prog.steps[i];
      const eighths = (step.beats ?? 4) * 2;
      const offset = step.offsetEighths ?? 0;

      let hFunc: HarmonicFunction | null = null;
      if (step.degree !== null && harmonicField[step.degree]) {
        hFunc = harmonicField[step.degree].harmonicFunction;
      }

      for (let e = 0; e < eighths; e++) {
        result.push({
          stepIdx: i,
          label: step.label,
          isDownbeat: e % 2 === 0,
          isMeasureStart: e % 8 === 0,
          isChordStart:
            e === (offset > 0 ? offset : offset < 0 ? eighths + offset : 0),
          harmonicFunction: hFunc,
        });
      }
    }
    return result;
  }, [prog, harmonicField]);

  if (!prog) return null;

  const n = cells.length;

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2 }}
      className="mt-3 mb-1"
    >
      <div
        ref={scrollRef}
        className="overflow-x-auto"
        style={{ scrollbarWidth: "thin" }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${n}, 1fr)`,
            gridTemplateRows: "16px 20px 14px",
            minWidth: n * 20,
          }}
        >
          {/* Row 1: Chord labels */}
          {cells.map((cell, idx) => (
            <div
              key={`l-${idx}`}
              className="flex items-end justify-center overflow-visible relative"
              style={{ gridRow: 1, gridColumn: idx + 1 }}
            >
              {cell.isChordStart && (
                <span
                  className="text-[10px] font-mono font-medium leading-none whitespace-nowrap absolute bottom-0"
                  style={{
                    color: cell.harmonicFunction
                      ? FUNCTION_BORDER_COLORS[cell.harmonicFunction]
                      : "var(--color-accent)",
                  }}
                >
                  {cell.label}
                </span>
              )}
            </div>
          ))}

          {/* Row 2: Cell bars */}
          {cells.map((cell, idx) => {
            const isActive = currentEighth === idx;
            const colors = cell.harmonicFunction
              ? FUNCTION_COLORS[cell.harmonicFunction]
              : {
                  bg: "rgba(79, 110, 247, 0.15)",
                  active: "rgba(79, 110, 247, 0.45)",
                };
            const accentColor = cell.harmonicFunction
              ? FUNCTION_BORDER_COLORS[cell.harmonicFunction]
              : "var(--color-accent)";

            return (
              <div
                key={`c-${idx}`}
                ref={isActive ? cursorRef : undefined}
                className="transition-colors duration-75"
                style={{
                  gridRow: 2,
                  gridColumn: idx + 1,
                  backgroundColor: isActive ? colors.active : colors.bg,
                  borderLeft: cell.isMeasureStart
                    ? "2px solid var(--color-text-muted)"
                    : cell.isDownbeat
                      ? "1px solid var(--color-border-default)"
                      : "1px solid transparent",
                  borderTop: isActive
                    ? `2px solid ${accentColor}`
                    : "2px solid transparent",
                  borderBottom: isActive
                    ? `2px solid ${accentColor}`
                    : "2px solid transparent",
                }}
              />
            );
          })}

          {/* Row 3: Beat labels */}
          {cells.map((cell, idx) => (
            <div
              key={`b-${idx}`}
              className="flex items-start justify-center"
              style={{ gridRow: 3, gridColumn: idx + 1 }}
            >
              <span
                className={`text-[9px] font-mono leading-none ${
                  cell.isDownbeat
                    ? "text-text-secondary"
                    : "text-text-muted opacity-50"
                }`}
              >
                {BEAT_LABELS[idx % 8]}
              </span>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
