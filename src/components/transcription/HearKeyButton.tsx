import { useAppStore } from '@/store/useAppStore';
import { useSynth } from '@/hooks/useSynth';
import { getScaleNotes } from '@/utils/musicTheory';

export default function HearKeyButton() {
  const rootNote = useAppStore((s) => s.rootNote);
  const isMinor = useAppStore((s) => s.isMinor);
  const { playScale } = useSynth();

  const handleClick = () => {
    const scaleId = isMinor ? 'aeolian' : 'major';
    const notes = getScaleNotes(rootNote, scaleId);
    playScale(notes, 4);
  };

  return (
    <button
      onClick={handleClick}
      className="px-2.5 py-2 rounded-lg text-xs text-text-secondary bg-bg-tertiary border border-border-default hover:border-accent/40 hover:text-accent transition-all cursor-pointer"
      title="Ouvir escala da tonalidade"
    >
      Ouvir tom
    </button>
  );
}
