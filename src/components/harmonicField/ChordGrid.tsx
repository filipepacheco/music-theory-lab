import { useAppStore } from "@/store/useAppStore";
import { useSynth } from "@/hooks/useSynth";
import ChordCard from "./ChordCard";

export default function ChordGrid() {
  const harmonicField = useAppStore((s) => s.harmonicField);
  const selectedChordIndex = useAppStore((s) => s.selectedChordIndex);
  const selectChord = useAppStore((s) => s.selectChord);
  const { playChord } = useSynth();

  const handleChordClick = (index: number) => {
    const chord = harmonicField[index];
    selectChord(index);
    playChord(chord.notes);
  };

  return (
    <div className="flex gap-2 overflow-x-auto pb-2" role="group" aria-label="Acordes do campo harmonico">
      {harmonicField.map((chord, index) => (
        <ChordCard
          key={`${chord.chordName}-${index}`}
          romanNumeral={chord.romanNumeral}
          chordName={chord.chordName}
          harmonicFunction={chord.harmonicFunction}
          noteNames={chord.noteNames}
          intervals={chord.intervals}
          isSelected={selectedChordIndex === index}
          index={index}
          onClick={() => handleChordClick(index)}
        />
      ))}
    </div>
  );
}
