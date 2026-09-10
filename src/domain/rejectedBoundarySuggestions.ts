export interface RejectedBoundarySuggestion {
  id: string;
  boundarySeconds: number;
  support: number;
  reasonCodes: string[];
  barIndex: number | null;
  unavailableReason: string | null;
}

export interface StructuralSuggestionAnalysis {
  source_sha256: string;
  stage_kind: 'section.mcfee_ellis_laplacian';
  decision: 'accepted' | 'fallback';
  baseline_selected_m: number | null;
  baseline_candidate_levels: Array<{
    m: number;
    boundaries_seconds: number[];
  }>;
  measurements: {
    boundary_support: number[];
  };
  fallback_reason_codes: string[];
}

interface LibraryBarGridCell {
  startSeconds: number;
  endSeconds: number;
}

const STALE_CANDIDATE_MESSAGE =
  'Esta sugestão não corresponde mais à grade atual de compassos.';
const BAR_BOUNDARY_TOLERANCE_SECONDS = 0.05;

const REASON_LABELS: Record<string, string> = {
  'section.gate_uncalibrated': 'limites de estabilidade ainda não calibrados',
  'section.no_eligible_level': 'nenhum nível de hierarquia ficou elegível',
  'section.count_unstable': 'contagem de seções instável',
  'section.boundaries_unstable': 'fronteiras instáveis nas variações de teste',
  'section.boundary_unsupported': 'apoio abaixo do mínimo de 67%',
  'section.insufficient_eligible_levels':
    'menos de dois níveis de hierarquia elegíveis',
  'section.analysis_unavailable': 'análise estrutural indisponível',
};

export function rejectedBoundaryReasonLabel(reasonCode: string): string {
  return REASON_LABELS[reasonCode] ?? reasonCode;
}

export function rejectedBoundarySuggestions(
  analysis: StructuralSuggestionAnalysis | null,
  bars: LibraryBarGridCell[],
): RejectedBoundarySuggestion[] {
  if (
    !analysis ||
    analysis.decision !== 'fallback' ||
    analysis.baseline_selected_m === null
  ) {
    return [];
  }
  const selected = analysis.baseline_candidate_levels.find(
    (candidate) => candidate.m === analysis.baseline_selected_m,
  );
  if (!selected) return [];

  return selected.boundaries_seconds.slice(1, -1).map((seconds, index) => {
    const barIndex = candidateBarIndex(seconds, bars);
    return {
      id: `${analysis.source_sha256}:${selected.m}:${index + 1}`,
      boundarySeconds: seconds,
      support: analysis.measurements.boundary_support[index] ?? 0,
      reasonCodes: [...analysis.fallback_reason_codes],
      barIndex,
      unavailableReason: barIndex === null ? STALE_CANDIDATE_MESSAGE : null,
    };
  });
}

function candidateBarIndex(
  boundarySeconds: number,
  bars: LibraryBarGridCell[],
): number | null {
  if (
    !Number.isFinite(boundarySeconds) ||
    bars.length < 2 ||
    boundarySeconds <= bars[0].startSeconds ||
    boundarySeconds >= bars[bars.length - 1].endSeconds
  ) {
    return null;
  }

  let nearestIndex = 1;
  let nearestDistance = Math.abs(bars[1].startSeconds - boundarySeconds);
  for (let index = 2; index < bars.length; index += 1) {
    const distance = Math.abs(bars[index].startSeconds - boundarySeconds);
    if (distance < nearestDistance) {
      nearestIndex = index;
      nearestDistance = distance;
    }
  }
  return nearestDistance <= BAR_BOUNDARY_TOLERANCE_SECONDS
    ? nearestIndex
    : null;
}
