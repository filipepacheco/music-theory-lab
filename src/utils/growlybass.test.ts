import { describe, expect, it } from 'vitest';
import { resolveGrowlybassSample, toBassMidi } from '@/utils/growlybass';

describe('Growlybass sample contract', () => {
  it.each([
    [0, 1, 'pp'],
    [60 / 127, 60, 'pp'],
    [61 / 127, 61, 'p'],
    [95 / 127, 95, 'p'],
    [96 / 127, 96, 'f'],
    [120 / 127, 120, 'f'],
    [121 / 127, 121, 'ff'],
    [1, 127, 'ff'],
  ] as const)(
    'maps normalized velocity %s to MIDI %s and layer %s',
    (velocity, midiVelocity, layer) => {
      expect(resolveGrowlybassSample(28, velocity)).toMatchObject({
        midiVelocity,
        layer,
      });
    },
  );

  it('uses the p layer for the neutral default velocity', () => {
    expect(resolveGrowlybassSample(28)).toMatchObject({
      file: 'e2_p_rr1.mp3',
      layer: 'p',
    });
  });

  it.each([
    [28, 'e2', 0],
    [29, 'e2', 1],
    [31, 'gb2', 1],
    [35, 'c3', -1],
    [55, 'gb4', 1],
  ] as const)(
    'maps MIDI %s to nearest anchor %s within two semitones',
    (midi, anchor, semitones) => {
      expect(resolveGrowlybassSample(midi)).toMatchObject({
        anchor,
        semitones,
      });
    },
  );

  it('maps native bass note indices and octaves to sounding MIDI', () => {
    expect(toBassMidi(4, 1)).toBe(28);
    expect(toBassMidi(9, 1)).toBe(33);
    expect(toBassMidi(2, 2)).toBe(38);
    expect(toBassMidi(7, 3)).toBe(55);
  });
});
