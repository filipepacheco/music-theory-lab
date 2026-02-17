import { AnimatePresence, motion } from "framer-motion";
import { useAppStore } from "@/store/useAppStore";
import type { HarmonicFunction } from "@/constants/harmonicFields";

const FUNCTION_LABELS: Record<string, string> = {
  T: "Tonica",
  SD: "Subdominante",
  D: "Dominante",
};

const FUNCTION_COLORS: Record<string, string> = {
  T: "var(--color-tonic)",
  SD: "var(--color-subdominant)",
  D: "var(--color-dominant)",
};

function analyzeProgression(
  functions: (HarmonicFunction | null)[],
): string | null {
  if (functions.length < 2) return null;

  const parts: string[] = [];

  // Check for ii-V-I
  for (let i = 0; i < functions.length - 2; i++) {
    if (
      functions[i] === "SD" &&
      functions[i + 1] === "D" &&
      functions[i + 2] === "T"
    ) {
      parts.push(
        "Contem um movimento SD - D - T (preparacao - tensao - resolucao), o padrao mais forte da harmonia tonal.",
      );
      break;
    }
  }

  // Check if starts and ends on tonic
  if (functions[0] === "T" && functions[functions.length - 1] === "T") {
    parts.push(
      "Comeca e termina na tonica, criando uma sensacao circular e estavel.",
    );
  } else if (functions[0] === "T" && functions[functions.length - 1] === "D") {
    parts.push(
      "Comeca na tonica e termina na dominante, deixando uma sensacao de suspensao.",
    );
  } else if (functions[0] !== "T") {
    parts.push(
      "Nao comeca na tonica, o que cria uma sensacao de movimento desde o inicio.",
    );
  }

  // Check for chromatic chords
  if (functions.includes(null)) {
    parts.push(
      "Usa acordes fora do campo harmonico, adicionando cor e surpresa.",
    );
  }

  return parts.length > 0 ? parts.join(" ") : null;
}

export default function ProgressionAnalysis() {
  const customProgression = useAppStore((s) => s.customProgression);
  const harmonicField = useAppStore((s) => s.harmonicField);

  if (customProgression.length < 2) return null;

  const functions: (HarmonicFunction | null)[] = customProgression.map(
    (step) => {
      if (step.degree !== null && harmonicField[step.degree]) {
        return harmonicField[step.degree].harmonicFunction;
      }
      return null;
    },
  );

  const analysis = analyzeProgression(functions);
  const label = customProgression.map((s) => s.label).join(" - ");

  // Count function usage
  const counts: Record<string, number> = { T: 0, SD: 0, D: 0 };
  for (const f of functions) {
    if (f) counts[f]++;
  }
  const maxCount = Math.max(counts.T, counts.SD, counts.D, 1);

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={label}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.2 }}
        className="bg-bg-card border border-border-default rounded-lg p-4 space-y-3"
      >
        <div className="flex items-center gap-2">
          <h4 className="font-heading text-sm text-text-primary">Analise</h4>
          <span className="font-mono text-xs text-text-secondary">{label}</span>
        </div>

        {/* Function flow */}
        <div className="flex gap-1 flex-wrap">
          {functions.map((fn, i) => (
            <span
              key={i}
              className="px-2 py-0.5 rounded text-xs font-mono font-medium"
              style={{
                background: fn ? FUNCTION_COLORS[fn] : "var(--color-accent)",
                color: "#0f1219",
              }}
            >
              {fn ? FUNCTION_LABELS[fn] : "Cromatico"}
            </span>
          ))}
        </div>

        {/* Function distribution - horizontal bars */}
        <div className="space-y-1.5">
          {(["T", "SD", "D"] as const).map((fn) => (
            <div key={fn} className="flex items-center gap-2">
              <span className="text-xs text-text-secondary w-24 shrink-0">
                {FUNCTION_LABELS[fn]}
              </span>
              <div className="flex-1 h-2 bg-bg-tertiary rounded-full overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: FUNCTION_COLORS[fn] }}
                  initial={{ width: 0 }}
                  animate={{
                    width: `${(counts[fn] / maxCount) * 100}%`,
                  }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                />
              </div>
              <span className="text-xs font-mono text-text-muted w-4 text-right">
                {counts[fn]}
              </span>
            </div>
          ))}
        </div>

        {analysis && (
          <p className="text-sm text-text-secondary leading-relaxed border-l-2 border-accent/40 pl-3">
            {analysis}
          </p>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
