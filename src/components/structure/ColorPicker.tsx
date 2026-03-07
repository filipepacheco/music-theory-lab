import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { STRUCTURE_PALETTE } from '@/constants/structureColors';

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  size?: 'sm' | 'md';
}

export default function ColorPicker({
  value,
  onChange,
  size = 'md',
}: ColorPickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('pointerdown', handleClick);
    return () => document.removeEventListener('pointerdown', handleClick);
  }, [open]);

  const triggerSize = size === 'sm' ? 'w-5 h-5' : 'w-6 h-6';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        onPointerDown={(e) => e.stopPropagation()}
        className={`${triggerSize} rounded-full border-2 border-white/20 hover:border-white/40 transition-colors cursor-pointer shrink-0`}
        style={{ backgroundColor: value }}
        aria-label="Escolher cor"
      />
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.12 }}
            className="absolute z-50 left-full ml-2 top-1/2 -translate-y-1/2 bg-bg-card border border-border-default rounded-lg p-2.5 shadow-lg"
          >
            <div className="grid grid-cols-6 gap-1.5">
              {STRUCTURE_PALETTE.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange(color);
                    setOpen(false);
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  className={`w-6 h-6 rounded-full transition-transform hover:scale-110 cursor-pointer ${
                    value === color
                      ? 'ring-2 ring-white ring-offset-1 ring-offset-bg-card'
                      : ''
                  }`}
                  style={{ backgroundColor: color }}
                  aria-label={color}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
