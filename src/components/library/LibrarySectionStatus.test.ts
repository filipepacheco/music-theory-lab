import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import LibrarySectionStatus from '@/components/library/LibrarySectionStatus';
import type { SectionAnalysisJson } from '@/components/library/libraryData';

function fallbackAnalysis(): SectionAnalysisJson {
  return {
    schema_version: '1.0.0',
    source_sha256: 'source-sha',
    origin: 'fallback',
    review_required: true,
    fallback_reason_codes: ['beat.gate_uncalibrated'],
    sections: [{ start_seconds: 0, end_seconds: 120, label: 'Parte 1' }],
    settings: null,
    warnings: [],
  };
}

describe('Library section quality status', () => {
  it('explains the editable fallback without claiming automatic success', () => {
    const markup = renderToStaticMarkup(
      createElement(LibrarySectionStatus, { analysis: fallbackAnalysis() }),
    );

    expect(markup).toContain('Seções automáticas não publicadas');
    expect(markup).toContain('única seção neutra e editável');
    expect(markup).toContain('revisão');
  });

  it('stays absent for accepted automatic sections', () => {
    const accepted = {
      ...fallbackAnalysis(),
      origin: 'automatic' as const,
      review_required: false,
    };

    expect(
      renderToStaticMarkup(
        createElement(LibrarySectionStatus, { analysis: accepted }),
      ),
    ).toBe('');
  });

  it('explains abstention when structural boundaries are unstable', () => {
    const unstable = {
      ...fallbackAnalysis(),
      fallback_reason_codes: ['section.boundary_unsupported'],
    };

    const markup = renderToStaticMarkup(
      createElement(LibrarySectionStatus, { analysis: unstable }),
    );

    expect(markup).toContain('não permaneceu estável');
    expect(markup).toContain('única seção neutra e editável');
  });
});
