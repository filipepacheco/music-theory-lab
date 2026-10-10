import { useAppStore } from '@/store/useAppStore';
import { useSynth } from '@/hooks/useSynth';
import { getScaleNotes } from '@/utils/musicTheory';
import Button from '@/components/shared/Button';

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
    <Button size="sm" onClick={handleClick} title="Ouvir escala da tonalidade">
      Ouvir tom
    </Button>
  );
}
