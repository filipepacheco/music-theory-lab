import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
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
import StructureMetadataBar from './StructureMetadataBar';
import StructureRecorder from './StructureRecorder';
import BarTimeline, { BarOverlay } from './BarTimeline';
import SectionAssigner from './SectionAssigner';
import StructureSections, { SectionOverlay } from './StructureSections';
import SaveStructureButton from './SaveStructureButton';
import StructureList from './StructureList';
import type { StructureBar, StructureSection } from '@/types';

type DragItem =
  | { type: 'bar'; bar: StructureBar }
  | { type: 'section'; section: StructureSection };

export default function StructureModule() {
  const activeStructureId = useAppStore((s) => s.activeStructureId);
  const structureBars = useAppStore((s) => s.structureBars);
  const clearStructure = useAppStore((s) => s.clearStructure);
  const moveBarToSection = useAppStore((s) => s.moveBarToSection);
  const unassignBar = useAppStore((s) => s.unassignBar);
  const reorderStructureSection = useAppStore(
    (s) => s.reorderStructureSection,
  );

  const [dragging, setDragging] = useState<DragItem | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  );

  useStructureRecorder();

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
      if (overId === 'bar-pool') {
        unassignBar(barId);
      } else if (overId.startsWith('section-')) {
        const sectionId = over.data.current?.sectionId as string;
        if (sectionId) moveBarToSection(barId, sectionId);
      }
    } else if (dragType === 'section') {
      // Dropped on another section's drop zone -> reorder
      if (overId.startsWith('section-')) {
        const targetSectionId = over.data.current?.sectionId as string;
        const sourceSectionId = active.data.current?.sectionId as string;
        if (targetSectionId && sourceSectionId && targetSectionId !== sourceSectionId) {
          reorderStructureSection(sourceSectionId, targetSectionId);
        }
      }
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-heading text-lg text-text-primary">
            Estrutura
          </h2>
          {(activeStructureId || structureBars.length > 0) && (
            <button
              onClick={clearStructure}
              className="text-xs text-text-muted hover:text-text-primary transition-colors cursor-pointer"
            >
              Nova estrutura
            </button>
          )}
        </div>

        <div className="section-panel flex flex-col gap-4">
          <StructureMetadataBar />
          <StructureRecorder />

          <DndContext
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <BarTimeline />
            <AnimatePresence>
              <SectionAssigner />
            </AnimatePresence>
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

          <div className="flex items-center gap-3">
            <SaveStructureButton />
          </div>
        </div>
      </div>

      <StructureList />
    </section>
  );
}
