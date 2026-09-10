import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import LibraryRejectedBoundaryReview from '@/components/library/LibraryRejectedBoundaryReview';
import { createLibraryAnnotation } from '@/domain/libraryAnnotation';
import type { ChordChartBar } from '@/components/library/libraryData';
import type { RejectedBoundarySuggestion } from '@/domain/rejectedBoundarySuggestions';

const bars: ChordChartBar[] = Array.from({ length: 4 }, (_, index) => ({
  index,
  startSeconds: index * 4,
  endSeconds: (index + 1) * 4,
  chords: [{ chord: 'C', romanNumeral: 'I', raw: null }],
}));

const suggestions: RejectedBoundarySuggestion[] = [
  {
    id: 'candidate-1',
    boundarySeconds: 8,
    support: 0.61,
    reasonCodes: ['section.boundary_unsupported'],
    barIndex: 2,
    unavailableReason: null,
  },
  {
    id: 'candidate-stale',
    boundarySeconds: 99,
    support: 0.54,
    reasonCodes: ['section.count_unstable'],
    barIndex: null,
    unavailableReason:
      'Esta sugestão não corresponde mais à grade atual de compassos.',
  },
];

function render(visible: boolean): string {
  return renderToStaticMarkup(
    createElement(LibraryRejectedBoundaryReview, {
      document: createLibraryAnnotation('source-sha', bars.length, []),
      bars,
      activeSectionIndex: -1,
      suggestions,
      visible,
      onVisibleChange: vi.fn(),
      onEdit: vi.fn(),
      onAdopt: vi.fn(),
    }),
  );
}

describe('rejected boundary review', () => {
  it('hides rejected provenance by default behind an explicit control', () => {
    const markup = render(false);

    expect(markup).toContain('Ver sugestões rejeitadas');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).not.toContain('61% de apoio');
    expect(markup).not.toContain('Sugestão rejeitada antes');
  });

  it('reveals rejected provenance inline with accessible semantics', () => {
    const markup = render(true);

    expect(markup).toContain('Ocultar sugestões rejeitadas');
    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain('Sugestão rejeitada antes do compasso 3');
    expect(markup).toContain('61% de apoio');
    expect(markup).toContain('apoio abaixo do mínimo de 67%');
    expect(markup).toMatch(/<span[^>]*>apoio abaixo do mínimo de 67%<\/span>/);
    expect(markup).toContain('border-dashed');
    expect(markup).toContain('<button');
    expect(markup).not.toContain('tabindex="-1"');
  });

  it('announces stale candidates as unavailable and prevents adoption', () => {
    const markup = render(true);

    expect(markup).toContain('Sugestão rejeitada indisponível');
    expect(markup).toContain(
      'Esta sugestão não corresponde mais à grade atual de compassos.',
    );
    expect(markup).toContain('disabled=""');
  });
});
