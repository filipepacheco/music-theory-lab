import type { HarmonicFunction } from "@/constants/harmonicFields";
import { HARMONIC_FUNCTION_LABELS } from "@/constants/explanations";

const BADGE_STYLES: Record<HarmonicFunction, string> = {
  T: "bg-tonic/20 text-tonic-light",
  SD: "bg-subdominant/20 text-subdominant-light",
  D: "bg-dominant/20 text-dominant-light",
};

interface BadgeProps {
  harmonicFunction: HarmonicFunction;
}

export default function Badge({ harmonicFunction }: BadgeProps) {
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${BADGE_STYLES[harmonicFunction]}`}
    >
      {HARMONIC_FUNCTION_LABELS[harmonicFunction]}
    </span>
  );
}
