import { useAppStore } from "@/store/useAppStore";
import DiatonicChordStrip from "@/components/shared/DiatonicChordStrip";

export default function ProgressionChordPicker() {
  const addProgressionStep = useAppStore((s) => s.addProgressionStep);
  const customProgression = useAppStore((s) => s.customProgression);

  return (
    <DiatonicChordStrip
      title="Acordes disponiveis"
      stepCount={customProgression.length}
      onSelect={addProgressionStep}
    />
  );
}
