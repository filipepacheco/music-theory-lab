import { useAppStore } from '@/store/useAppStore';
import type { ProgressionStep } from '@/constants/progressions';
import DiatonicChordStrip from '@/components/shared/DiatonicChordStrip';
import ChromaticChordPicker from '@/components/shared/ChromaticChordPicker';

export default function TranscriptionChordPicker() {
  const addSongStep = useAppStore((s) => s.addSongStep);
  const activeSectionIndex = useAppStore((s) => s.activeSectionIndex);
  const songSections = useAppStore((s) => s.songSections);

  const section = songSections[activeSectionIndex];

  if (!section) {
    return (
      <p className="text-xs text-text-muted">
        Adicione uma seção para começar a transcrever.
      </p>
    );
  }

  const addToSection = (step: ProgressionStep) =>
    addSongStep(activeSectionIndex, step);

  return (
    <div className="space-y-3">
      <DiatonicChordStrip
        title="Acordes do campo harmônico"
        stepCount={section.steps.length}
        onSelect={addToSection}
      />
      <ChromaticChordPicker
        stepCount={section.steps.length}
        onSelect={addToSection}
      />
    </div>
  );
}
