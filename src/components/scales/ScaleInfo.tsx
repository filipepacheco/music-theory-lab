import { AnimatePresence, motion } from "framer-motion";
import { useAppStore } from "@/store/useAppStore";
import { SCALE_PATTERNS } from "@/constants/scales";
import { SCALE_DESCRIPTIONS } from "@/constants/scaleDescriptions";
import { getScaleNotes } from "@/utils/musicTheory";
import { getNoteName } from "@/utils/noteHelpers";
import { useSynth } from "@/hooks/useSynth";

const INTERVAL_LABELS: Record<number, string> = {
  0: "U",
  1: "ST",
  2: "T",
  3: "m3",
  4: "M3",
  5: "4J",
  6: "TT",
  7: "5J",
  8: "m6",
  9: "M6",
  10: "m7",
  11: "M7",
};

function getStepLabels(intervals: number[]): string[] {
  const steps: string[] = [];
  for (let i = 1; i < intervals.length; i++) {
    const diff = intervals[i] - intervals[i - 1];
    if (diff === 1) steps.push("ST");
    else if (diff === 2) steps.push("T");
    else if (diff === 3) steps.push("T+ST");
    else steps.push(`${diff}st`);
  }
  return steps;
}

interface ScaleDetailProps {
  scaleId: string;
  color: string;
  rootNote: number;
  rootName: string;
  showPlayButton?: boolean;
}

function ScaleDetail({
  scaleId,
  color,
  rootNote,
  rootName,
  showPlayButton,
}: ScaleDetailProps) {
  const pattern = SCALE_PATTERNS[scaleId];
  const description = SCALE_DESCRIPTIONS[scaleId];
  const notes = getScaleNotes(rootNote, scaleId);
  const noteNames = notes.map((n) => getNoteName(n, rootName));
  const steps = getStepLabels(pattern.intervals);
  const { playScale } = useSynth();

  const handlePlay = () => {
    playScale(notes, 4);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-3 h-3 rounded-full" style={{ background: color }} />
        <h3 className="font-heading text-sm text-text-primary">
          {pattern.label}
        </h3>
        {showPlayButton && (
          <button
            onClick={handlePlay}
            className="ml-auto px-3 py-2 text-xs font-medium bg-bg-tertiary border border-border-default rounded-md hover:bg-bg-hover transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-accent"
          >
            Ouvir escala
          </button>
        )}
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {noteNames.map((name, i) => (
          <span
            key={i}
            className="px-2 py-0.5 rounded text-xs font-mono font-medium"
            style={{ background: color, color: "#0f1219" }}
          >
            {name}
          </span>
        ))}
      </div>

      <div className="flex items-center gap-1 flex-wrap">
        <span className="text-xs text-text-muted mr-1">Intervalos:</span>
        {pattern.intervals.map((interval, i) => (
          <span
            key={i}
            className="px-1.5 py-0.5 bg-bg-tertiary rounded text-xs font-mono text-text-secondary"
          >
            {INTERVAL_LABELS[interval] ?? interval}
          </span>
        ))}
      </div>

      <div className="flex items-center gap-1 flex-wrap">
        <span className="text-xs text-text-muted mr-1">Passos:</span>
        {steps.map((step, i) => (
          <span
            key={i}
            className="px-1.5 py-0.5 bg-bg-tertiary rounded text-xs font-mono text-text-secondary"
          >
            {step}
          </span>
        ))}
      </div>

      {description && (
        <p className="text-sm text-text-secondary leading-relaxed">
          <span className="text-text-primary font-medium">
            {description.character}.
          </span>{" "}
          {description.usage}
        </p>
      )}
    </div>
  );
}

export default function ScaleInfo() {
  const selectedScaleId = useAppStore((s) => s.selectedScaleId);
  const comparisonScaleId = useAppStore((s) => s.comparisonScaleId);
  const rootNote = useAppStore((s) => s.rootNote);
  const rootName = getNoteName(rootNote);

  return (
    <AnimatePresence mode="wait">
      {selectedScaleId && (
        <motion.div
          key={`${selectedScaleId}-${comparisonScaleId}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
          className="bg-bg-card border border-border-default rounded-lg p-4 space-y-4"
        >
          <ScaleDetail
            scaleId={selectedScaleId}
            color="var(--color-scale-a)"
            rootNote={rootNote}
            rootName={rootName}
            showPlayButton
          />

          {comparisonScaleId && (
            <>
              <div className="border-t border-border-default" />
              <ScaleDetail
                scaleId={comparisonScaleId}
                color="var(--color-scale-b)"
                rootNote={rootNote}
                rootName={rootName}
                showPlayButton
              />
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
