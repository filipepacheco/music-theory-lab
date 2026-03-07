import { motion } from 'framer-motion';
import { useDraggable } from '@dnd-kit/core';
import { useAppStore } from '@/store/useAppStore';
import type { StructureBar } from '@/types';
import { TIME_SIGNATURES } from '@/constants/structureColors';

export function DraggableBar({
  bar,
  sectionColor,
  onRemove,
}: {
  bar: StructureBar;
  sectionColor?: string;
  onRemove?: () => void;
}) {
  const setBarTimeSignature = useAppStore((s) => s.setBarTimeSignature);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: bar.id,
    data: { type: 'bar', bar },
  });

  const effectiveColor = bar.color ?? sectionColor;

  return (
    <motion.div
      ref={setNodeRef}
      layout
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: isDragging ? 0.3 : 1 }}
      className="group relative w-8 h-8 sm:w-11 sm:h-11 flex flex-col items-center justify-center rounded-lg text-xs font-mono cursor-grab select-none transition-shadow active:cursor-grabbing"
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
        const idx = TIME_SIGNATURES.indexOf(bar.timeSignature);
        const next = TIME_SIGNATURES[(idx + 1) % TIME_SIGNATURES.length];
        setBarTimeSignature(bar.id, next);
      }}
      {...attributes}
      {...listeners}
    >
      <span className="text-[10px] sm:text-xs text-text-primary">{bar.index + 1}</span>
      <span className={`text-[9px] leading-none hidden sm:inline ${bar.timeSignature === '4/4' ? 'text-text-muted/30' : 'text-text-muted'}`}>
        {bar.timeSignature}
      </span>
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
  );
}

/** Floating overlay bar shown while dragging */
export function BarOverlay({ bar }: { bar: StructureBar }) {
  return (
    <div
      className="w-10 h-10 sm:w-12 sm:h-12 flex flex-col items-center justify-center rounded-lg text-xs font-mono bg-bg-card border-2 border-accent shadow-lg opacity-90"
    >
      <span className="text-text-primary">{bar.index + 1}</span>
      {bar.timeSignature !== '4/4' && (
        <span className="text-[9px] text-text-muted leading-none">
          {bar.timeSignature}
        </span>
      )}
    </div>
  );
}
