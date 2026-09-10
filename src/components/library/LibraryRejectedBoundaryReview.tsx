import {
  getRejectedBoundaryAdoptionError,
  type LibraryAnnotationDocument,
  type LibraryAnnotationEditResult,
} from '@/domain/libraryAnnotation';
import LibrarySectionEditor from '@/components/library/LibrarySectionEditor';
import type { ChordChartBar } from '@/components/library/libraryData';
import {
  rejectedBoundaryReasonLabel,
  type RejectedBoundarySuggestion,
} from '@/domain/rejectedBoundarySuggestions';

interface Props {
  document: LibraryAnnotationDocument;
  bars: ChordChartBar[];
  activeSectionIndex: number;
  suggestions: RejectedBoundarySuggestion[];
  visible: boolean;
  onVisibleChange: (visible: boolean) => void;
  onEdit: (result: LibraryAnnotationEditResult) => void;
  onAdopt: (suggestion: RejectedBoundarySuggestion) => void;
}

export default function LibraryRejectedBoundaryReview({
  document,
  bars,
  activeSectionIndex,
  suggestions,
  visible,
  onVisibleChange,
  onEdit,
  onAdopt,
}: Props) {
  const regionId = `rejected-boundaries-${document.sourceSha256}`;
  const available = suggestions.filter(
    (suggestion) =>
      getRejectedBoundaryAdoptionError(document, suggestion) === null,
  );
  const unavailable = suggestions.flatMap((suggestion) => {
    const reason = getRejectedBoundaryAdoptionError(document, suggestion);
    return reason ? [{ suggestion, reason }] : [];
  });

  return (
    <div className="flex flex-col gap-2">
      {suggestions.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-text-muted">
            O resultado rejeitado permanece oculto até você pedir para
            inspecioná-lo.
          </p>
          <button
            type="button"
            aria-expanded={visible}
            aria-controls={regionId}
            onClick={() => onVisibleChange(!visible)}
            className="cursor-pointer rounded-button border border-border-default bg-bg-primary px-3 py-1.5 text-[11px] text-text-secondary hover:border-amber-300/50 focus:outline-none focus:ring-2 focus:ring-accent"
          >
            {visible
              ? 'Ocultar sugestões rejeitadas'
              : 'Ver sugestões rejeitadas'}
          </button>
        </div>
      )}

      {visible && suggestions.length > 0 && (
        <div
          id={regionId}
          role="note"
          aria-label="Sugestões rejeitadas da análise estrutural"
          className="rounded-button border border-amber-400/25 bg-amber-400/5 px-3 py-2 text-[11px] text-text-secondary"
        >
          Estas divisões falharam no teste de estabilidade. São pistas para
          revisão manual, não resultados automáticos aceitos.
        </div>
      )}

      <LibrarySectionEditor
        document={document}
        bars={bars}
        activeSectionIndex={activeSectionIndex}
        onEdit={onEdit}
        rejectedSuggestions={visible ? available : []}
        onAdoptRejectedSuggestion={onAdopt}
      />

      {visible && unavailable.length > 0 && (
        <ul
          aria-label="Sugestões rejeitadas indisponíveis"
          className="flex flex-col gap-1"
        >
          {unavailable.map(({ suggestion, reason }) => {
            const support = Math.round(suggestion.support * 100);
            const recordedReason = suggestion.reasonCodes
              .map(rejectedBoundaryReasonLabel)
              .join('; ');
            return (
              <li key={suggestion.id}>
                <button
                  type="button"
                  disabled
                  aria-label={`Sugestão rejeitada indisponível, ${support}% de apoio. Motivo registrado: ${recordedReason}. ${reason}`}
                  className="w-full cursor-not-allowed rounded-control border border-dashed border-border-default bg-bg-card px-2 py-1.5 text-left text-[10px] text-text-muted opacity-70"
                >
                  <span className="font-medium text-text-secondary">
                    Sugestão rejeitada indisponível · {support}% de apoio
                  </span>
                  <span className="block">
                    {recordedReason}. {reason}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
