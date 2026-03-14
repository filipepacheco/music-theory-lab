import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useAppStore } from '@/store/useAppStore';
import {
  TIME_SIGNATURES,
  STRUCTURE_PALETTE,
} from '@/constants/structureColors';
import type { StructureBar } from '@/types';

const DOT_COUNTS: Record<string, number> = {
  '4/4': 8,
  '3/4': 6,
  '2/4': 4,
  '6/8': 6,
};

interface BarEditorPopoverProps {
  bar: StructureBar;
  sectionColor: string;
  onClose: () => void;
}

export default function BarEditorPopover({
  bar,
  sectionColor,
  onClose,
}: BarEditorPopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const setBarTimeSignature = useAppStore((s) => s.setBarTimeSignature);
  const setBarColor = useAppStore((s) => s.setBarColor);
  const toggleBarAccent = useAppStore((s) => s.toggleBarAccent);

  const effectiveColor = bar.color ?? sectionColor;
  const dotCount = DOT_COUNTS[bar.timeSignature] ?? 8;
  const perRow = dotCount / 2;
  const accentSet = new Set(bar.accents ?? []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    // Delay to avoid the double-click that opened this from closing it
    const timer = setTimeout(() => {
      document.addEventListener('pointerdown', handleClick);
    }, 100);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('pointerdown', handleClick);
    };
  }, [onClose]);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale: 0.9, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: -4 }}
      transition={{ duration: 0.12 }}
      className="absolute z-50 left-1/2 -translate-x-1/2 top-full mt-2 bg-bg-card border border-border-default rounded-xl p-3 shadow-xl min-w-[200px]"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Time signature */}
      <div className="mb-3">
        <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1.5">
          Compasso
        </div>
        <div className="flex gap-1">
          {TIME_SIGNATURES.map((ts) => (
            <button
              key={ts}
              type="button"
              onClick={() => setBarTimeSignature(bar.id, ts)}
              className={`px-2.5 py-1 text-xs rounded-md transition-colors cursor-pointer ${
                bar.timeSignature === ts
                  ? 'bg-accent/20 text-accent font-bold border border-accent/40'
                  : 'bg-bg-tertiary text-text-secondary hover:bg-bg-tertiary/80 border border-transparent'
              }`}
            >
              {ts}
            </button>
          ))}
        </div>
      </div>

      {/* Accent dots */}
      <div className="mb-3">
        <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1.5">
          Acentos
        </div>
        <div className="flex flex-col items-start gap-1.5">
          {[0, 1].map((row) => (
            <div key={row} className="flex gap-1.5">
              {Array.from({ length: perRow }, (_, col) => {
                const idx = row * perRow + col;
                const isAccent = accentSet.has(idx);
                const isDownbeat = idx % 2 === 0;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => toggleBarAccent(bar.id, idx)}
                    className={`w-5 h-5 rounded-full transition-all cursor-pointer flex items-center justify-center ${
                      isDownbeat ? 'ring-1 ring-border-default/30' : ''
                    }`}
                    style={{
                      backgroundColor: isAccent
                        ? effectiveColor
                        : 'transparent',
                      border: `1.5px solid ${isAccent ? effectiveColor : 'var(--color-border-default)'}`,
                      opacity: isAccent ? 1 : 0.4,
                    }}
                    title={
                      isDownbeat
                        ? `Tempo ${Math.floor(idx / 2) + 1}`
                        : `${Math.floor(idx / 2) + 1}e`
                    }
                  >
                    {isAccent && (
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: 'white' }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Color picker */}
      <div>
        <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1.5">
          Cor
        </div>
        <div className="flex flex-wrap gap-1.5 items-center">
          {STRUCTURE_PALETTE.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => {
                setBarColor(bar.id, color);
              }}
              className={`w-5 h-5 rounded-full transition-transform hover:scale-110 cursor-pointer ${
                bar.color === color
                  ? 'ring-2 ring-white ring-offset-1 ring-offset-bg-card'
                  : ''
              }`}
              style={{ backgroundColor: color }}
            />
          ))}
          {/* Clear color */}
          <button
            type="button"
            onClick={() => setBarColor(bar.id, undefined)}
            className="w-5 h-5 rounded-full border border-border-default bg-bg-tertiary flex items-center justify-center text-[9px] text-text-muted hover:text-text-primary transition-colors cursor-pointer"
            title="Remover cor"
          >
            X
          </button>
        </div>
      </div>
    </motion.div>
  );
}
