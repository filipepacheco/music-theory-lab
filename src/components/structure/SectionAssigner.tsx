import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAppStore } from '@/store/useAppStore';
import { SECTION_LABELS } from '@/constants/songSections';
import type { SectionType } from '@/types';

const SECTION_TYPES = Object.keys(SECTION_LABELS) as SectionType[];

export default function SectionAssigner() {
  const selectedBarIds = useAppStore((s) => s.selectedBarIds);
  const assignBarsToSection = useAppStore((s) => s.assignBarsToSection);
  const clearBarSelection = useAppStore((s) => s.clearBarSelection);
  const [selectedType, setSelectedType] = useState<SectionType>('verso');

  if (selectedBarIds.size === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="flex flex-wrap items-center gap-3"
    >
      <span className="text-xs text-text-secondary">
        {selectedBarIds.size} {selectedBarIds.size === 1 ? 'compasso selecionado' : 'compassos selecionados'}
      </span>

      <select
        value={selectedType}
        onChange={(e) => setSelectedType(e.target.value as SectionType)}
        className="px-3 py-1.5 rounded-lg bg-bg-tertiary border border-border-default text-sm text-text-primary focus:outline-none focus:border-accent transition-colors cursor-pointer"
      >
        {SECTION_TYPES.map((type) => (
          <option key={type} value={type}>
            {SECTION_LABELS[type]}
          </option>
        ))}
      </select>

      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.97 }}
        onClick={() => assignBarsToSection(selectedType)}
        className="px-4 py-1.5 rounded-lg text-sm font-medium border border-accent/40 text-accent hover:bg-accent/10 transition-colors cursor-pointer"
      >
        Atribuir
      </motion.button>

      <button
        onClick={clearBarSelection}
        className="text-xs text-text-muted hover:text-text-primary transition-colors cursor-pointer"
      >
        Limpar selecao
      </button>
    </motion.div>
  );
}
