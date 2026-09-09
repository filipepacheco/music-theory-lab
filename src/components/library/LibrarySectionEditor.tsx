import { useEffect, useState } from 'react';
import {
  getBoundaryMoveError,
  getSplitError,
  mergeLibrarySections,
  moveLibraryBoundary,
  renameLibrarySection,
  splitLibrarySection,
  type LibraryAnnotationDocument,
  type LibraryAnnotationEditResult,
} from '@/domain/libraryAnnotation';
import type { ChordChartBar } from '@/components/library/libraryData';

interface Props {
  document: LibraryAnnotationDocument;
  bars: ChordChartBar[];
  activeSectionIndex: number;
  onEdit: (result: LibraryAnnotationEditResult) => void;
}

export default function LibrarySectionEditor({
  document,
  bars,
  activeSectionIndex,
  onEdit,
}: Props) {
  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex min-w-max items-stretch">
        {document.sections.map((section, sectionIndex) => (
          <div key={section.id} className="flex items-stretch">
            <div
              className={`min-w-48 rounded-button border p-2 ${
                sectionIndex === activeSectionIndex
                  ? 'border-accent bg-accent/10'
                  : 'border-border-default bg-bg-card'
              }`}
            >
              <SectionNameInput
                document={document}
                sectionId={section.id}
                sectionIndex={sectionIndex}
                name={section.name}
                onEdit={onEdit}
              />
              <div className="flex gap-1">
                {bars
                  .slice(section.startBar, section.endBar)
                  .map((bar, index) => {
                    const boundaryBar = section.startBar + index;
                    const error = getSplitError(
                      document,
                      section.id,
                      boundaryBar,
                    );
                    return (
                      <button
                        key={bar.index}
                        type="button"
                        disabled={error !== null}
                        title={
                          error ?? `Dividir antes do compasso ${bar.index + 1}`
                        }
                        onClick={() =>
                          onEdit(
                            splitLibrarySection(
                              document,
                              section.id,
                              boundaryBar,
                            ),
                          )
                        }
                        className="cursor-pointer disabled:cursor-not-allowed disabled:opacity-55"
                      >
                        <span className="block min-w-8 rounded-control border border-border-default bg-bg-primary px-1.5 py-1 text-center font-heading text-[10px] text-text-primary">
                          <span className="block text-[8px] text-text-muted">
                            {bar.index + 1}
                          </span>
                          {bar.chords[0]?.chord ?? '—'}
                        </span>
                        <span className="mt-0.5 block text-[8px] text-text-muted">
                          {index === 0 ? 'início' : 'dividir'}
                        </span>
                      </button>
                    );
                  })}
              </div>
            </div>

            {sectionIndex < document.sections.length - 1 && (
              <BoundaryControls
                document={document}
                boundaryIndex={sectionIndex}
                onEdit={onEdit}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionNameInput({
  document,
  sectionId,
  sectionIndex,
  name,
  onEdit,
}: {
  document: LibraryAnnotationDocument;
  sectionId: string;
  sectionIndex: number;
  name: string;
  onEdit: Props['onEdit'];
}) {
  const [draft, setDraft] = useState(name);

  useEffect(() => setDraft(name), [name]);

  const commit = () => {
    const result = renameLibrarySection(document, sectionId, draft);
    onEdit(result);
    if (result.error) setDraft(name);
  };

  return (
    <input
      aria-label={`Nome da seção ${sectionIndex + 1}`}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
      className="mb-2 w-full rounded-control bg-bg-primary px-2 py-1 font-heading text-xs text-text-primary outline-none focus:ring-2 focus:ring-accent"
    />
  );
}

function BoundaryControls({
  document,
  boundaryIndex,
  onEdit,
}: {
  document: LibraryAnnotationDocument;
  boundaryIndex: number;
  onEdit: Props['onEdit'];
}) {
  const leftError = getBoundaryMoveError(document, boundaryIndex, -1);
  const rightError = getBoundaryMoveError(document, boundaryIndex, 1);
  const left = document.sections[boundaryIndex];
  const right = document.sections[boundaryIndex + 1];
  const limitDescriptionId = `library-boundary-${boundaryIndex}-limits`;
  const limitMessages = [
    leftError ? `À esquerda: ${leftError}` : null,
    rightError ? `À direita: ${rightError}` : null,
  ].filter((message): message is string => message !== null);

  return (
    <div className="mx-1 flex w-24 flex-col items-center justify-center gap-1 rounded-control border border-dashed border-accent/60 bg-accent/10 px-1">
      <span className="text-[9px] uppercase text-text-muted">fronteira</span>
      <div className="flex gap-1">
        <BoundaryButton
          label="Mover fronteira um compasso à esquerda"
          error={leftError}
          descriptionId={limitDescriptionId}
          onClick={() =>
            onEdit(moveLibraryBoundary(document, boundaryIndex, -1))
          }
        >
          ←
        </BoundaryButton>
        <BoundaryButton
          label="Mover fronteira um compasso à direita"
          error={rightError}
          descriptionId={limitDescriptionId}
          onClick={() =>
            onEdit(moveLibraryBoundary(document, boundaryIndex, 1))
          }
        >
          →
        </BoundaryButton>
      </div>
      <BoundaryButton
        label={`Unir ${left.name} e ${right.name}`}
        error={null}
        onClick={() => onEdit(mergeLibrarySections(document, left.id))}
      >
        unir
      </BoundaryButton>
      {limitMessages.length > 0 && (
        <p
          id={limitDescriptionId}
          className="text-center text-[8px] leading-tight text-text-muted"
        >
          {limitMessages.join(' ')}
        </p>
      )}
    </div>
  );
}

function BoundaryButton({
  label,
  error,
  descriptionId,
  onClick,
  children,
}: {
  label: string;
  error: string | null;
  descriptionId?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-describedby={error ? descriptionId : undefined}
      disabled={error !== null}
      title={error ?? label}
      onClick={onClick}
      className="cursor-pointer rounded-control border border-border-default bg-bg-card px-1.5 py-1 text-[9px] text-text-secondary hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-45"
    >
      {children}
    </button>
  );
}
