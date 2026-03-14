import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDraggable } from '@dnd-kit/core';
import type { StructureBar } from '@/types';
import BeatDots from '@/components/structure/BeatDots';
import BarEditorPopover from '@/components/structure/BarEditorPopover';

export function DraggableBar({
  bar,
  sectionColor,
  onRemove,
  displayIndex,
}: {
  bar: StructureBar;
  sectionColor?: string;
  onRemove?: () => void;
  displayIndex?: number;
}) {
  const [editorOpen, setEditorOpen] = useState(false);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: bar.id,
    data: { type: 'bar', bar },
  });

  const effectiveColor = bar.color ?? sectionColor;

  return (
    <div className="relative">
      <motion.div
        ref={setNodeRef}
        layout
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: isDragging ? 0.3 : 1 }}
        className="group relative w-10 h-7 sm:w-14 sm:h-10 flex flex-col items-center justify-center rounded-lg text-xs font-mono cursor-grab select-none transition-shadow active:cursor-grabbing"
        style={{
          backgroundColor: effectiveColor
            ? effectiveColor + '20'
            : 'var(--color-bg-tertiary)',
          borderWidth: 1,
          borderStyle: 'solid',
          borderColor: effectiveColor
            ? effectiveColor + '40'
            : 'var(--color-border-default)',
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          setEditorOpen((prev) => !prev);
        }}
        {...attributes}
        {...listeners}
      >
        <span className="text-[10px] sm:text-xs text-text-primary leading-none">
          {displayIndex ?? bar.index + 1}
        </span>
        <div className="hidden sm:flex mt-0.5">
          <BeatDots
            timeSignature={bar.timeSignature}
            accents={bar.accents}
            color={effectiveColor}
          />
        </div>
        {onRemove && (
          <button
            type="button"
            aria-label={`Remover compasso ${bar.index + 1}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="absolute -top-1.5 -right-1.5 w-4 h-4 flex items-center justify-center rounded-full text-[8px] bg-bg-tertiary border border-border-default text-text-muted hover:text-red-400 hover:bg-red-400/10 transition-colors cursor-pointer opacity-60 sm:opacity-0 sm:group-hover:opacity-100"
          >
            X
          </button>
        )}
      </motion.div>
      <AnimatePresence>
        {editorOpen && (
          <BarEditorPopover
            bar={bar}
            sectionColor={sectionColor ?? '#9ca3af'}
            onClose={() => setEditorOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/** Floating overlay bar shown while dragging */
export function BarOverlay({ bar }: { bar: StructureBar }) {
  return (
    <div className="w-14 h-10 sm:w-16 sm:h-12 flex flex-col items-center justify-center rounded-lg text-xs font-mono bg-bg-card border-2 border-accent shadow-lg opacity-90">
      <span className="text-text-primary">{bar.index + 1}</span>
      <BeatDots
        timeSignature={bar.timeSignature}
        accents={bar.accents}
      />
    </div>
  );
}
