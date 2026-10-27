import { describe, expect, it } from 'vitest';
import { fixtureChart } from '@/domain/bassChartFixture';
import { summarizeChart } from '@/domain/chartSummary';
import { fixtureDrumChart } from '@/domain/drumChartFixture';
import { drumPlaybackHits } from '@/domain/drumPlaybackSchedule';
import { fixtureGuitarChart } from '@/domain/guitarChartFixture';
import { guitarSynthNotes } from '@/domain/guitarPlayback';
import {
  muteKeyOf,
  NO_MUTES,
  partsLaneSchedule,
} from '@/domain/songPartsPlayback';
import { fixtureVocalChart } from '@/domain/vocalChartFixture';
import { vocalSynthNotes } from '@/domain/vocalPlayback';
import { bassSynthNotes } from '@/services/bassSynthTransport';

const vocal = fixtureVocalChart(2, [
  { bar: 0, beat: 0, midi: 60, lyric: 'la' },
  { bar: 0, beat: 0, midi: 64 },
  { bar: 0, beat: 2, midi: 62, length: 2 },
  { bar: 1, beat: 0, midi: 65, length: 0 },
]);

describe('vocal synth notes', () => {
  it('keeps every note, also notes that sound at once', () => {
    const notes = vocalSynthNotes(vocal.notes);
    expect(notes.map((n) => n.midi)).toEqual(vocal.notes.map((n) => n.midi));
    expect(notes.filter((n) => n.time === 0)).toHaveLength(2);
  });

  it('gives each note a length, a short written one included', () => {
    const notes = vocalSynthNotes(vocal.notes);
    expect(notes.every((n) => n.seconds > 0)).toBe(true);
    expect(notes[2].seconds).toBeCloseTo(1);
  });
});

describe('parts schedule with a vocal chart next to the other parts', () => {
  const bass = fixtureChart(2, [{ bar: 0, beat: 0, midi: 40 }]);
  const drums = fixtureDrumChart(2, [{ bar: 0, beat: 1, midi: 36 }]);
  const guitar = fixtureGuitarChart(2, [
    { bar: 0, beat: 0, string: 1, fret: 3 },
  ]);
  const key = muteKeyOf(summarizeChart(vocal));
  const run = (mutes = NO_MUTES) =>
    partsLaneSchedule(
      { open: 'bass', sameFile: true, recording: false, mutes },
      bassSynthNotes(bass.notes),
      drumPlaybackHits(drums.hits),
      [
        { key: guitar.id, events: guitarSynthNotes(guitar.notes) },
        { key, events: vocalSynthNotes(vocal.notes) },
      ],
    );

  it('keys the vocal mute by its chart id', () => {
    expect(key).toBe(vocal.id);
  });

  it('plays the vocal with the bass and drums in time order', () => {
    const schedule = run();
    const times = schedule.map((e) => e.time);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    expect(schedule.filter((e) => e.key === key)).toHaveLength(4);
    expect(schedule.some((e) => e.key === 'bass')).toBe(true);
    expect(schedule.some((e) => e.key === 'drums')).toBe(true);
    expect(schedule.some((e) => e.key === guitar.id)).toBe(true);
  });

  it('muting the vocal silences only the vocal', () => {
    const schedule = run({ ...NO_MUTES, [key]: true });
    expect(schedule.some((e) => e.key === key)).toBe(false);
    expect(new Set(schedule.map((e) => e.key))).toEqual(
      new Set(['bass', 'drums', guitar.id]),
    );
  });
});
