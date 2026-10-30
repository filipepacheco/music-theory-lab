import { describe, expect, it } from 'vitest';
import { grooveTotalStepCount } from '@/constants/groove';
import type {
  GrooveMeasureCount,
  GroovePattern,
  GrooveSubdivision,
} from '@/types';
import {
  grooveBeats,
  grooveHasHits,
  grooveHitsAtTick,
  grooveStepDuration,
  grooveTickDuration,
} from './grooveSchedule';

function emptyGroove(
  subdivision: GrooveSubdivision = '16n',
  measureCount: GrooveMeasureCount = 1,
): GroovePattern {
  return {
    subdivision,
    measureCount,
    bumbo: Array(grooveTotalStepCount(subdivision, measureCount)).fill(false),
    caixa: Array(grooveTotalStepCount(subdivision, measureCount)).fill(false),
    chimbal: Array(grooveTotalStepCount(subdivision, measureCount)).fill(false),
  };
}

/** The hits of every step, beat after beat. */
const grooveHits = (groove: GroovePattern) =>
  grooveBeats(groove).flatMap((view) => view.hits);

describe('groove schedule', () => {
  it('returns hits aligned to each grid step', () => {
    const groove = emptyGroove();
    groove.chimbal[0] = true;
    groove.bumbo[0] = true;
    groove.caixa[5] = true;
    groove.chimbal[15] = true;

    const hits = grooveHits(groove);

    expect(hits).toHaveLength(16);
    expect(hits[0]).toEqual(['chimbal', 'bumbo']);
    expect(hits[5]).toEqual(['caixa']);
    expect(hits[15]).toEqual(['chimbal']);
    expect(hits.slice(1, 5).every((step) => step.length === 0)).toBe(true);
  });

  it('calculates one grid-step duration from quarter-note BPM', () => {
    expect(grooveStepDuration(120)).toBe(0.125);
    expect(grooveStepDuration(120, '8n')).toBe(0.25);
    expect(grooveStepDuration(60)).toBe(0.25);
    expect(grooveStepDuration(60, '8t')).toBe(1 / 3);
    expect(grooveTickDuration(60)).toBe(1 / 24);
  });

  it('maps live patterns onto a fixed 96-tick scheduler', () => {
    const sixteenths = emptyGroove('16n');
    sixteenths.bumbo[1] = true;

    const eighths = emptyGroove('8n');
    eighths.caixa[1] = true;

    expect(grooveHitsAtTick(sixteenths, 6)).toEqual(['bumbo']);
    expect(grooveHitsAtTick(eighths, 12)).toEqual(['caixa']);
    expect(grooveHitsAtTick(eighths, 13)).toEqual([]);
  });

  it('places triplet and sextuplet steps on the same clock', () => {
    const triplets = emptyGroove('8t');
    triplets.chimbal[2] = true;
    triplets.caixa[4] = true;

    const sextuplets = emptyGroove('16t');
    sextuplets.bumbo[5] = true;

    expect(grooveHits(triplets)).toHaveLength(12);
    expect(grooveHitsAtTick(triplets, 16)).toEqual(['chimbal']);
    expect(grooveHitsAtTick(triplets, 32)).toEqual(['caixa']);
    expect(grooveHitsAtTick(triplets, 12)).toEqual([]);
    expect(grooveHitsAtTick(sextuplets, 20)).toEqual(['bumbo']);
  });

  it('plays the ride and crash rows, and reads old grooves without them', () => {
    const groove = emptyGroove('8n');
    groove.crash = Array(8).fill(false);
    groove.ride = Array(8).fill(false);
    groove.crash[0] = true;
    groove.ride[1] = true;
    groove.bumbo[0] = true;

    expect(grooveHits(groove)[0]).toEqual(['crash', 'bumbo']);
    expect(grooveHits(groove)[1]).toEqual(['ride']);
    expect(grooveHits(emptyGroove('8n')).flat()).toEqual([]);
  });

  it('keeps the second measure in the schedule', () => {
    const groove = emptyGroove('16n', 2);
    groove.bumbo[16] = true;
    groove.chimbal[31] = true;

    expect(grooveHits(groove)).toHaveLength(32);
    expect(grooveHits(groove)[16]).toEqual(['bumbo']);
    expect(grooveHitsAtTick(groove, 96)).toEqual(['bumbo']);
    expect(grooveHitsAtTick(groove, 186)).toEqual(['chimbal']);
  });

  it('plays a triplet beat inside a sixteenth-note groove', () => {
    const groove = emptyGroove('16n');
    groove.bumbo[0] = true;
    groove.beats = {
      3: {
        subdivision: '8t',
        hits: { caixa: [true, true, true], tomAgudo: [false, false, true] },
      },
    };

    const views = grooveBeats(groove);
    expect(views.map((view) => view.stepsPerBeat)).toEqual([4, 4, 4, 3]);
    expect(views[3].tuplet).toBe(3);
    expect(views[3].own).toBe(true);
    expect(grooveHitsAtTick(groove, 0)).toEqual(['bumbo']);
    expect(grooveHitsAtTick(groove, 72)).toEqual(['caixa']);
    expect(grooveHitsAtTick(groove, 80)).toEqual(['caixa']);
    expect(grooveHitsAtTick(groove, 88)).toEqual(['tomAgudo', 'caixa']);
    expect(grooveHitsAtTick(groove, 78)).toEqual([]);
  });

  it('counts the hits of beats with their own resolution', () => {
    const groove = emptyGroove('16n');
    expect(grooveHasHits(groove)).toBe(false);
    groove.beats = { 1: { subdivision: '16t', hits: { surdo: [true] } } };
    expect(grooveHasHits(groove)).toBe(true);
  });
});
