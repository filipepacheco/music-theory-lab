import { motion, AnimatePresence } from "framer-motion";
import { useAppStore } from "@/store/useAppStore";
import { getNoteName } from "@/utils/noteHelpers";
import type { HarmonicFunction } from "@/constants/harmonicFields";

const FUNCTION_BORDER: Record<string, string> = {
  T: "var(--color-tonic)",
  SD: "var(--color-subdominant)",
  D: "var(--color-dominant)",
};

export default function ProgressionTimeline() {
  const customProgression = useAppStore((s) => s.customProgression);
  const removeProgressionStep = useAppStore((s) => s.removeProgressionStep);
  const setProgressionStepBeats = useAppStore(
    (s) => s.setProgressionStepBeats,
  );
  const clearProgression = useAppStore((s) => s.clearProgression);
  const harmonicField = useAppStore((s) => s.harmonicField);
  const rootNote = useAppStore((s) => s.rootNote);
  const rootName = getNoteName(rootNote);

  if (customProgression.length === 0) {
    return (
      <div className="border border-dashed border-border-default rounded-lg p-8 text-center">
        <div className="text-2xl text-text-muted/40 mb-2">+</div>
        <p className="text-sm text-text-secondary">
          Clique nos acordes acima para montar sua progressao
        </p>
        <p className="text-xs text-text-muted mt-1">
          ou carregue um exemplo abaixo
        </p>
      </div>
    );
  }

  const totalBeats = customProgression.reduce(
    (sum, s) => sum + (s.beats ?? 4),
    0,
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="font-heading text-sm text-text-secondary">
          Sua progressao ({customProgression.length} acordes, {totalBeats}{" "}
          tempos)
        </h3>
        <button
          onClick={() => {
            if (window.confirm("Limpar toda a progressao?")) clearProgression();
          }}
          className="text-xs text-text-muted hover:text-text-primary transition-colors cursor-pointer"
        >
          Limpar
        </button>
      </div>

      <div
        className="flex gap-2 overflow-x-auto pb-1"
        style={{ scrollbarWidth: "thin" }}
      >
        <AnimatePresence mode="popLayout">
          {customProgression.map((step, idx) => {
            let hFunc: HarmonicFunction | null = null;
            let chordName = step.label;
            let noteNames: string[] = [];

            if (step.degree !== null && harmonicField[step.degree]) {
              const chord = harmonicField[step.degree];
              hFunc = chord.harmonicFunction;
              chordName = chord.chordName;
              noteNames = chord.noteNames;
            } else if (step.intervals) {
              noteNames = step.intervals.map((i) =>
                getNoteName((rootNote + i) % 12, rootName),
              );
            }

            const borderColor = hFunc
              ? FUNCTION_BORDER[hFunc]
              : "var(--color-accent)";
            const beats = step.beats ?? 4;

            return (
              <motion.div
                key={`${idx}-${step.label}`}
                layout
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.15 }}
                className="relative flex flex-col items-center gap-0.5 px-3 py-3 rounded-lg bg-bg-card border min-w-[80px] group"
                style={{ borderColor }}
              >
                {/* Remove button */}
                <button
                  onClick={() => removeProgressionStep(idx)}
                  aria-label="Remover acorde"
                  className="absolute -top-2 -right-2 w-6 h-6 flex items-center justify-center rounded-full text-[10px] bg-bg-tertiary border border-border-default text-text-muted hover:text-red-400 hover:bg-red-400/10 transition-colors cursor-pointer opacity-60 hover:opacity-100 focus-visible:ring-2 focus-visible:ring-accent"
                >
                  X
                </button>

                {/* Chord info */}
                <span
                  className="font-mono text-base font-medium"
                  style={{ color: borderColor }}
                >
                  {step.label}
                </span>
                <span className="font-mono text-[10px] text-text-secondary">
                  {chordName}
                </span>
                <span className="font-mono text-[10px] text-text-muted">
                  {noteNames.join(" ")}
                </span>

                {/* Beat controls */}
                <div className="flex items-center gap-1 mt-1 border-t border-border-default pt-1 w-full justify-center">
                  <button
                    onClick={() => setProgressionStepBeats(idx, beats - 0.5)}
                    disabled={beats <= 0.5}
                    aria-label="Diminuir tempos"
                    className="w-8 h-8 flex items-center justify-center rounded text-xs font-mono bg-bg-tertiary text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    -
                  </button>
                  <span
                    className="text-xs font-mono text-text-secondary min-w-[28px] text-center"
                    title="Tempos (quarter notes)"
                  >
                    {beats % 1 === 0 ? beats : beats.toFixed(1)}t
                  </span>
                  <button
                    onClick={() => setProgressionStepBeats(idx, beats + 0.5)}
                    disabled={beats >= 8}
                    aria-label="Aumentar tempos"
                    className="w-8 h-8 flex items-center justify-center rounded text-xs font-mono bg-bg-tertiary text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    +
                  </button>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
