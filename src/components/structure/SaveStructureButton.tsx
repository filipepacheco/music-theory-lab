import { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { useStructures } from '@/hooks/useStructures';
import Button from '@/components/shared/Button';

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
    <Button onClick={handleSave} disabled={!canSave}>
      {saving
        ? 'Salvando...'
        : activeStructureId
          ? 'Atualizar estrutura'
          : 'Salvar estrutura'}
    </Button>
  );
}
