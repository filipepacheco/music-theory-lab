import { describe, expect, it } from 'vitest';
import {
  rejectedBoundaryReasonLabel,
  rejectedBoundarySuggestions,
  type StructuralSuggestionAnalysis,
} from '@/domain/rejectedBoundarySuggestions';

function bar(
  startSeconds: number,
  endSeconds: number,
): { startSeconds: number; endSeconds: number } {
  return {
    startSeconds,
    endSeconds,
  };
}

function rejectedAnalysis(): StructuralSuggestionAnalysis {
  return {
    source_sha256: 'source-sha',
    stage_kind: 'section.mcfee_ellis_laplacian',
    decision: 'fallback',
    baseline_selected_m: 3,
    baseline_candidate_levels: [
      {
        m: 3,
        boundaries_seconds: [0, 8, 16, 24],
      },
    ],
    measurements: { boundary_support: [0.61, 0.48] },
    fallback_reason_codes: [
      'section.boundary_unsupported',
      'section.count_unstable',
    ],
  };
}

describe('rejected Library boundary suggestions', () => {
  const bars = [
    bar(0, 4),
    bar(4, 8),
    bar(8, 12),
    bar(12, 16),
    bar(16, 20),
    bar(20, 24),
  ];
  const beatTimes = Array.from({ length: 13 }, (_, index) => index * 2);

  it('derives chronological candidates with recorded support and reasons', () => {
    expect(
      rejectedBoundarySuggestions(rejectedAnalysis(), bars, beatTimes),
    ).toEqual([
      {
        id: 'source-sha:3:1',
        boundarySeconds: 8,
        support: 0.61,
        reasonCodes: ['section.boundary_unsupported', 'section.count_unstable'],
        barIndex: 2,
        unavailableReason: null,
      },
      {
        id: 'source-sha:3:2',
        boundarySeconds: 16,
        support: 0.48,
        reasonCodes: ['section.boundary_unsupported', 'section.count_unstable'],
        barIndex: 4,
        unavailableReason: null,
      },
    ]);
  });

  it('keeps a stale candidate visible but unavailable', () => {
    const analysis = rejectedAnalysis();
    analysis.baseline_candidate_levels[0].boundaries_seconds = [0, 99, 120];
    analysis.measurements.boundary_support = [0.54];

    expect(
      rejectedBoundarySuggestions(analysis, bars, beatTimes)[0],
    ).toMatchObject({
      boundarySeconds: 99,
      barIndex: null,
      unavailableReason:
        'Esta sugestão não corresponde mais à grade atual de compassos.',
    });
  });

  it('does not remap an in-range candidate to a distant bar boundary', () => {
    const analysis = rejectedAnalysis();
    analysis.baseline_candidate_levels[0].boundaries_seconds = [0, 9.8, 24];
    analysis.measurements.boundary_support = [0.54];

    expect(
      rejectedBoundarySuggestions(analysis, bars, beatTimes)[0],
    ).toMatchObject({
      boundarySeconds: 9.8,
      barIndex: null,
      unavailableReason:
        'Esta sugestão não corresponde mais à grade atual de compassos.',
    });
  });

  it('maps a current non-downbeat candidate to the nearest editable bar edge', () => {
    const analysis = rejectedAnalysis();
    analysis.baseline_candidate_levels[0].boundaries_seconds = [0, 10, 24];
    analysis.measurements.boundary_support = [0.54];

    expect(
      rejectedBoundarySuggestions(analysis, bars, beatTimes)[0],
    ).toMatchObject({
      boundarySeconds: 10,
      barIndex: 2,
      unavailableReason: null,
    });
  });

  it('does not expose candidates for accepted or absent analysis', () => {
    expect(
      rejectedBoundarySuggestions(
        { ...rejectedAnalysis(), decision: 'accepted' },
        bars,
        beatTimes,
      ),
    ).toEqual([]);
    expect(rejectedBoundarySuggestions(null, bars, beatTimes)).toEqual([]);
  });

  it('translates recorded reason codes without discarding unknown provenance', () => {
    expect(rejectedBoundaryReasonLabel('section.boundary_unsupported')).toBe(
      'apoio abaixo do mínimo de 67%',
    );
    expect(rejectedBoundaryReasonLabel('section.future_reason')).toBe(
      'section.future_reason',
    );
  });
});
