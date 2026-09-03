import { describe, expect, it } from 'vitest';
import { grooveTotalStepCount } from '@/constants/groove';
import type { GroovePattern, StructureSection } from '@/types';
import {
  FORMATS,
  calcSectionLayout,
  groovePdfRows,
  layoutSections,
} from './exportStructurePdf';

function groove(subdivision: GroovePattern['subdivision']): GroovePattern {
  return {
    subdivision,
    measureCount: 1,
    bumbo: Array(grooveTotalStepCount(subdivision, 1)).fill(false),
    caixa: Array(grooveTotalStepCount(subdivision, 1)).fill(false),
    chimbal: Array(grooveTotalStepCount(subdivision, 1)).fill(false),
  };
}

function sectionWithGroove(): StructureSection {
  return {
    id: 'intro',
    name: 'Intro',
    color: '#34d399',
    barIds: [],
    groove: groove('8n'),
  };
}

describe('structure PDF groove export', () => {
  it('exposes all groove rows and active cells for the PDF renderer', () => {
    const pattern = groove('8n');
    pattern.bumbo[0] = true;
    pattern.caixa[3] = true;

    const rows = groovePdfRows(pattern);

    expect(rows).toHaveLength(3);
    expect(rows.find((row) => row.piece === 'bumbo')?.hits[0]).toBe(true);
    expect(rows.find((row) => row.piece === 'caixa')?.hits[3]).toBe(true);
    expect(rows.find((row) => row.piece === 'chimbal')?.hits).toHaveLength(8);
  });

  it('keeps a groove-only section in the exported layout', () => {
    const section = sectionWithGroove();
    section.groove!.chimbal[0] = true;

    const layouts = layoutSections([section], [], FORMATS.a4, () => []);

    expect(layouts).toHaveLength(1);
    expect(layouts[0]?.grooveH).toBeGreaterThan(0);
  });

  it('reserves vertical space for a groove below the section content', () => {
    const section = sectionWithGroove();
    section.groove!.bumbo[0] = true;

    const layout = calcSectionLayout(section, [], FORMATS.a4, () => []);

    expect(layout.totalH).toBeGreaterThanOrEqual(layout.contentH);
    expect(layout.totalH).toBeGreaterThanOrEqual(
      layout.grooveY + layout.grooveH,
    );
    expect(layout.grooveH).toBeGreaterThan(0);
  });

  it('places a groove below a description in the beside column', () => {
    const section = sectionWithGroove();
    section.comment = '5-8 on the floor';
    section.barIds = ['b1'];
    section.groove!.chimbal[0] = true;

    const layout = calcSectionLayout(
      section,
      [{ id: 'b1', index: 0, timeSignature: '4/4' }],
      FORMATS.a4,
      () => ['5-8 on the floor'],
    );

    expect(layout.commentBeside).toBe(true);
    expect(layout.grooveX).toBe(layout.gridW + FORMATS.a4.commentGap);
    expect(layout.grooveY).toBeGreaterThan(FORMATS.a4.barsTopOffset);
    expect(layout.grooveMeasureW).toBeGreaterThan(FORMATS.a4.grooveMeasureW);
  });

  it('moves a chart below the section when the beside column is too narrow', () => {
    const section = sectionWithGroove();
    section.comment = '5-8 on the floor';
    section.barIds = ['b1', 'b2', 'b3', 'b4'];
    section.barsPerRow = 4;
    section.groove!.chimbal[0] = true;

    const layout = calcSectionLayout(
      section,
      [
        { id: 'b1', index: 0, timeSignature: '4/4' },
        { id: 'b2', index: 1, timeSignature: '4/4' },
        { id: 'b3', index: 2, timeSignature: '4/4' },
        { id: 'b4', index: 3, timeSignature: '4/4' },
      ],
      FORMATS['ipad-air'],
      () => ['5-8 on the floor'],
    );

    expect(layout.commentBeside).toBe(true);
    expect(layout.grooveX).toBe(0);
    expect(layout.grooveY).toBeGreaterThan(layout.contentH);
    expect(
      FORMATS['ipad-air'].grooveLabelW + layout.grooveMeasureW,
    ).toBeCloseTo(
      (FORMATS['ipad-air'].pageW -
        FORMATS['ipad-air'].margin * 2 -
        FORMATS['ipad-air'].colGap) /
        FORMATS['ipad-air'].numCols,
    );
    expect(layout.totalH).toBe(layout.grooveY + layout.grooveH);
  });

  it('exports two measures as one continuous chart sequence', () => {
    const pattern = groove('8n');
    pattern.measureCount = 2;
    pattern.bumbo = Array(16).fill(false);
    pattern.bumbo[8] = true;

    const rows = groovePdfRows(pattern);

    expect(rows.find((row) => row.piece === 'bumbo')?.hits).toHaveLength(16);
    expect(rows.find((row) => row.piece === 'bumbo')?.hits[8]).toBe(true);
  });
});
