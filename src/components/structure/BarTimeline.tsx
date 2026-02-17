import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { useAppStore } from '@/store/useAppStore';
import { SECTION_COLORS } from '@/constants/songSections';
import type { SectionType, StructureBar, TimeSignature } from '@/types';

const TIME_SIGNATURES: TimeSignature[] = ['2/4', '3/4', '4/4', '6/8'];

export function DraggableBar({
  bar,
  sectionColor,
  isSelected,
  onClick,
  onRemove,
}: {
  bar: StructureBar;
  sectionColor?: string;
  isSelected?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  onRemove?: () => void;
}) {
  const setBarTimeSignature = useAppStore((s) => s.setBarTimeSignature);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: bar.id,
    data: { type: 'bar', bar },
  });

  return (
    <motion.div
      ref={setNodeRef}
      layout
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: isDragging ? 0.3 : 1 }}
      className={`group relative w-11 h-11 flex flex-col items-center justify-center rounded-lg text-xs font-mono cursor-grab select-none transition-shadow active:cursor-grabbing ${
        isSelected
          ? 'ring-2 ring-accent shadow-[0_0_8px_var(--color-accent)/30]'
          : ''
      }`}
      style={{
        backgroundColor: sectionColor
          ? sectionColor + '20'
          : 'var(--color-bg-tertiary)',
        borderWidth: 1,
        borderStyle: 'solid',
        borderColor: isSelected
          ? 'var(--color-accent)'
          : sectionColor
            ? sectionColor + '40'
            : 'var(--color-border-default)',
      }}
      onClick={onClick}
      onDoubleClick={(e) => {
        e.stopPropagation();
        const idx = TIME_SIGNATURES.indexOf(bar.timeSignature);
        const next = TIME_SIGNATURES[(idx + 1) % TIME_SIGNATURES.length];
        setBarTimeSignature(bar.id, next);
      }}
      {...attributes}
      {...listeners}
    >
      <span className="text-text-primary">{bar.index + 1}</span>
      <span className={`text-[9px] leading-none ${bar.timeSignature === '4/4' ? 'text-text-muted/30' : 'text-text-muted'}`}>
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
          className="absolute -top-1.5 -right-1.5 w-4 h-4 flex items-center justify-center rounded-full text-[8px] bg-bg-tertiary border border-border-default text-text-muted hover:text-red-400 hover:bg-red-400/10 transition-colors cursor-pointer opacity-0 group-hover:opacity-100"
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
      className="w-12 h-12 flex flex-col items-center justify-center rounded-lg text-xs font-mono bg-bg-card border-2 border-accent shadow-lg opacity-90"
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

export default function BarTimeline() {
  const bars = useAppStore((s) => s.structureBars);
  const sections = useAppStore((s) => s.structureSections);
  const selectedBarIds = useAppStore((s) => s.selectedBarIds);
  const selectBar = useAppStore((s) => s.selectBar);
  const selectBarRange = useAppStore((s) => s.selectBarRange);
  const toggleBar = useAppStore((s) => s.toggleBar);
  const removeBar = useAppStore((s) => s.removeBar);

  const { setNodeRef, isOver } = useDroppable({ id: 'bar-pool' });

  const barSectionMap = useMemo(() => {
    const map = new Map<string, SectionType>();
    for (const section of sections) {
      for (const bid of section.barIds) {
        map.set(bid, section.type);
      }
    }
    return map;
  }, [sections]);

  if (bars.length === 0) return null;

  function handleClick(id: string, e: React.MouseEvent) {
    if (e.shiftKey) {
      selectBarRange(id);
    } else if (e.metaKey || e.ctrlKey) {
      toggleBar(id);
    } else {
      selectBar(id);
    }
  }

  return (
    <div>
      <h4 className="font-heading text-xs text-text-secondary mb-2">
        Compassos
      </h4>
      <div
        ref={setNodeRef}
        className={`flex flex-wrap gap-1.5 min-h-[52px] p-1.5 -m-1.5 rounded-lg transition-colors ${
          isOver ? 'bg-accent/5 ring-1 ring-accent/30' : ''
        }`}
      >
        {bars.map((bar) => {
          const sectionType = barSectionMap.get(bar.id);
          const sectionColor = sectionType
            ? SECTION_COLORS[sectionType]
            : undefined;

          return (
            <DraggableBar
              key={bar.id}
              bar={bar}
              sectionColor={sectionColor}
              isSelected={selectedBarIds.has(bar.id)}
              onClick={(e) => handleClick(bar.id, e)}
              onRemove={() => removeBar(bar.id)}
            />
          );
        })}
      </div>
    </div>
  );
}
