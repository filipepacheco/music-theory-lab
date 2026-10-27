import { describe, expect, it } from 'vitest';
import { fixtureChart } from '@/domain/bassChartFixture';
import { fixtureDrumChart } from '@/domain/drumChartFixture';
import { fixtureGuitarChart } from '@/domain/guitarChartFixture';
import { guitarSynthNotes } from '@/domain/guitarPlayback';
import { bassSynthNotes } from '@/services/bassSynthTransport';
import { drumPlaybackHits } from '@/domain/drumPlaybackSchedule';
import {
  muteKeyOf,
  NO_MUTES,
  partsLaneSchedule,
} from '@/domain/songPartsPlayback';
import { summarizeChart } from '@/domain/chartSummary';

const guitar = fixtureGuitarChart(
  2,
  [
    { bar: 0, beat: 0, string: 1, fret: 3 },
    { bar: 0, beat: 0, string: 2, fret: 2 },
    { bar: 0, beat: 1, string: 4, fret: 1, techniques: ['mute'] },
    { bar: 1, beat: 0, string: 0, fret: 0 },
  ],
  { partName: 'Guitarra 1', capo: 2 },
);

describe('guitar synth notes', () => {
  it('plays the sounding pitch of each note, capo included, at its time', () => {
    const notes = guitarSynthNotes(guitar.notes);
    expect(notes.map((n) => n.midi)).toEqual(guitar.notes.map((n) => n.midi));
    expect(notes.map((n) => n.time)).toEqual(guitar.notes.map((n) => n.time));
  });

  it('keeps every note of a chord, and gives a muted note a short length', () => {
    const notes = guitarSynthNotes(guitar.notes);
    expect(notes.filter((n) => n.time === 0)).toHaveLength(2);
    expect(notes[2].seconds).toBeLessThan(notes[3].seconds);
    expect(notes.every((n) => n.seconds > 0)).toBe(true);
  });
});

describe('parts schedule with a guitar chart next to bass and drums', () => {
  const bass = fixtureChart(2, [
    { bar: 0, beat: 0, midi: 40 },
    { bar: 1, beat: 0, midi: 43 },
  ]);
  const drums = fixtureDrumChart(2, [{ bar: 0, beat: 1, midi: 36 }]);
  const key = muteKeyOf(summarizeChart(guitar));
  const input = {
    open: 'bass',
    sameFile: true,
    recording: false,
    mutes: NO_MUTES,
  };
  const run = (mutes = NO_MUTES) =>
    partsLaneSchedule(
      { ...input, mutes },
      bassSynthNotes(bass.notes),
      drumPlaybackHits(drums.hits),
      [{ key, events: guitarSynthNotes(guitar.notes) }],
    );

  it('keys the guitar mute by its chart id, not by "bass" or "drums"', () => {
    expect(key).toBe(guitar.id);
  });

  it('plays the three parts in time order on one clock', () => {
    const schedule = run();
    const times = schedule.map((event) => event.time);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    expect(new Set(schedule.map((event) => event.part))).toEqual(
      new Set(['bass', 'drums', 'lane']),
    );
    expect(schedule.filter((event) => event.key === key)).toHaveLength(4);
  });

  it('muting the guitar silences only the guitar', () => {
    const schedule = run({ ...NO_MUTES, [key]: true });
    expect(schedule.some((event) => event.key === key)).toBe(false);
    expect(schedule.some((event) => event.key === 'bass')).toBe(true);
    expect(schedule.some((event) => event.key === 'drums')).toBe(true);
  });

  it('muting bass and drums leaves the guitar', () => {
    const schedule = run({ bass: true, drums: true });
    expect(new Set(schedule.map((event) => event.key))).toEqual(
      new Set([key]),
    );
  });
});
