import Button from '@/components/shared/Button';
import type {
  MuteControl,
  PartMutes,
  PlaybackPart,
} from '@/domain/songPartsPlayback';

const BASS_AND_DRUMS: MuteControl[] = [
  { key: 'bass', label: 'Baixo' },
  { key: 'drums', label: 'Bateria' },
];

interface Props {
  mutes: PartMutes;
  onToggle: (key: PlaybackPart) => void;
  /** One control for each chart. Bass and drums by default. */
  controls?: readonly MuteControl[];
}

export default function PartMuteControls({
  mutes,
  onToggle,
  controls = BASS_AND_DRUMS,
}: Props) {
  return (
    <div role="group" aria-label="Silenciar partes" className="flex gap-1">
      {controls.map(({ key, label }) => (
        <Button
          key={key}
          size="sm"
          pressed={!!mutes[key]}
          onClick={() => onToggle(key)}
          aria-label={`Silenciar ${label.toLowerCase()}`}
        >
          {mutes[key] ? `${label} mudo` : label}
        </Button>
      ))}
    </div>
  );
}
