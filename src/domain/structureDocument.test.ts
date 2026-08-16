import { describe, expect, it } from 'vitest';
import {
  createStructureDocumentModule,
  type StructureDocument,
} from './structureDocument';

const section = (id: string, barIds: string[] = []) => ({
  id,
  name: id,
  color: '#fff',
  barIds,
});

const baseDocument: StructureDocument = {
  bars: [
    { id: 'b1', index: 0, timeSignature: '4/4' },
    { id: 'b2', index: 1, timeSignature: '4/4' },
  ],
  sections: [section('intro', ['b1']), section('verse', ['b2'])],
};

describe('structure document', () => {
  it('keeps bar indexes aligned with section order after moving a bar', () => {
    const module = createStructureDocumentModule({ createId: () => 'unused' });

    const result = module.moveBarToSection(baseDocument, 'b1', 'verse');

    expect(result.sections[0].barIds).toEqual([]);
    expect(result.sections[1].barIds).toEqual(['b2', 'b1']);
    expect(result.bars.map((bar) => [bar.id, bar.index])).toEqual([
      ['b2', 0],
      ['b1', 1],
    ]);
  });

  it('removes accents that are outside a bar’s new time signature', () => {
    const module = createStructureDocumentModule();
    const document = {
      ...baseDocument,
      bars: [
        { ...baseDocument.bars[0], accents: [0, 1, 2, 3, 4] },
        baseDocument.bars[1],
      ],
    };

    const result = module.setBarTimeSignature(document, 'b1', '2/4');

    expect(result.bars[0]).toMatchObject({
      timeSignature: '2/4',
      accents: [0, 1, 2, 3],
    });
  });

  it('duplicates a section with fresh bar ids and preserves order', () => {
    const ids = ['b3', 'new-section'];
    const module = createStructureDocumentModule({
      createId: () => ids.shift()!,
    });

    const result = module.duplicateSection(baseDocument, 'intro', '4/4');

    expect(result?.focusedSectionId).toBe('new-section');
    expect(result?.sections.map((item) => item.id)).toEqual([
      'intro',
      'new-section',
      'verse',
    ]);
    expect(result?.sections[1].barIds).toEqual(['b3']);
    expect(result?.bars.map((bar) => bar.id)).toEqual(['b1', 'b3', 'b2']);
  });
});
