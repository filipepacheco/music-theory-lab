import type { HarmonicFunction } from "@/constants/harmonicFields";
import { HARMONIC_FUNCTION_LABELS } from "@/constants/explanations";

const LEGEND_ITEMS: { fn: HarmonicFunction; label: string; fullLabel: string; colorClass: string }[] = [
  { fn: "T", label: "T", fullLabel: HARMONIC_FUNCTION_LABELS.T, colorClass: "bg-tonic" },
  { fn: "SD", label: "SD", fullLabel: HARMONIC_FUNCTION_LABELS.SD, colorClass: "bg-subdominant" },
  { fn: "D", label: "D", fullLabel: HARMONIC_FUNCTION_LABELS.D, colorClass: "bg-dominant" },
];

interface FunctionLegendProps {
  compact?: boolean;
}

export default function FunctionLegend({ compact }: FunctionLegendProps) {
  if (compact) {
    return (
      <div className="flex items-center gap-3">
        {LEGEND_ITEMS.map(({ fn, label, colorClass }) => (
          <div key={fn} className="flex items-center gap-1">
            <div className={`w-2 h-2 rounded-full ${colorClass}`} />
            <span className="text-[10px] text-text-muted">{label}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex gap-4 mb-4">
      {LEGEND_ITEMS.map(({ fn, fullLabel, colorClass }) => (
        <div key={fn} className="flex items-center gap-1.5">
          <div className={`w-3 h-3 rounded-full ${colorClass}`} />
          <span className="text-xs text-text-secondary">
            {fullLabel}
          </span>
        </div>
      ))}
    </div>
  );
}
