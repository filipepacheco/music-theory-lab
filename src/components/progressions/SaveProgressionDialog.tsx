import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ProgressionStep } from '@/constants/progressions';

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
          <div role="dialog" aria-label="Salvar progressao" className="bg-bg-secondary/60 border border-accent/20 rounded-lg p-4 space-y-3">
            <h3 className="font-heading text-sm text-text-primary flex items-center gap-1.5">
              <span className="text-accent">+</span>
              Salvar progressao
            </h3>

            <input
              type="text"
              placeholder="Nome (obrigatorio)"
              aria-label="Nome da progressao"
              maxLength={60}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-bg-tertiary border border-border-default rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              autoFocus
            />

            <input
              type="text"
              placeholder="Descricao (opcional)"
              aria-label="Descricao da progressao"
              maxLength={200}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-bg-tertiary border border-border-default rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            />

            <div className="flex gap-2 justify-end">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm rounded-button border border-border-default text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={!canSave}
                className="px-6 py-2.5 text-sm rounded-button bg-accent text-white hover:opacity-90 disabled:opacity-40 transition-opacity cursor-pointer disabled:cursor-not-allowed"
              >
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
