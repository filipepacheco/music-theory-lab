import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { useAppStore } from '@/store/useAppStore';
import { useStructureRecorder } from '@/hooks/useStructureRecorder';
import { useStructures } from '@/hooks/useStructures';
import {
  STRUCTURE_PALETTE,
  SECTION_SUGGESTIONS,
} from '@/constants/structureColors';
import StructureMetadataBar from './StructureMetadataBar';
import StructureRecorder from './StructureRecorder';
import { BarOverlay } from './DraggableBar';
import StructureSections, { SectionOverlay } from './StructureSections';
import SaveStructureButton from './SaveStructureButton';
import StructureList from './StructureList';
import { exportStructurePdf } from '@/utils/exportStructurePdf';
import type { StructureBar, StructureSection } from '@/types';

type DragItem =
  | { type: 'bar'; bar: StructureBar }
  | { type: 'section'; section: StructureSection };

export default function StructureModule() {
  const activeStructureId = useAppStore((s) => s.activeStructureId);
  const structureBars = useAppStore((s) => s.structureBars);
  const structureSections = useAppStore((s) => s.structureSections);
  const structureTitle = useAppStore((s) => s.structureTitle);
  const structureArtist = useAppStore((s) => s.structureArtist);
  const clearStructure = useAppStore((s) => s.clearStructure);
  const addStructureSection = useAppStore((s) => s.addStructureSection);
  const moveBarToSection = useAppStore((s) => s.moveBarToSection);
  const reorderStructureSection = useAppStore(
    (s) => s.reorderStructureSection,
  );

  const { structures, isLoading, save, update, remove } = useStructures();

  const [dragging, setDragging] = useState<DragItem | null>(null);
  const [newSectionName, setNewSectionName] = useState('');
  const [newSectionColor, setNewSectionColor] = useState(
    STRUCTURE_PALETTE[0],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
  );

  useStructureRecorder();

  function handleAddSection() {
    const name = newSectionName.trim();
    if (!name) return;
    addStructureSection(name, newSectionColor);
    setNewSectionName('');
    // Cycle to next color
    const idx = STRUCTURE_PALETTE.indexOf(newSectionColor);
    setNewSectionColor(
      STRUCTURE_PALETTE[(idx + 1) % STRUCTURE_PALETTE.length],
    );
  }

  function handleSuggestionClick(suggestion: { name: string; colorIndex: number }) {
    addStructureSection(
      suggestion.name,
      STRUCTURE_PALETTE[suggestion.colorIndex],
    );
  }

  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current;
    if (data?.type === 'bar') {
      setDragging({ type: 'bar', bar: data.bar as StructureBar });
    } else if (data?.type === 'section') {
      setDragging({
        type: 'section',
        section: data.section as StructureSection,
      });
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const dragType = dragging?.type;
    setDragging(null);

    const { active, over } = event;
    if (!over) return;

    const overId = over.id as string;

    if (dragType === 'bar') {
      const barId = active.id as string;
      if (overId.startsWith('section-')) {
        const sectionId = over.data.current?.sectionId as string;
        if (sectionId) moveBarToSection(barId, sectionId);
      }
    } else if (dragType === 'section') {
      if (overId.startsWith('section-')) {
        const targetSectionId = over.data.current?.sectionId as string;
        const sourceSectionId = active.data.current?.sectionId as string;
        if (
          targetSectionId &&
          sourceSectionId &&
          targetSectionId !== sourceSectionId
        ) {
          reorderStructureSection(sourceSectionId, targetSectionId);
        }
      }
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <div>
        <div className="mb-4">
          <h2 className="font-heading text-lg text-text-primary">
            Estrutura
          </h2>
        </div>

        <div className="section-panel flex flex-col gap-5">
          {/* -- Metadata -- */}
          <StructureMetadataBar />

          {/* -- Controls: compasso + add section -- */}
          <div className="flex flex-col gap-4">
            <StructureRecorder />

            {/* New section creation */}
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={newSectionName}
                  onChange={(e) => setNewSectionName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddSection();
                  }}
                  placeholder="Nome da secao..."
                  className="bg-bg-tertiary/50 border border-border-default rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors w-40"
                />

                <button
                  type="button"
                  onClick={() => {
                    const idx = STRUCTURE_PALETTE.indexOf(newSectionColor);
                    setNewSectionColor(
                      STRUCTURE_PALETTE[
                        (idx + 1) % STRUCTURE_PALETTE.length
                      ],
                    );
                  }}
                  className="w-8 h-8 rounded-full border-2 border-white/20 hover:border-white/40 transition-colors cursor-pointer shrink-0"
                  style={{ backgroundColor: newSectionColor }}
                  aria-label="Mudar cor"
                />

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={handleAddSection}
                  disabled={!newSectionName.trim()}
                  className="px-5 py-2.5 rounded-lg text-sm font-medium border border-accent/40 text-accent hover:bg-accent/10 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  + Secao
                </motion.button>
              </div>

              {/* Quick suggestion chips */}
              <div className="flex flex-wrap gap-1.5">
                {SECTION_SUGGESTIONS.map((s) => (
                  <button
                    key={s.name}
                    type="button"
                    onClick={() => handleSuggestionClick(s)}
                    className="px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors cursor-pointer hover:brightness-110"
                    style={{
                      backgroundColor:
                        STRUCTURE_PALETTE[s.colorIndex] + '15',
                      borderColor:
                        STRUCTURE_PALETTE[s.colorIndex] + '30',
                      color: STRUCTURE_PALETTE[s.colorIndex],
                    }}
                  >
                    + {s.name}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* -- Separator -- */}
          <div className="border-t border-border-default" />

          {/* -- Content: sections with DnD -- */}
          <DndContext
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <StructureSections />

            <DragOverlay dropAnimation={null}>
              {dragging?.type === 'bar' && (
                <BarOverlay bar={dragging.bar} />
              )}
              {dragging?.type === 'section' && (
                <SectionOverlay section={dragging.section} />
              )}
            </DragOverlay>
          </DndContext>

          {/* -- Actions -- */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-3 border-t border-border-default">
            <SaveStructureButton save={save} update={update} />
            {structureBars.length > 0 && (
              <button
                onClick={() => exportStructurePdf({
                  title: structureTitle,
                  artist: structureArtist,
                  sections: structureSections,
                  bars: structureBars,
                })}
                className="w-full sm:w-auto text-center px-4 py-2.5 text-sm text-text-secondary hover:text-text-primary border border-border-default hover:border-accent/50 rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path fillRule="evenodd" d="M5 2.75C5 1.784 5.784 1 6.75 1h6.5c.966 0 1.75.784 1.75 1.75v3.552c.377.046.752.097 1.126.153A2.212 2.212 0 0 1 18 8.653v4.097A2.25 2.25 0 0 1 15.75 15h-.75v3.25a.75.75 0 0 1-.75.75h-8.5a.75.75 0 0 1-.75-.75V15h-.75A2.25 2.25 0 0 1 2 12.75V8.653c0-1.082.775-2.034 1.874-2.198.374-.056.75-.107 1.126-.153V2.75ZM7.5 10.5a.75.75 0 0 0-.75.75v6h6.5v-6a.75.75 0 0 0-.75-.75h-5ZM13.5 6.3V2.75a.25.25 0 0 0-.25-.25h-6.5a.25.25 0 0 0-.25.25V6.3c1.136-.095 2.284-.143 3.5-.143s2.364.048 3.5.143Z" clipRule="evenodd" />
                </svg>
                Exportar PDF
              </button>
            )}
            {(activeStructureId || structureBars.length > 0) && (
              <button
                onClick={clearStructure}
                className="w-full sm:w-auto text-center px-4 py-2.5 text-sm text-text-muted hover:text-red-400 border border-border-default hover:border-red-400/50 rounded-lg transition-colors cursor-pointer"
              >
                Limpar estrutura
              </button>
            )}
          </div>
        </div>
      </div>

      <StructureList
        structures={structures}
        isLoading={isLoading}
        remove={remove}
      />

    </section>
  );
}
