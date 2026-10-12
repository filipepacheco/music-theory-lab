import { useState } from 'react';
import Button from '@/components/shared/Button';
import Select from '@/components/shared/Select';
import type { LibrarySong } from '@/domain/librarySong';

interface GroupOverrideControlProps {
  /** The song that holds the open chart. */
  song: LibrarySong;
  /** The songs of the library that can take the chart. */
  targets: LibrarySong[];
  /** Whether the chart has a group override now. */
  overridden: boolean;
  onMove: (songKey: string) => void;
  onSeparate: () => void;
  onRemove: () => void;
}

/** The controls that correct the group of the open chart. */
export default function GroupOverrideControl({
  song,
  targets,
  overridden,
  onMove,
  onSeparate,
  onRemove,
}: GroupOverrideControlProps) {
  const [choice, setChoice] = useState('');
  const canSeparate = song.charts.length + song.analysed.length > 1;

  return (
    <div
      role="group"
      aria-label="Corrigir a música da cifra"
      className="flex flex-wrap items-center gap-2"
    >
      {targets.length > 0 && (
        <>
          <Select
            aria-label="Mover a cifra para a música"
            value={choice}
            onChange={(event) => setChoice(event.target.value)}
          >
            <option value="">Mover para a música…</option>
            {targets.map((target) => (
              <option key={target.key} value={target.key}>
                {target.artist
                  ? `${target.title} — ${target.artist}`
                  : target.title}
              </option>
            ))}
          </Select>
          <Button
            size="sm"
            disabled={!choice}
            onClick={() => {
              onMove(choice);
              setChoice('');
            }}
          >
            Mover
          </Button>
        </>
      )}
      {canSeparate && (
        <Button size="sm" onClick={onSeparate}>
          Separar da música
        </Button>
      )}
      {overridden && (
        <Button size="sm" onClick={onRemove}>
          Remover correção
        </Button>
      )}
    </div>
  );
}
