import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAppStore } from '@/store/useAppStore';
import { useSongs } from '@/hooks/useSongs';

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
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
      onClick={handleSave}
      disabled={!canSave}
      className="flex items-center gap-1.5 text-sm font-medium px-6 py-2.5 rounded-lg border border-accent/40 text-accent hover:bg-accent/10 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
    >
      <span>
        {saving
          ? 'Salvando...'
          : activeSongId
            ? 'Atualizar'
            : 'Salvar'}
      </span>
      {!saving && <span>Musica</span>}
    </motion.button>
  );
}
