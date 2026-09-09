import type { SectionAnalysisJson } from '@/components/library/libraryData';

interface Props {
  analysis: SectionAnalysisJson | null;
}

export default function LibrarySectionStatus({ analysis }: Props) {
  if (!analysis?.review_required) return null;
  const unstableStructure = analysis.fallback_reason_codes.some((code) =>
    code.startsWith('section.'),
  );

  return (
    <div
      role="status"
      className="rounded-button border border-amber-500/35 bg-amber-500/10 px-3 py-2"
    >
      <p className="text-xs font-medium text-text-primary">
        Seções automáticas não publicadas
      </p>
      <p className="mt-1 text-[11px] text-text-secondary">
        {unstableStructure
          ? 'A análise estrutural não permaneceu estável nas variações de teste.'
          : 'A grade de pulsos não passou pela validação calibrada.'}{' '}
        A faixa foi mantida como uma única seção neutra e editável para sua
        revisão.
      </p>
    </div>
  );
}
