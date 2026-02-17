import { AnimatePresence, motion } from "framer-motion";
import { useAppStore } from "@/store/useAppStore";
import { SCALE_PATTERNS } from "@/constants/scales";
import { getScaleNotes } from "@/utils/musicTheory";
import { getNoteName } from "@/utils/noteHelpers";

const ALL_CHROMATIC = Array.from({ length: 12 }, (_, i) => i);

export default function ScaleComparison() {
  const selectedScaleId = useAppStore((s) => s.selectedScaleId);
  const comparisonScaleId = useAppStore((s) => s.comparisonScaleId);
  const rootNote = useAppStore((s) => s.rootNote);

  if (!selectedScaleId || !comparisonScaleId) return null;

  const rootName = getNoteName(rootNote);
  const notesA = new Set(getScaleNotes(rootNote, selectedScaleId));
  const notesB = new Set(getScaleNotes(rootNote, comparisonScaleId));

  const shared = [...notesA].filter((n) => notesB.has(n));
  const onlyA = [...notesA].filter((n) => !notesB.has(n));
  const onlyB = [...notesB].filter((n) => !notesA.has(n));

  const patternA = SCALE_PATTERNS[selectedScaleId];
  const patternB = SCALE_PATTERNS[comparisonScaleId];

  // Find which scale degrees differ
  const diffDegrees: string[] = [];
  const maxLen = Math.max(
    patternA.intervals.length,
    patternB.intervals.length,
  );
  for (let i = 1; i < maxLen; i++) {
    const a = patternA.intervals[i];
    const b = patternB.intervals[i];
    if (a !== undefined && b !== undefined && a !== b) {
      diffDegrees.push(`${i + 1}o`);
    } else if (a === undefined || b === undefined) {
      diffDegrees.push(`${i + 1}o`);
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.2 }}
        className="bg-bg-card border border-border-default rounded-lg p-4 space-y-4"
      >
        <h4 className="font-heading text-sm text-text-primary">Comparacao</h4>

        {/* Chromatic strip comparison */}
        <div className="space-y-2">
          <div className="flex items-center gap-1">
            <span className="text-xs text-text-muted w-20 shrink-0">
              {patternA.label.split(" ")[0]}:
            </span>
            <div className="flex gap-0.5 flex-1">
              {ALL_CHROMATIC.map((n) => {
                const noteIdx = (rootNote + n) % 12;
                const inA = notesA.has(noteIdx);
                return (
                  <motion.div
                    key={n}
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: n * 0.03 }}
                    className="flex-1 h-7 rounded-sm flex items-center justify-center text-[10px] font-mono font-medium"
                    style={{
                      background: inA
                        ? notesB.has(noteIdx)
                          ? "var(--color-scale-shared)"
                          : "var(--color-scale-a)"
                        : "var(--color-bg-tertiary)",
                      color: inA ? "#0f1219" : "var(--color-text-muted)",
                    }}
                  >
                    {inA ? getNoteName(noteIdx, rootName) : ""}
                  </motion.div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-1">
            <span className="text-xs text-text-muted w-20 shrink-0">
              {patternB.label.split(" ")[0]}:
            </span>
            <div className="flex gap-0.5 flex-1">
              {ALL_CHROMATIC.map((n) => {
                const noteIdx = (rootNote + n) % 12;
                const inB = notesB.has(noteIdx);
                return (
                  <motion.div
                    key={n}
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: n * 0.03 }}
                    className="flex-1 h-7 rounded-sm flex items-center justify-center text-[10px] font-mono font-medium"
                    style={{
                      background: inB
                        ? notesA.has(noteIdx)
                          ? "var(--color-scale-shared)"
                          : "var(--color-scale-b)"
                        : "var(--color-bg-tertiary)",
                      color: inB ? "#0f1219" : "var(--color-text-muted)",
                    }}
                  >
                    {inB ? getNoteName(noteIdx, rootName) : ""}
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex gap-4 text-xs text-text-secondary">
          <span className="flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ background: "var(--color-scale-shared)" }}
            />
            Em comum ({shared.length})
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ background: "var(--color-scale-a)" }}
            />
            Apenas {patternA.label.split(" ")[0]} ({onlyA.length})
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ background: "var(--color-scale-b)" }}
            />
            Apenas {patternB.label.split(" ")[0]} ({onlyB.length})
          </span>
        </div>

        {/* Summary text */}
        <p className="text-sm text-text-secondary">
          {shared.length} nota{shared.length !== 1 ? "s" : ""} em comum.
          {diffDegrees.length > 0 && (
            <>
              {" "}
              A diferenca esta no{diffDegrees.length > 1 ? "s" : ""} grau
              {diffDegrees.length > 1 ? "s" : ""} {diffDegrees.join(", ")}.
            </>
          )}
        </p>
      </motion.div>
    </AnimatePresence>
  );
}
