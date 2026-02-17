import { useAppStore } from "@/store/useAppStore";
import { useSynth } from "@/hooks/useSynth";
import ChordCard from "@/components/harmonicField/ChordCard";

export default function ProgressionChordPicker() {
  const harmonicField = useAppStore((s) => s.harmonicField);
  const addProgressionStep = useAppStore((s) => s.addProgressionStep);
  const customProgression = useAppStore((s) => s.customProgression);
  const { playChord } = useSynth();

  const handleChordClick = (index: number) => {
    if (customProgression.length >= 64) return;
    const chord = harmonicField[index];
    playChord(chord.notes);
    addProgressionStep({
      degree: index,
      label: chord.romanNumeral,
    });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-heading text-sm text-text-secondary">
          Acordes disponiveis
        </h4>
        <span className="text-[10px] font-mono text-text-muted">
          {customProgression.length} acordes
        </span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-2" role="group" aria-label="Acordes disponiveis para adicionar">
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
