import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '@/store/useAppStore';
import { SECTION_LABELS, SECTION_COLORS } from '@/constants/songSections';
import type { SectionType } from '@/types';

const SECTION_TYPES: SectionType[] = [
  'intro',
  'verso',
  'pre-refrao',
  'refrao',
  'ponte',
  'solo',
  'outro',
  'custom',
];

export default function SectionTabs({
  playingSectionIndex,
}: {
  playingSectionIndex?: number;
}) {
  const songSections = useAppStore((s) => s.songSections);
  const activeSectionIndex = useAppStore((s) => s.activeSectionIndex);
  const setActiveSectionIndex = useAppStore((s) => s.setActiveSectionIndex);
  const addSection = useAppStore((s) => s.addSection);
  const removeSection = useAppStore((s) => s.removeSection);

  const [showDropdown, setShowDropdown] = useState(false);

  const handleAddSection = (type: SectionType) => {
    addSection(type);
    setShowDropdown(false);
  };

  // Close dropdown on Escape
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') setShowDropdown(false);
  }, []);

  useEffect(() => {
    if (showDropdown) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [showDropdown, handleKeyDown]);

  return (
    <div className="flex items-center gap-1">
      {/* Scrollable tabs */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1 min-w-0 flex-1" style={{ scrollbarWidth: 'thin' }}>
        <AnimatePresence mode="popLayout">
          {songSections.map((section, index) => {
            const color = SECTION_COLORS[section.type];
            const label = section.customLabel || SECTION_LABELS[section.type];
            const isActive = index === activeSectionIndex;
            const isPlaying = index === playingSectionIndex;

            return (
              <motion.div
                key={section.id}
                layout
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.15 }}
                className="relative group"
              >
                <button
                  onClick={() => setActiveSectionIndex(index)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
                    isActive
                      ? 'bg-bg-card text-text-primary shadow-sm'
                      : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/50'
                  }`}
                  style={{
                    borderBottom: isActive ? `2px solid ${color}` : '2px solid transparent',
                    boxShadow: isPlaying ? `0 0 8px ${color}40` : undefined,
                  }}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  {label}
                  {section.steps.length > 0 && (
                    <span className="text-[10px] text-text-muted font-mono">
                      ({section.steps.length})
                    </span>
                  )}
                </button>

                {/* Remove button */}
                {songSections.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm(`Remover secao "${label}"?`))
                        removeSection(index);
                    }}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 flex items-center justify-center rounded-full text-[8px] bg-bg-tertiary border border-border-default text-text-muted hover:text-red-400 hover:bg-red-400/10 transition-colors cursor-pointer opacity-0 group-hover:opacity-60 hover:!opacity-100 focus:opacity-100 focus-visible:ring-2 focus-visible:ring-accent"
                    aria-label={`Remover ${label}`}
                  >
                    X
                  </button>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Add section button */}
      <div className="relative shrink-0">
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-sm text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors cursor-pointer"
          aria-label="Adicionar secao"
        >
          +
        </button>

        <AnimatePresence>
          {showDropdown && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15 }}
              className="absolute top-full right-0 mt-1 z-20 bg-bg-card border border-border-default rounded-lg shadow-lg py-1 min-w-[160px]"
            >
              {SECTION_TYPES.map((type) => (
                <button
                  key={type}
                  onClick={() => handleAddSection(type)}
                  className="flex items-center gap-2 w-full px-3 py-2 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-tertiary transition-colors cursor-pointer"
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: SECTION_COLORS[type] }}
                  />
                  {SECTION_LABELS[type]}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
