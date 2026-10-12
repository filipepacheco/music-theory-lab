import { describe, expect, it } from 'vitest';
import { DRUM_PIECE_LABEL, type DrumChartPiece } from '@/domain/drumChart';
import { fixtureDrumChart } from '@/domain/drumChartFixture';
import {
  DRUM_DYNAMIC_GAIN,
  drumPlaybackHits,
  drumSampleFor,
} from '@/domain/drumPlaybackSchedule';

describe('drumSampleFor', () => {
  it('gives every piece of the map but "outros" a sample', () => {
    for (const piece of Object.keys(DRUM_PIECE_LABEL) as DrumChartPiece[]) {
      const picked = drumSampleFor(piece, 'normal');
      if (piece === 'outros') expect(picked).toBeNull();
      else expect(picked).not.toBeNull();
    }
  });

  it('sounds the closed, open, and pedal hi-hat differently', () => {
    const samples = (['closed', 'open', 'pedal'] as const).map(
      (a) => drumSampleFor('chimbal', a)?.sample,
    );
    expect(new Set(samples).size).toBe(3);
  });

  it('sounds the cross-stick, the splash, and the ride bell with their own samples', () => {
    expect(drumSampleFor('caixa', 'crossStick')?.sample).toBe('cross-stick');
    expect(drumSampleFor('pratoAtaque', 'splash')?.sample).toBe('splash');
    expect(drumSampleFor('pratoConducao', 'bell')?.sample).toBe('ride-bell');
  });

  it('tunes the toms apart', () => {
    const rates = (['tomAgudo', 'tomMedio', 'surdo'] as const).map((p) => {
      const picked = drumSampleFor(p, 'normal');
      return `${picked?.sample}@${picked?.rate}`;
    });
    expect(new Set(rates).size).toBe(3);
  });
});

describe('drumPlaybackHits', () => {
  it('lists the hits in time order with their sample', () => {
    const chart = fixtureDrumChart(1, [
      { bar: 0, beat: 1, midi: 38 },
      { bar: 0, beat: 0, midi: 36 },
      { bar: 0, beat: 0, midi: 42 },
    ]);
    const hits = drumPlaybackHits(chart.hits);
    expect(hits.map((h) => h.sample)).toEqual([
      'kick',
      'hihat-closed',
      'snare',
    ]);
    expect(hits.map((h) => h.time)).toEqual([0, 0, 0.5]);
  });

  it('makes a ghost note softer and an accent louder than a normal hit', () => {
    const chart = fixtureDrumChart(1, [
      { bar: 0, beat: 0, midi: 38, dynamic: 'ghost' },
      { bar: 0, beat: 1, midi: 38 },
      { bar: 0, beat: 2, midi: 38, dynamic: 'accent' },
    ]);
    const [ghost, normal, accent] = drumPlaybackHits(chart.hits).map(
      (h) => h.gain,
    );
    expect(ghost).toBeLessThan(normal);
    expect(accent).toBeGreaterThan(normal);
    expect(accent).toBeLessThanOrEqual(1);
    expect(ghost).toBe(DRUM_DYNAMIC_GAIN.ghost);
  });

  it('skips a hit that has no sample, without an error', () => {
    const chart = fixtureDrumChart(1, [
      { bar: 0, beat: 0, midi: 80 },
      { bar: 0, beat: 1, midi: 36 },
    ]);
    expect(drumPlaybackHits(chart.hits).map((h) => h.sample)).toEqual(['kick']);
  });
});
