import { describe, expect, it } from 'vitest';
import type { ChartSummary } from '@/domain/chartSummary';
import {
  muteControls,
  NO_MUTES,
  partsLaneSchedule,
  partsSounding,
} from '@/domain/songPartsPlayback';

const bass = [{ time: 0 }, { time: 2 }];
const drums = [{ time: 1 }];
const lanes = [
  { key: 'g1', events: [{ time: 0.5 }, { time: 2.5 }] },
  { key: 'g2', events: [{ time: 1.5 }] },
];
const KEYS = ['bass', 'drums', 'g1', 'g2'];
const base = { open: 'bass', sameFile: true, recording: false } as const;

describe('parts schedule with many charts', () => {
  it('puts every chart on one clock in time order', () => {
    const schedule = partsLaneSchedule(
      { ...base, mutes: NO_MUTES, keys: KEYS },
      bass,
      drums,
      lanes,
    );
    expect(schedule.map((event) => [event.time, event.key])).toEqual([
      [0, 'bass'],
      [0.5, 'g1'],
      [1, 'drums'],
      [1.5, 'g2'],
      [2, 'bass'],
      [2.5, 'g1'],
    ]);
  });

  it('a mute silences only its chart', () => {
    const schedule = partsLaneSchedule(
      { ...base, mutes: { ...NO_MUTES, g1: true }, keys: KEYS },
      bass,
      drums,
      lanes,
    );
    expect(new Set(schedule.map((event) => event.key))).toEqual(
      new Set(['bass', 'drums', 'g2']),
    );
    expect(schedule).toHaveLength(4);
  });

  it('sounds only the open chart when another file is chosen', () => {
    expect(
      partsSounding({
        open: 'g2',
        sameFile: false,
        recording: false,
        mutes: NO_MUTES,
        keys: KEYS,
      }),
    ).toEqual({ bass: false, drums: false, g1: false, g2: true });
  });

  it('is silent for every chart with a linked recording', () => {
    expect(
      partsLaneSchedule(
        { ...base, recording: true, mutes: NO_MUTES, keys: KEYS },
        bass,
        drums,
        lanes,
      ),
    ).toEqual([]);
  });
});

function summary(
  id: string,
  part: ChartSummary['part'],
  partName?: string,
): ChartSummary {
  return {
    id,
    title: 't',
    artist: 'a',
    source: 'gp',
    part,
    partName,
    tempoBpm: 120,
    durationSeconds: 1,
    barCount: 1,
    noteCount: 1,
    tuning: null,
    importedAt: '',
  };
}

describe('muteControls', () => {
  it('gives one control for each chart, labelled with its part name', () => {
    expect(
      muteControls([
        summary('b', 'bass'),
        summary('d', 'drums'),
        summary('g1', 'guitar', 'Guitarra 1 - Rhythm'),
        summary('g2', 'guitar', 'Guitarra 2 - Lead'),
        summary('v', 'vocals', 'Voz'),
      ]),
    ).toEqual([
      { key: 'bass', label: 'Baixo' },
      { key: 'drums', label: 'Bateria' },
      { key: 'g1', label: 'Guitarra 1 - Rhythm' },
      { key: 'g2', label: 'Guitarra 2 - Lead' },
      { key: 'v', label: 'Voz' },
    ]);
  });
});
