import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAppStore } from '@/store/useAppStore';
import { useStructures } from '@/hooks/useStructures';

export default function SaveStructureButton() {
  const activeStructureId = useAppStore((s) => s.activeStructureId);
  const setActiveStructureId = useAppStore((s) => s.setActiveStructureId);
  const structureTitle = useAppStore((s) => s.structureTitle);
  const structureArtist = useAppStore((s) => s.structureArtist);
  const structureBpm = useAppStore((s) => s.structureBpm);
  const structureBars = useAppStore((s) => s.structureBars);
  const structureSections = useAppStore((s) => s.structureSections);
  const { save, update } = useStructures();

  const [saving, setSaving] = useState(false);

  const canSave =
    structureTitle.trim().length > 0 &&
    structureBars.length > 0 &&
    !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);

    const data = {
      title: structureTitle.trim(),
      artist: structureArtist.trim(),
      bpm: structureBpm,
      bars: structureBars,
      sections: structureSections,
    };

    try {
      if (activeStructureId) {
        await update(activeStructureId, data);
      } else {
        const id = await save(data);
        if (id) setActiveStructureId(id);
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
      className="flex items-center justify-center gap-1.5 text-sm font-medium px-6 py-3 sm:py-2.5 rounded-button border border-accent/40 text-accent hover:bg-accent/10 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed w-full sm:w-auto"
    >
      <span>
        {saving
          ? 'Salvando...'
          : activeStructureId
            ? 'Atualizar'
            : 'Salvar'}
      </span>
      {!saving && <span>Estrutura</span>}
    </motion.button>
  );
}
