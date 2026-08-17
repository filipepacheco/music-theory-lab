import { describe, expect, it } from 'vitest';
import { transcriptionDocument } from './transcriptionDocument';
import type { TranscriptionDocument } from './transcriptionDocument';
import type { ProgressionStep } from '@/constants/progressions';

const step = (label: string): ProgressionStep => ({
  degree: null,
  label,
});

const doc: TranscriptionDocument = { sections: [], activeSectionIndex: 0 };

describe('transcriptionDocument', () => {
  it('adds a section and activates it', () => {
    const next = transcriptionDocument.addSection(
      doc,
      'verso',
      undefined,
      { createId: () => 'sec-1' },
    );

    expect(next.activeSectionIndex).toBe(0);
    expect(next.sections).toEqual([
      { id: 'sec-1', type: 'verso', customLabel: undefined, steps: [] },
    ]);
  });

  it('removes a section and clamps the active index', () => {
    const two = transcriptionDocument.addSection(
      transcriptionDocument.addSection(doc, 'verso', undefined, {
        createId: () => 'a',
      }),
      'refrao',
      undefined,
      { createId: () => 'b' },
    );
    const removed = transcriptionDocument.removeSection(two, 1);

    expect(removed.sections.map((s) => s.id)).toEqual(['a']);
    expect(removed.activeSectionIndex).toBe(0);
  });

  it('clears sections when the last one is removed', () => {
    const one = transcriptionDocument.addSection(doc, 'verso', undefined, {
      createId: () => 'a',
    });
    const removed = transcriptionDocument.removeSection(one, 0);

    expect(removed.sections).toEqual([]);
    expect(removed.activeSectionIndex).toBe(0);
  });

  it('adds and removes steps inside a section', () => {
    const withSection = transcriptionDocument.addSection(
      doc,
      'verso',
      undefined,
      { createId: () => 'a' },
    );
    const added = transcriptionDocument.addStepToSection(
      withSection,
      0,
      step('I'),
    );

    expect(added.sections[0].steps).toEqual([step('I')]);

    const removed = transcriptionDocument.removeStepFromSection(added, 0, 0);
    expect(removed.sections[0].steps).toEqual([]);
  });

  it('clamps beats inside a section', () => {
    const withSection = transcriptionDocument.addSection(
      doc,
      'verso',
      undefined,
      { createId: () => 'a' },
    );
    const added = transcriptionDocument.addStepToSection(
      withSection,
      0,
      step('I'),
    );
    const updated = transcriptionDocument.setStepBeatsInSection(
      added,
      0,
      0,
      9.9,
    );

    expect(updated.sections[0].steps[0].beats).toBe(8);
  });

  it('sets step confidence', () => {
    const withSection = transcriptionDocument.addSection(
      doc,
      'verso',
      undefined,
      { createId: () => 'a' },
    );
    const added = transcriptionDocument.addStepToSection(
      withSection,
      0,
      step('I'),
    );
    const updated = transcriptionDocument.setStepConfidenceInSection(
      added,
      0,
      0,
      'sure',
    );

    expect(updated.sections[0].steps[0].confidence).toBe('sure');
  });
});
