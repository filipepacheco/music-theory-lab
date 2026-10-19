import { useState } from 'react';
import {
  DndContext,
  DragOverlay,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { useAppStore } from '@/store/useAppStore';
import { useStructureRecorder } from '@/hooks/useStructureRecorder';
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
import { exportStructurePdf, type PdfFormat } from '@/utils/exportStructurePdf';
import type { StructureBar, StructureSection } from '@/types';
import { useStructureDragSensors } from '@/hooks/useStructureDragSensors';
import Frame from '@/components/shared/Frame';
import Button from '@/components/shared/Button';
import Field from '@/components/shared/Field';
import Select from '@/components/shared/Select';
import '@/components/structure/structureLayout.css';

type DragItem =
  | { type: 'bar'; bar: StructureBar; displayIndex?: number }
  | { type: 'section'; section: StructureSection };

export default function StructureModule() {
  const activeStructureId = useAppStore((s) => s.activeStructureId);
  const structureBars = useAppStore((s) => s.structureBars);
  const structureSections = useAppStore((s) => s.structureSections);
  const structureTitle = useAppStore((s) => s.structureTitle);
  const structureArtist = useAppStore((s) => s.structureArtist);
  const structureBpm = useAppStore((s) => s.structureBpm);
  const clearStructure = useAppStore((s) => s.clearStructure);
  const addStructureSection = useAppStore((s) => s.addStructureSection);
  const moveBarToSection = useAppStore((s) => s.moveBarToSection);
  const reorderStructureSection = useAppStore((s) => s.reorderStructureSection);

  const [dragging, setDragging] = useState<DragItem | null>(null);
  const [newSectionName, setNewSectionName] = useState('');
  const [newSectionColor, setNewSectionColor] = useState(STRUCTURE_PALETTE[0]);
  const [pdfFormat, setPdfFormat] = useState<PdfFormat>('ipad-air');

  const sensors = useStructureDragSensors();

  useStructureRecorder();

  function handleAddSection() {
    const name = newSectionName.trim();
    if (!name) return;
    addStructureSection(name, newSectionColor);
    setNewSectionName('');
    const idx = STRUCTURE_PALETTE.indexOf(newSectionColor);
    setNewSectionColor(STRUCTURE_PALETTE[(idx + 1) % STRUCTURE_PALETTE.length]);
  }

  function handleSuggestionClick(suggestion: {
    name: string;
    colorIndex: number;
  }) {
    addStructureSection(
      suggestion.name,
      STRUCTURE_PALETTE[suggestion.colorIndex],
    );
  }

  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current;
    if (data?.type === 'bar') {
      setDragging({
        type: 'bar',
        bar: data.bar as StructureBar,
        displayIndex: data.displayIndex as number | undefined,
      });
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

    const overData = over.data.current;
    if (overData?.type !== 'section-drop') return;

    if (dragType === 'bar') {
      const barId = active.id as string;
      const sectionId = overData.sectionId as string;
      if (sectionId) moveBarToSection(barId, sectionId);
    } else if (dragType === 'section') {
      const targetSectionId = overData.sectionId as string;
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

  return (
    <section className="structure-module min-w-0 flex flex-col gap-6">
      <Frame title="Estrutura" titleAs="h2" className="flex flex-col gap-5">
        <StructureMetadataBar />

        <div className="structure-controls">
          <StructureRecorder />

          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Field
                type="text"
                aria-label="Nome da seção"
                value={newSectionName}
                onChange={(e) => setNewSectionName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddSection();
                }}
                placeholder="Nome da seção..."
                className="w-40 flex-none"
              />

              <button
                type="button"
                onClick={() => {
                  const idx = STRUCTURE_PALETTE.indexOf(newSectionColor);
                  setNewSectionColor(
                    STRUCTURE_PALETTE[(idx + 1) % STRUCTURE_PALETTE.length],
                  );
                }}
                className="w-8 h-8 border-2 border-border-strong hover:border-accent cursor-pointer shrink-0"
                style={{ backgroundColor: newSectionColor }}
                aria-label="Mudar cor"
              />

              <Button
                onClick={handleAddSection}
                disabled={!newSectionName.trim()}
              >
                + Seção
              </Button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {SECTION_SUGGESTIONS.map((s) => (
                <button
                  key={s.name}
                  type="button"
                  onClick={() => handleSuggestionClick(s)}
                  className="px-2.5 py-1 text-small font-medium border cursor-pointer"
                  style={{
                    backgroundColor: STRUCTURE_PALETTE[s.colorIndex] + '15',
                    borderColor: STRUCTURE_PALETTE[s.colorIndex] + '30',
                    color: STRUCTURE_PALETTE[s.colorIndex],
                  }}
                >
                  + {s.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="border-t border-border-default" />

        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <StructureSections />

          <DragOverlay dropAnimation={null}>
            {dragging?.type === 'bar' && (
              <BarOverlay
                bar={dragging.bar}
                displayIndex={dragging.displayIndex}
              />
            )}
            {dragging?.type === 'section' && (
              <SectionOverlay section={dragging.section} />
            )}
          </DragOverlay>
        </DndContext>

        <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-border-default">
          <SaveStructureButton />
          {structureBars.length > 0 && (
            <div className="flex items-center gap-[1ch]">
              <Button
                onClick={() =>
                  exportStructurePdf({
                    title: structureTitle,
                    artist: structureArtist,
                    bpm: structureBpm,
                    sections: structureSections,
                    bars: structureBars,
                    format: pdfFormat,
                  })
                }
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="w-4 h-4 mr-[1ch]"
                >
                  <path
                    fillRule="evenodd"
                    d="M5 2.75C5 1.784 5.784 1 6.75 1h6.5c.966 0 1.75.784 1.75 1.75v3.552c.377.046.752.097 1.126.153A2.212 2.212 0 0 1 18 8.653v4.097A2.25 2.25 0 0 1 15.75 15h-.75v3.25a.75.75 0 0 1-.75.75h-8.5a.75.75 0 0 1-.75-.75V15h-.75A2.25 2.25 0 0 1 2 12.75V8.653c0-1.082.775-2.034 1.874-2.198.374-.056.75-.107 1.126-.153V2.75ZM7.5 10.5a.75.75 0 0 0-.75.75v6h6.5v-6a.75.75 0 0 0-.75-.75h-5ZM13.5 6.3V2.75a.25.25 0 0 0-.25-.25h-6.5a.25.25 0 0 0-.25.25V6.3c1.136-.095 2.284-.143 3.5-.143s2.364.048 3.5.143Z"
                    clipRule="evenodd"
                  />
                </svg>
                PDF
              </Button>
              <Select
                aria-label="Formato do PDF"
                value={pdfFormat}
                onChange={(e) => setPdfFormat(e.target.value as PdfFormat)}
              >
                <option value="ipad-air">iPad Air</option>
                <option value="a4">A4</option>
              </Select>
            </div>
          )}
          {(activeStructureId || structureBars.length > 0) && (
            <Button onClick={clearStructure} className="text-danger">
              Limpar estrutura
            </Button>
          )}
        </div>
      </Frame>

      <StructureList />
    </section>
  );
}
