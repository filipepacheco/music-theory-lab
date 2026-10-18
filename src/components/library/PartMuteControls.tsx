import Button from '@/components/shared/Button';
import type { PartMutes, PlaybackPart } from '@/domain/songPartsPlayback';

const LABEL: Record<PlaybackPart, string> = {
  bass: 'Baixo',
  drums: 'Bateria',
};

interface Props {
  mutes: PartMutes;
  onToggle: (part: PlaybackPart) => void;
}

export default function PartMuteControls({ mutes, onToggle }: Props) {
  return (
    <div role="group" aria-label="Silenciar partes" className="flex gap-1">
      {(['bass', 'drums'] as const).map((part) => (
        <Button
          key={part}
          size="sm"
          pressed={mutes[part]}
          onClick={() => onToggle(part)}
          aria-label={`Silenciar ${LABEL[part].toLowerCase()}`}
        >
          {mutes[part] ? `${LABEL[part]} mudo` : LABEL[part]}
        </Button>
      ))}
    </div>
  );
}
