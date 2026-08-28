import { describe, expect, it } from 'vitest';
import { migrateSection, migrateStructureData } from './migrations';
import type { StructureBar } from '@/types';

const bar = (id: string): StructureBar => ({
  id,
  index: 0,
  timeSignature: '4/4',
});

describe('migrateSection', () => {
  it('passes through the modern name+color shape', () => {
    const modern = {
      id: 's1',
      name: 'Refrao',
      color: '#123456',
      barIds: ['b1'],
    };

    expect(migrateSection(modern)).toEqual(modern);
  });

  it('derives name and color from a legacy type', () => {
    const migrated = migrateSection({
      id: 's1',
      type: 'refrao',
      barIds: ['b1'],
    });

    expect(migrated.name).toBe('Refrão');
    expect(migrated.color).toBeDefined();
  });

  it('prefers the custom label for legacy custom sections', () => {
    const migrated = migrateSection({
      id: 's1',
      type: 'custom',
      customLabel: 'Final',
      barIds: ['b1'],
    });

    expect(migrated.name).toBe('Final');
  });

  it('preserves a groove when migrating a legacy section', () => {
    const groove = {
      subdivision: '8n' as const,
      bumbo: Array(8).fill(false),
      caixa: Array(8).fill(false),
      chimbal: Array(8).fill(false),
    };

    const migrated = migrateSection({
      id: 's1',
      type: 'refrao',
      barIds: ['b1'],
      groove,
    });

    expect(migrated.groove).toEqual(groove);
  });
});

describe('migrateStructureData', () => {
  it('collects unassigned bars under "Sem seção"', () => {
    const result = migrateStructureData(
      [bar('b1'), bar('b2')],
      [{ id: 's1', name: 'A', color: '#000000', barIds: ['b1'] }],
    );

    expect(result.sections).toHaveLength(2);
    expect(result.sections[1].name).toBe('Sem seção');
    expect(result.sections[1].barIds).toEqual(['b2']);
  });

  it('adds no section when every bar is assigned', () => {
    const result = migrateStructureData(
      [bar('b1')],
      [{ id: 's1', name: 'A', color: '#000000', barIds: ['b1'] }],
    );

    expect(result.sections).toHaveLength(1);
  });
});
