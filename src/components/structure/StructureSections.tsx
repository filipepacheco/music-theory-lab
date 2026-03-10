import { useCallback, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { useAppStore } from '@/store/useAppStore';
import { DraggableBar } from './DraggableBar';
import ColorPicker from './ColorPicker';
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
      <textarea
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setEditing(false);
        }}
        onPointerDown={(e) => e.stopPropagation()}
        placeholder="Notas sobre esta secao..."
        className="w-full h-full min-h-[4rem] px-2 py-1 rounded bg-bg-tertiary border border-border-default text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors resize-y"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={startEditing}
      onPointerDown={(e) => e.stopPropagation()}
      className="text-left text-xs px-2 py-1 rounded hover:bg-bg-tertiary/50 transition-colors cursor-pointer flex-1"
    >
      {comment ? (
        <span className="text-text-secondary italic whitespace-pre-line">{comment}</span>
      ) : (
        <span className="text-text-muted/50 italic">+ anotacao</span>
      )}
    </button>
  );
}

function InlineSectionName({
  name,
  color,
  onChange,
}: {
  name: string;
  color: string;
  onChange: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);

  function startEditing() {
    setDraft(name);
    setEditing(true);
  }

  function save() {
    const trimmed = draft.trim();
    if (trimmed) onChange(trimmed);
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
        className="px-2 py-0.5 rounded text-xs font-medium bg-bg-tertiary border border-border-default text-text-primary focus:outline-none focus:border-accent transition-colors w-28"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={startEditing}
      onPointerDown={(e) => e.stopPropagation()}
      className="text-xs font-medium px-2 py-0.5 rounded shrink-0 cursor-pointer hover:brightness-110 transition-all"
      style={{
        backgroundColor: color + '20',
        color,
      }}
    >
      {name}
    </button>
  );
}

/** Lightweight overlay shown while dragging a section */
export function SectionOverlay({ section }: { section: StructureSection }) {
  return (
    <div
      className="flex items-center gap-2 px-3 py-2 rounded-lg border-2 border-accent bg-bg-card shadow-lg opacity-90"
    >
      <span className="text-text-muted text-xs cursor-grabbing">&#9776;</span>
      <span
        className="text-xs font-medium px-2 py-0.5 rounded"
        style={{ backgroundColor: section.color + '20', color: section.color }}
      >
        {section.name}
      </span>
      <span className="text-[10px] text-text-muted font-mono">
        {section.barIds.length}c
      </span>
    </div>
  );
}

