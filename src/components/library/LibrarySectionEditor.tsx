import { Fragment, useEffect, useState } from 'react';
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
import {
  rejectedBoundaryReasonLabel,
  type RejectedBoundarySuggestion,
} from '@/domain/rejectedBoundarySuggestions';

interface Props {
  document: LibraryAnnotationDocument;
  bars: ChordChartBar[];
  activeSectionIndex: number;
  onEdit: (result: LibraryAnnotationEditResult) => void;
  rejectedSuggestions?: RejectedBoundarySuggestion[];
  onAdoptRejectedSuggestion?: (suggestion: RejectedBoundarySuggestion) => void;
}

export default function LibrarySectionEditor({
  document,
  bars,
  activeSectionIndex,
  onEdit,
  rejectedSuggestions = [],
  onAdoptRejectedSuggestion,
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
                    const suggestions = rejectedSuggestions.filter(
                      (suggestion) => suggestion.barIndex === boundaryBar,
                    );
                    const error = getSplitError(
                      document,
                      section.id,
                      boundaryBar,
                    );
                    return (
                      <Fragment key={bar.index}>
                        {suggestions.map((suggestion) => (
                          <RejectedBoundaryMarker
                            key={suggestion.id}
                            suggestion={suggestion}
                            onAdopt={onAdoptRejectedSuggestion}
                          />
                        ))}
                        <button
                          type="button"
                          disabled={error !== null}
                          title={
                            error ??
                            `Dividir antes do compasso ${bar.index + 1}`
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
                      </Fragment>
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

function RejectedBoundaryMarker({
  suggestion,
  onAdopt,
}: {
  suggestion: RejectedBoundarySuggestion;
  onAdopt: Props['onAdoptRejectedSuggestion'];
}) {
  const support = Math.round(suggestion.support * 100);
  const reason = suggestion.reasonCodes
    .map(rejectedBoundaryReasonLabel)
    .join('; ');
  const barNumber = (suggestion.barIndex ?? 0) + 1;

  return (
    <div className="flex w-24 shrink-0 flex-col items-center justify-center border-x border-dashed border-amber-400/45 bg-amber-400/5 px-1 py-1 text-center text-amber-200/75">
      <span aria-hidden="true" className="text-[8px] uppercase tracking-wide">
        rejeitada
      </span>
      <span aria-hidden="true" className="text-[9px] tabular-nums">
        {support}% de apoio
      </span>
      <span className="mt-0.5 text-[8px] leading-tight">{reason}</span>
      <button
        type="button"
        aria-label={`Sugestão rejeitada antes do compasso ${barNumber}, ${support}% de apoio. Motivo: ${reason}. Usar como divisão manual`}
        title={`${support}% de apoio · ${reason}`}
        onClick={() => onAdopt?.(suggestion)}
        className="mt-1 cursor-pointer rounded-control border border-dashed border-amber-300/40 bg-bg-primary px-1.5 py-1 text-[8px] text-amber-100/80 hover:border-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-300"
      >
        usar divisão
      </button>
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
