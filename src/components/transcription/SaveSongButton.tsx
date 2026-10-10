import { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { useSongs } from '@/hooks/useSongs';
import Button from '@/components/shared/Button';

export default function SaveSongButton() {
  const activeSongId = useAppStore((s) => s.activeSongId);
  const songTitle = useAppStore((s) => s.songTitle);
  const songArtist = useAppStore((s) => s.songArtist);
  const songSections = useAppStore((s) => s.songSections);
  const rootNote = useAppStore((s) => s.rootNote);
  const isMinor = useAppStore((s) => s.isMinor);
  const bpm = useAppStore((s) => s.bpm);
  const activePresetId = useAppStore((s) => s.activePresetId);

  const { save, update } = useSongs();
  const [saving, setSaving] = useState(false);

  const canSave = songTitle.trim().length > 0 && songSections.length > 0 && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);

    const data = {
      title: songTitle.trim(),
      artist: songArtist.trim(),
      key: rootNote,
      mode: (isMinor ? 'minor' : 'major') as 'major' | 'minor',
      originalBpm: bpm,
      presetId: activePresetId,
      sections: songSections,
    };

    try {
      if (activeSongId) {
        await update(activeSongId, data);
      } else {
        const id = await save(data);
        useAppStore.setState({ activeSongId: id });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Button onClick={handleSave} disabled={!canSave}>
      {saving
        ? 'Salvando...'
        : activeSongId
          ? 'Atualizar música'
          : 'Salvar música'}
    </Button>
  );
}
