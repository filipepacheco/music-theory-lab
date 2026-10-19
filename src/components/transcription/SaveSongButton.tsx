import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  selectTranscriptionDocument,
  useAppStore,
} from '@/store/useAppStore';
import { transcriptionDocument } from '@/domain/transcriptionDocument';
import { useSongs } from '@/hooks/useSongs';

export default function SaveSongButton() {
  const activeSongId = useAppStore((s) => s.activeSongId);
  const songTitle = useAppStore((s) => s.songTitle);
  const songSections = useAppStore((s) => s.songSections);
  const markSongSaved = useAppStore((s) => s.markSongSaved);

  const { save, update } = useSongs();
  const [saving, setSaving] = useState(false);

  const canSave = songTitle.trim().length > 0 && songSections.length > 0 && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);

    // The document builds the record: it stores the base tempo, never the
    // tempo that plays at the current practice speed.
    const data = transcriptionDocument.toSongRecord(
      selectTranscriptionDocument(useAppStore.getState()),
    );

    try {
      if (activeSongId) {
        await update(activeSongId, data);
        markSongSaved(activeSongId, data);
      } else {
        const id = await save(data);
        if (id) markSongSaved(id, data);
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
      className="flex items-center gap-1.5 text-sm font-medium px-6 py-2.5 rounded-button border border-accent/40 text-accent hover:bg-accent/10 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
    >
      <span>
        {saving
          ? 'Salvando...'
          : activeSongId
            ? 'Atualizar'
            : 'Salvar'}
      </span>
      {!saving && <span>Música</span>}
    </motion.button>
  );
}
