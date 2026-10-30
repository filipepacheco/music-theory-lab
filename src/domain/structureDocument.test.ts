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
      const result = module.toggleGrooveHit(
        baseDocument,
        'intro',
        'bumbo',
        0,
        0,
      );

      const groove = result.sections[0].groove;
      expect(groove?.subdivision).toBe('16n');
      expect(groove?.bumbo).toHaveLength(16);
      expect(groove?.bumbo.filter(Boolean)).toEqual([true]);
      expect(groove?.caixa.filter(Boolean)).toEqual([]);
      expect(groove?.chimbal.filter(Boolean)).toEqual([]);
      expect(result.sections[1].groove).toBeUndefined();
    });

    it('toggles a hit off again without removing the pattern', () => {
      const withHit = module.toggleGrooveHit(
        baseDocument,
        'intro',
        'caixa',
        1,
        0,
      );
      const result = module.toggleGrooveHit(withHit, 'intro', 'caixa', 1, 0);

      expect(result.sections[0].groove?.caixa[4]).toBe(false);
      expect(result.sections[0].groove).toBeDefined();
    });

    it('ignores out-of-range steps', () => {
      const result = module.toggleGrooveHit(
        baseDocument,
        'intro',
        'bumbo',
        4,
        0,
      );

      expect(result.sections[0].groove).toBeUndefined();
    });

    it('changes resolution while preserving aligned hits', () => {
      const withHits = module.toggleGrooveHit(
        module.toggleGrooveHit(baseDocument, 'intro', 'bumbo', 0, 0),
        'intro',
        'bumbo',
        0,
        1,
      );
      const withDownbeat = module.toggleGrooveHit(
        withHits,
        'intro',
        'bumbo',
        1,
        0,
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

    it('supports two measures and preserves each measure while resampling', () => {
      const twoMeasures = module.setGrooveMeasureCount(
        baseDocument,
        'intro',
        2,
      );
      const withHits = module.toggleGrooveHit(
        module.toggleGrooveHit(twoMeasures, 'intro', 'bumbo', 0, 0),
        'intro',
        'bumbo',
        4,
        0,
      );

      expect(withHits.sections[0].groove?.bumbo).toHaveLength(32);
      const result = module.setGrooveSubdivision(withHits, 'intro', '8n');

      expect(result.sections[0].groove?.measureCount).toBe(2);
      expect(result.sections[0].groove?.bumbo).toHaveLength(16);
      expect(result.sections[0].groove?.bumbo[0]).toBe(true);
      expect(result.sections[0].groove?.bumbo[8]).toBe(true);
    });

    it('keeps the beat starts when switching to triplets', () => {
      const withHits = module.toggleGrooveHit(
        module.toggleGrooveHit(baseDocument, 'intro', 'bumbo', 1, 0),
        'intro',
        'bumbo',
        1,
        2,
      );
      const result = module.setGrooveSubdivision(withHits, 'intro', '8t');
      const bumbo = result.sections[0].groove?.bumbo;

      expect(bumbo).toHaveLength(12);
      expect(bumbo?.[3]).toBe(true);
      expect(bumbo?.filter(Boolean)).toHaveLength(1);
    });

    it('adds a ride or crash hit to a groove saved without those rows', () => {
      const legacy = {
        ...baseDocument,
        sections: baseDocument.sections.map((section) =>
          section.id === 'intro'
            ? {
                ...section,
                groove: {
                  subdivision: '8n' as const,
                  measureCount: 1 as const,
                  bumbo: [
                    true,
                    false,
                    false,
                    false,
                    false,
                    false,
                    false,
                    false,
                  ],
                  caixa: Array(8).fill(false),
                  chimbal: Array(8).fill(false),
                },
              }
            : section,
        ),
      };
      const result = module.toggleGrooveHit(legacy, 'intro', 'crash', 0, 0);
      const groove = result.sections[0].groove;

      expect(groove?.crash?.[0]).toBe(true);
      expect(groove?.ride).toHaveLength(8);
      expect(groove?.bumbo[0]).toBe(true);
    });

    it('writes a triplet fill in one beat of a sixteenth-note groove', () => {
      const withKick = module.toggleGrooveHit(
        baseDocument,
        'intro',
        'bumbo',
        3,
        0,
      );
      const triplet = module.setGrooveBeatSubdivision(
        withKick,
        'intro',
        3,
        '8t',
      );
      const result = module.toggleGrooveHit(triplet, 'intro', 'caixa', 3, 2);
      const groove = result.sections[0].groove;

      expect(groove?.subdivision).toBe('16n');
      expect(groove?.bumbo).toHaveLength(16);
      expect(groove?.bumbo[12]).toBe(false);
      expect(groove?.beats?.[3]?.subdivision).toBe('8t');
      expect(groove?.beats?.[3]?.hits.bumbo).toEqual([true, false, false]);
      expect(groove?.beats?.[3]?.hits.caixa).toEqual([false, false, true]);
      expect(groove?.beats?.[0]).toBeUndefined();
    });

    it('returns a beat to the base resolution with its aligned hits', () => {
      const sextuplet = module.setGrooveBeatSubdivision(
        baseDocument,
        'intro',
        1,
        '16t',
      );
      const withHits = module.toggleGrooveHit(
        module.toggleGrooveHit(sextuplet, 'intro', 'caixa', 1, 0),
        'intro',
        'caixa',
        1,
        3,
      );
      const withOdd = module.toggleGrooveHit(withHits, 'intro', 'caixa', 1, 1);
      const result = module.setGrooveBeatSubdivision(
        withOdd,
        'intro',
        1,
        '16n',
      );
      const groove = result.sections[0].groove;

      expect(groove?.beats).toBeUndefined();
      expect(groove?.caixa.slice(4, 8)).toEqual([true, false, true, false]);
    });

    it('keeps own beats when the base resolution or the length changes', () => {
      const triplet = module.setGrooveBeatSubdivision(
        module.setGrooveMeasureCount(baseDocument, 'intro', 2),
        'intro',
        6,
        '8t',
      );
      const withHit = module.toggleGrooveHit(triplet, 'intro', 'caixa', 6, 1);

      const eighths = module.setGrooveSubdivision(withHit, 'intro', '8n');
      expect(eighths.sections[0].groove?.beats?.[6]?.hits.caixa).toEqual([
        false,
        true,
        false,
      ]);

      const asBase = module.setGrooveSubdivision(withHit, 'intro', '8t');
      expect(asBase.sections[0].groove?.beats).toBeUndefined();
      expect(asBase.sections[0].groove?.caixa[19]).toBe(true);

      const oneMeasure = module.setGrooveMeasureCount(withHit, 'intro', 1);
      expect(oneMeasure.sections[0].groove?.beats).toBeUndefined();
    });

    it('clears the whole pattern', () => {
      const withHit = module.toggleGrooveHit(
        baseDocument,
        'intro',
        'chimbal',
        2,
        0,
      );
      const result = module.clearGroove(withHit, 'intro');

      expect(result.sections[0].groove).toBeUndefined();
    });

    it('copies the groove when duplicating a section', () => {
      const withHit = module.toggleGrooveHit(
        baseDocument,
        'intro',
        'bumbo',
        0,
        0,
      );
      const result = module.duplicateSection(withHit, 'intro', '4/4');

      expect(result?.sections[1].groove?.bumbo[0]).toBe(true);
      expect(result?.sections[1].groove).not.toBe(result?.sections[0].groove);
    });
  });
});
