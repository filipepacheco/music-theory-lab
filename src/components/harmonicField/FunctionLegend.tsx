import { HARMONIC_FUNCTION_LABELS } from "@/constants/explanations";
import type { HarmonicFunction } from "@/constants/harmonicFields";

const LEGEND_ITEMS: { fn: HarmonicFunction; colorClass: string }[] = [
  { fn: "T", colorClass: "bg-tonic" },
  { fn: "SD", colorClass: "bg-subdominant" },
  { fn: "D", colorClass: "bg-dominant" },
];

export default function FunctionLegend() {
  return (
    <div className="flex gap-4 mb-4">
      {LEGEND_ITEMS.map(({ fn, colorClass }) => (
        <div key={fn} className="flex items-center gap-1.5">
          <div className={`w-3 h-3 rounded-full ${colorClass}`} />
          <span className="text-xs text-text-secondary">
            {HARMONIC_FUNCTION_LABELS[fn]}
          </span>
        </div>
      ))}
    </div>
  );
}
