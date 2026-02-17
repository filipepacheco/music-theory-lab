import { useCallback, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { useAppStore } from '@/store/useAppStore';
import { SECTION_LABELS, SECTION_COLORS } from '@/constants/songSections';
import { DraggableBar } from './BarTimeline';
import type { StructureSection } from '@/types';

function SectionComment({
  comment,
  onChange,
}: {
  comment: string;
  onChange: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment);

  function startEditing() {
    setDraft(comment);
    setEditing(true);
  }

  function save() {
    onChange(draft.trim());
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        autoFocus
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save();
          if (e.key === 'Escape') setEditing(false);
        }}
        onPointerDown={(e) => e.stopPropagation()}
        placeholder="Notas sobre esta secao..."
        className="w-full px-2 py-1 rounded bg-bg-tertiary border border-border-default text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={startEditing}
      onPointerDown={(e) => e.stopPropagation()}
      className="text-left text-xs px-2 py-1 rounded hover:bg-bg-tertiary/50 transition-colors cursor-pointer"
    >
      {comment ? (
        <span className="text-text-secondary italic">{comment}</span>
      ) : (
        <span className="text-text-muted/50 italic">+ anotacao</span>
      )}
    </button>
  );
}

/** Lightweight overlay shown while dragging a section */
export function SectionOverlay({ section }: { section: StructureSection }) {
  const color = SECTION_COLORS[section.type];
  const label =
    section.type === 'custom' && section.customLabel
      ? section.customLabel
      : SECTION_LABELS[section.type];

  return (
    <div
      className="flex items-center gap-2 px-3 py-2 rounded-lg border-2 border-accent bg-bg-card shadow-lg opacity-90"
    >
      <span className="text-text-muted text-xs cursor-grabbing">&#9776;</span>
      <span
        className="text-xs font-medium px-2 py-0.5 rounded"
        style={{ backgroundColor: color + '20', color }}
      >
        {label}
      </span>
      <span className="text-[10px] text-text-muted font-mono">
        {section.barIds.length}c
      </span>
    </div>
  );
}

function DroppableSection({
  section,
  sections,
  bars,
  onRemove,
  onSetRepeat,
  onSetComment,
}: {
  section: StructureSection;
  sections: StructureSection[];
  bars: Map<string, ReturnType<typeof useAppStore.getState>['structureBars'][number]>;
  onRemove: (id: string) => void;
  onSetRepeat: (id: string, repeatOf: string | undefined) => void;
  onSetComment: (id: string, comment: string) => void;
}) {
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `section-${section.id}`,
    data: { type: 'section-drop', sectionId: section.id },
  });

  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id: `drag-section-${section.id}`,
    data: { type: 'section', sectionId: section.id, section },
  });

  const mergedRef = useCallback(
    (node: HTMLDivElement | null) => {
      setDropRef(node);
      setDragRef(node);
    },
    [setDropRef, setDragRef],
  );

  const color = SECTION_COLORS[section.type];
  const label =
    section.type === 'custom' && section.customLabel
      ? section.customLabel
      : SECTION_LABELS[section.type];

  const sectionBars = section.barIds
    .map((bid) => bars.get(bid))
    .filter(Boolean) as ReturnType<typeof useAppStore.getState>['structureBars'];

  return (
    <motion.div
      ref={mergedRef}
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      className={`group relative flex flex-col gap-1.5 px-3 py-2 rounded-lg border transition-colors ${
        isOver ? 'ring-1 ring-accent/50 bg-accent/5' : ''
      }`}
      style={{
        backgroundColor: isOver ? undefined : color + '10',
        borderColor: isOver ? 'var(--color-accent)' : color + '30',
        opacity: isDragging ? 0.3 : 1,
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        {/* Drag handle */}
        <span
          className="text-text-muted/40 hover:text-text-muted text-sm cursor-grab active:cursor-grabbing transition-colors select-none"
          {...attributes}
          {...listeners}
        >
          &#9776;
        </span>

        <div className="flex flex-wrap gap-1.5 items-center">
          {sectionBars.length > 0 ? (
            sectionBars.map((bar) => (
              <DraggableBar
                key={bar.id}
                bar={bar}
                sectionColor={color}
              />
            ))
          ) : (
            <span className="text-[10px] text-text-muted italic px-1 py-3">
              Arraste compassos aqui
            </span>
          )}
        </div>

        <span
          className="text-xs font-medium px-2 py-0.5 rounded shrink-0"
          style={{
            backgroundColor: color + '20',
            color,
          }}
        >
          {label}
        </span>

        {section.repeatOf && (
          <span className="text-[10px] text-text-muted italic shrink-0">
            repete{' '}
            {(() => {
              const ref = sections.find((s) => s.id === section.repeatOf);
              return ref ? SECTION_LABELS[ref.type] : '';
            })()}
          </span>
        )}

        <select
          value={section.repeatOf ?? ''}
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) =>
            onSetRepeat(section.id, e.target.value || undefined)
          }
          className="shrink-0 px-2 py-1 rounded bg-bg-tertiary border border-border-default text-[10px] text-text-secondary focus:outline-none focus:border-accent cursor-pointer"
        >
          <option value="">Sem repeticao</option>
          {sections
            .filter((s) => s.id !== section.id)
            .map((s) => (
              <option key={s.id} value={s.id}>
                Repete: {SECTION_LABELS[s.type]}
              </option>
            ))}
        </select>
      </div>

      <SectionComment
        comment={section.comment ?? ''}
        onChange={(value) => onSetComment(section.id, value)}
      />

      <button
        type="button"
        aria-label={`Remover secao ${label}`}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => {
          if (window.confirm(`Remover secao "${label}"?`))
            onRemove(section.id);
        }}
        className="absolute -top-2 -right-2 w-5 h-5 flex items-center justify-center rounded-full text-[9px] bg-bg-tertiary border border-border-default text-text-muted hover:text-red-400 hover:bg-red-400/10 transition-colors cursor-pointer opacity-0 group-hover:opacity-100"
      >
        X
      </button>
    </motion.div>
  );
}

export default function StructureSections() {
  const sections = useAppStore((s) => s.structureSections);
  const structureBars = useAppStore((s) => s.structureBars);
  const removeStructureSection = useAppStore((s) => s.removeStructureSection);
  const setSectionRepeat = useAppStore((s) => s.setSectionRepeat);
  const setSectionComment = useAppStore((s) => s.setSectionComment);

  const barMap = useMemo(
    () => new Map(structureBars.map((b) => [b.id, b])),
    [structureBars],
  );

  if (sections.length === 0) return null;

  return (
    <div>
      <h4 className="font-heading text-xs text-text-secondary mb-2">
        Secoes - arraste compassos para organizar
      </h4>
      <div className="flex flex-col gap-2">
        {sections.map((section) => (
          <DroppableSection
            key={section.id}
            section={section}
            sections={sections}
            bars={barMap}
            onRemove={removeStructureSection}
            onSetRepeat={setSectionRepeat}
            onSetComment={setSectionComment}
          />
        ))}
      </div>
    </div>
  );
}