function DroppableSection({
  section,
  bars,
  isFocused,
  onRemove,
  onSetComment,
  onFocus,
}: {
  section: StructureSection;
  bars: Map<string, ReturnType<typeof useAppStore.getState>['structureBars'][number]>;
  isFocused: boolean;
  onRemove: (id: string) => void;
  onSetComment: (id: string, comment: string) => void;
  onFocus: (id: string) => void;
}) {
  const addBarToSection = useAppStore((s) => s.addBarToSection);
  const removeBar = useAppStore((s) => s.removeBar);
  const setSectionName = useAppStore((s) => s.setSectionName);
  const setSectionColor = useAppStore((s) => s.setSectionColor);
  const setSectionBarsPerRow = useAppStore((s) => s.setSectionBarsPerRow);
  const duplicateSection = useAppStore((s) => s.duplicateStructureSection);

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

  const color = section.color;

  const sectionBars = section.barIds
    .map((bid) => bars.get(bid))
    .filter(Boolean) as ReturnType<typeof useAppStore.getState>['structureBars'];

  return (
    <motion.div
      ref={mergedRef}
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      className={`group relative flex flex-col gap-1.5 px-2 py-2 sm:px-3 rounded-lg border transition-all ${
        isOver ? 'ring-1 ring-accent/50 bg-accent/5' : ''
      } ${isFocused ? 'ring-2 ring-accent/60 shadow-[0_0_12px_var(--color-accent)/15]' : ''}`}
      style={{
        backgroundColor: isOver ? undefined : color + '10',
        borderColor: isOver
          ? 'var(--color-accent)'
          : isFocused
            ? 'var(--color-accent)'
            : color + '30',
        opacity: isDragging ? 0.3 : 1,
      }}
      onClick={() => onFocus(section.id)}
    >
      {/* Horizontal layout: actions | bars grid | comment */}
      <div className="flex gap-3 sm:gap-4">
        {/* Left column: action buttons stacked vertically */}
        <div className="flex flex-col items-center gap-1.5 shrink-0">
          <span
            className="w-6 h-6 flex items-center justify-center text-text-muted/40 hover:text-text-muted text-sm cursor-grab active:cursor-grabbing transition-colors select-none"
            {...attributes}
            {...listeners}
          >
            &#9776;
          </span>

          <InlineSectionName
            name={section.name}
            color={color}
            onChange={(name) => setSectionName(section.id, name)}
          />

          <ColorPicker
            value={color}
            onChange={(c) => setSectionColor(section.id, c)}
            size="sm"
          />

          <select
            value={section.barsPerRow ?? ''}
            onChange={(e) => {
              const val = e.target.value;
              setSectionBarsPerRow(section.id, val ? Number(val) : undefined);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="text-[10px] sm:text-xs bg-bg-tertiary/50 border border-border-default rounded px-1 py-0.5 text-text-muted hover:text-text-secondary transition-colors cursor-pointer focus:outline-none focus:border-accent w-full"
            aria-label="Compassos por linha"
          >
            <option value="">Auto</option>
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
            <option value="4">4</option>
            <option value="6">6</option>
            <option value="8">8</option>
            <option value="12">12</option>
            <option value="16">16</option>
          </select>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              aria-label={`Duplicar secao ${section.name}`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                duplicateSection(section.id);
              }}
              className="text-[10px] sm:text-xs text-text-muted hover:text-accent transition-colors cursor-pointer"
              title="Duplicar secao"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                <path d="M5.5 3.5A1.5 1.5 0 0 1 7 2h5.5A1.5 1.5 0 0 1 14 3.5V9a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 9V3.5Z" />
                <path d="M3.5 5.5A1.5 1.5 0 0 0 2 7v5.5A1.5 1.5 0 0 0 3.5 14H9a1.5 1.5 0 0 0 1.5-1.5V7A1.5 1.5 0 0 0 9 5.5H3.5Z" opacity=".5" />
              </svg>
            </button>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                addBarToSection(section.id);
              }}
              className="w-5 h-5 flex items-center justify-center rounded border border-dashed text-text-muted hover:text-accent hover:border-accent/50 transition-colors cursor-pointer text-xs"
              style={{ borderColor: color + '30' }}
              aria-label="Adicionar compasso"
            >
              +
            </motion.button>
          </div>
        </div>

        {/* Middle column: bars grid */}
        <div
          className="flex flex-wrap gap-1 sm:gap-1.5 content-start"
          style={section.barsPerRow ? {
            maxWidth: `calc(${section.barsPerRow} * (2.75rem + 0.375rem))`,
          } : undefined}
        >
          {sectionBars.map((bar, i) => (
            <DraggableBar
              key={bar.id}
              bar={bar}
              sectionColor={color}
              onRemove={() => removeBar(bar.id)}
              displayIndex={i + 1}
            />
          ))}
        </div>

        {/* Right column: comment */}
        <div className="flex-1 min-w-[120px] self-stretch flex flex-col">
          <SectionComment
            comment={section.comment ?? ''}
            onChange={(value) => onSetComment(section.id, value)}
          />
        </div>
      </div>

      <button
        type="button"
        aria-label={`Remover secao ${section.name}`}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onRemove(section.id);
        }}
        className="absolute -top-2 -right-2 w-5 h-5 flex items-center justify-center rounded-full text-[9px] bg-bg-tertiary border border-border-default text-text-muted hover:text-red-400 hover:bg-red-400/10 transition-colors cursor-pointer opacity-60 sm:opacity-0 sm:group-hover:opacity-100"
      >
        X
      </button>
    </motion.div>
  );
}

export default function StructureSections() {
  const sections = useAppStore((s) => s.structureSections);
  const structureBars = useAppStore((s) => s.structureBars);
  const focusedSectionId = useAppStore((s) => s.focusedSectionId);
  const removeStructureSection = useAppStore((s) => s.removeStructureSection);
  const setSectionComment = useAppStore((s) => s.setSectionComment);
  const setFocusedSection = useAppStore((s) => s.setFocusedSection);

  const barMap = useMemo(
    () => new Map(structureBars.map((b) => [b.id, b])),
    [structureBars],
  );

  if (sections.length === 0) {
    return (
      <div className="text-center py-8 text-text-muted text-sm">
        Adicione uma secao para comecar
      </div>
    );
  }

  return (
    <div>
      <h4 className="font-heading text-xs text-text-secondary mb-2">
        Secoes
      </h4>
      <div className="flex flex-col gap-2">
        {sections.map((section) => (
          <DroppableSection
            key={section.id}
            section={section}
            bars={barMap}
            isFocused={focusedSectionId === section.id}
            onRemove={removeStructureSection}
            onSetComment={setSectionComment}
            onFocus={setFocusedSection}
          />
        ))}
      </div>
    </div>
  );
}
