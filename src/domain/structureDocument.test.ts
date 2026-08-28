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

  describe('groove', () => {
    const module = createStructureDocumentModule();

    it('creates a 16-step pattern with one hit on first toggle', () => {
      const result = module.toggleGrooveHit(baseDocument, 'intro', 'bumbo', 0);

      const groove = result.sections[0].groove;
      expect(groove?.subdivision).toBe('16n');
      expect(groove?.bumbo).toHaveLength(16);
      expect(groove?.bumbo.filter(Boolean)).toEqual([true]);
      expect(groove?.caixa.filter(Boolean)).toEqual([]);
      expect(groove?.chimbal.filter(Boolean)).toEqual([]);
      expect(result.sections[1].groove).toBeUndefined();
    });

    it('toggles a hit off again without removing the pattern', () => {
      const withHit = module.toggleGrooveHit(baseDocument, 'intro', 'caixa', 4);
      const result = module.toggleGrooveHit(withHit, 'intro', 'caixa', 4);

      expect(result.sections[0].groove?.caixa[4]).toBe(false);
      expect(result.sections[0].groove).toBeDefined();
    });

    it('ignores out-of-range steps', () => {
      const result = module.toggleGrooveHit(baseDocument, 'intro', 'bumbo', 16);

      expect(result.sections[0].groove).toBeUndefined();
    });

    it('changes resolution while preserving aligned hits', () => {
      const withHits = module.toggleGrooveHit(
        module.toggleGrooveHit(baseDocument, 'intro', 'bumbo', 0),
        'intro',
        'bumbo',
        1,
      );
      const withDownbeat = module.toggleGrooveHit(
        withHits,
        'intro',
        'bumbo',
        4,
      );
      const result = module.setGrooveSubdivision(withDownbeat, 'intro', '8n');

      const groove = result.sections[0].groove;
      expect(groove?.subdivision).toBe('8n');
      expect(groove?.bumbo).toHaveLength(8);
      expect(groove?.bumbo[0]).toBe(true);
      expect(groove?.bumbo[2]).toBe(true);
      expect(
        groove?.bumbo.some((hit, step) => hit && step !== 0 && step !== 2),
      ).toBe(false);
    });

    it('creates a groove at the selected resolution before the first hit', () => {
      const result = module.setGrooveSubdivision(baseDocument, 'intro', '32n');

      expect(result.sections[0].groove?.subdivision).toBe('32n');
      expect(result.sections[0].groove?.bumbo).toHaveLength(32);
      expect(result.sections[0].groove?.bumbo.every((hit) => !hit)).toBe(true);
    });

    it('clears the whole pattern', () => {
      const withHit = module.toggleGrooveHit(
        baseDocument,
        'intro',
        'chimbal',
        8,
      );
      const result = module.clearGroove(withHit, 'intro');

      expect(result.sections[0].groove).toBeUndefined();
    });

    it('copies the groove when duplicating a section', () => {
      const withHit = module.toggleGrooveHit(baseDocument, 'intro', 'bumbo', 0);
      const result = module.duplicateSection(withHit, 'intro', '4/4');

      expect(result?.sections[1].groove?.bumbo[0]).toBe(true);
      expect(result?.sections[1].groove).not.toBe(result?.sections[0].groove);
    });
  });
});
