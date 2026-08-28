import { describe, expect, it } from 'vitest';
import { grooveStepCount } from '@/constants/groove';
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
    bumbo: Array(grooveStepCount(subdivision)).fill(false),
    caixa: Array(grooveStepCount(subdivision)).fill(false),
    chimbal: Array(grooveStepCount(subdivision)).fill(false),
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

    expect(layout.totalH).toBe(layout.contentH + layout.grooveH);
    expect(layout.grooveH).toBeGreaterThan(0);
  });
});
