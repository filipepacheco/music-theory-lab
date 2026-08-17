import { useAppStore } from '@/store/useAppStore';
import { useSynth } from '@/hooks/useSynth';
import {
  MAX_PROGRESSION_STEPS,
  type ProgressionStep,
} from '@/constants/progressions';
import ChordCard from '@/components/harmonicField/ChordCard';

interface DiatonicChordStripProps {
  title: string;
  stepCount: number;
  onSelect: (step: ProgressionStep) => void;
}

/** Harmonic-field chord strip: preview + add, capped at MAX_PROGRESSION_STEPS. */
export default function DiatonicChordStrip({
  title,
  stepCount,
  onSelect,
}: DiatonicChordStripProps) {
  const harmonicField = useAppStore((s) => s.harmonicField);
  const { playChord } = useSynth();

  const handleChordClick = (index: number) => {
    if (stepCount >= MAX_PROGRESSION_STEPS) return;
    const chord = harmonicField[index];
    playChord(chord.notes);
    onSelect({ degree: index, label: chord.romanNumeral });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-heading text-sm text-text-secondary">{title}</h4>
        <span className="text-[10px] font-mono text-text-muted">
          {stepCount} acordes
        </span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-2" role="group" aria-label={title}>
        {harmonicField.map((chord, index) => (
          <ChordCard
            key={`${chord.chordName}-${index}`}
            romanNumeral={chord.romanNumeral}
            chordName={chord.chordName}
            harmonicFunction={chord.harmonicFunction}
            noteNames={chord.noteNames}
            intervals={chord.intervals}
            isSelected={false}
            index={index}
            onClick={() => handleChordClick(index)}
          />
        ))}
      </div>
    </div>
  );
}
