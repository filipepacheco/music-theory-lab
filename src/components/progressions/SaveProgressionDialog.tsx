import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ProgressionStep } from '@/constants/progressions';
import Button from '@/components/shared/Button';
import Field from '@/components/shared/Field';
import Frame from '@/components/shared/Frame';

interface SaveProgressionDialogProps {
  open: boolean;
  steps: ProgressionStep[];
  mode: 'major' | 'minor';
  presetId: string;
  bpm: number;
  onSave: (prog: {
    name: string;
    description: string;
    steps: ProgressionStep[];
    mode: 'major' | 'minor';
    presetId: string;
    bpm: number;
  }) => Promise<void>;
  onClose: () => void;
}

export default function SaveProgressionDialog({
  open,
  steps,
  mode,
  presetId,
  bpm,
  onSave,
  onClose,
}: SaveProgressionDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const canSave = name.trim().length > 0 && !saving;

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [open, handleKeyDown]);

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName || saving) return;
    setSaving(true);
    try {
      await onSave({
        name: trimmedName,
        description: description.trim(),
        steps,
        mode,
        presetId,
        bpm,
      });
      setName('');
      setDescription('');
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="overflow-hidden"
        >
          <Frame
            role="dialog"
            aria-label="Salvar progressão"
            title="Salvar progressão"
            titleAs="h3"
            variant="dashed"
            className="flex flex-col gap-3"
          >
            <Field
              prompt=">"
              type="text"
              placeholder="Nome (obrigatorio)"
              aria-label="Nome da progressão"
              maxLength={60}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />

            <Field
              prompt=">"
              type="text"
              placeholder="Descrição (opcional)"
              aria-label="Descrição da progressão"
              maxLength={200}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />

            <div className="flex gap-2 justify-end">
              <Button onClick={onClose}>Cancelar</Button>
              <Button variant="primary" onClick={handleSave} disabled={!canSave}>
                {saving ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </Frame>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
