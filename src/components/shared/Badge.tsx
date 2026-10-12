import type { HarmonicFunction } from "@/constants/harmonicFields";
import { HARMONIC_FUNCTION_LABELS } from "@/constants/explanations";
import Tag, { type TagTone } from "@/components/shared/Tag";

const BADGE_TONES: Record<HarmonicFunction, TagTone> = {
  T: "tonic",
  SD: "subdominant",
  D: "dominant",
};

interface BadgeProps {
  harmonicFunction: HarmonicFunction;
}

export default function Badge({ harmonicFunction }: BadgeProps) {
  return (
    <Tag tone={BADGE_TONES[harmonicFunction]}>
      {HARMONIC_FUNCTION_LABELS[harmonicFunction]}
    </Tag>
  );
}
