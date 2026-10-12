import { describe, expect, it } from 'vitest';
import {
  NO_MUTES,
  partsSchedule,
  partsSounding,
  partsTimeline,
  playsTogether,
} from '@/domain/songPartsPlayback';

const bass = [{ time: 0 }, { time: 1 }, { time: 2 }];
const drums = [{ time: 0 }, { time: 0.5 }, { time: 1 }];

describe('partsSounding', () => {
  it('sounds both parts of one file with no mute and no recording', () => {
    expect(
      partsSounding({
        open: 'bass',
        sameFile: true,
        recording: false,
        mutes: NO_MUTES,
      }),
    ).toEqual({ bass: true, drums: true });
  });

  it('a mute of one part does not stop the other part', () => {
    const base = { open: 'bass', sameFile: true, recording: false } as const;
    expect(
      partsSounding({ ...base, mutes: { bass: true, drums: false } }),
    ).toEqual({ bass: false, drums: true });
    expect(
      partsSounding({ ...base, mutes: { bass: false, drums: true } }),
    ).toEqual({ bass: true, drums: false });
  });

  it('with a source of a different file chosen in the source selector, only the open part plays', () => {
    for (const open of ['bass', 'drums'] as const) {
      const sounding = partsSounding({
        open,
        sameFile: false,
        recording: false,
        mutes: NO_MUTES,
      });
      expect(sounding).toEqual({
        bass: open === 'bass',
        drums: open === 'drums',
      });
    }
    const schedule = partsSchedule(
      { open: 'drums', sameFile: false, recording: false, mutes: NO_MUTES },
      bass,
      drums,
    );
    expect(schedule.every((e) => e.part === 'drums')).toBe(true);
    expect(schedule).toHaveLength(3);
  });

  it('with a linked recording, the schedule holds no sample for the two parts', () => {
    for (const sameFile of [true, false]) {
      const schedule = partsSchedule(
        { open: 'bass', sameFile, recording: true, mutes: NO_MUTES },
        bass,
        drums,
      );
      expect(schedule).toEqual([]);
    }
  });
});

describe('playsTogether', () => {
  it('needs one file and no recording', () => {
    expect(playsTogether({ sameFile: true, recording: false })).toBe(true);
    expect(playsTogether({ sameFile: false, recording: false })).toBe(false);
    expect(playsTogether({ sameFile: true, recording: true })).toBe(false);
  });
});

describe('partsTimeline', () => {
  it('puts the two parts in one list in time order', () => {
    const timeline = partsTimeline(bass, drums);
    expect(timeline.map((e) => [e.time, e.part])).toEqual([
      [0, 'bass'],
      [0, 'drums'],
      [0.5, 'drums'],
      [1, 'bass'],
      [1, 'drums'],
      [2, 'bass'],
    ]);
  });
});
