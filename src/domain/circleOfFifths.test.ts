import { describe, expect, it } from 'vitest';
import {
  chordCell,
  circleSteps,
  describeRootMotion,
  fifthsPosition,
  keyDegreesOnCircle,
  MAJOR_RING,
  MINOR_RING,
} from '@/domain/circleOfFifths';

describe('circle of fifths', () => {
  it('places each pitch class a fifth clockwise from the last', () => {
    expect([0, 7, 2, 9, 5, 10].map(fifthsPosition)).toEqual([
      0, 1, 2, 3, 11, 10,
    ]);
    expect(MAJOR_RING[fifthsPosition(7)]).toBe('G');
  });

  it('puts minor chords under their relative major', () => {
    // Dm sits under F; Am under C.
    expect(chordCell(2, true)).toEqual({ ring: 'minor', position: 11 });
    expect(MINOR_RING[chordCell(9, true).position]).toBe('Am');
    expect(chordCell(10, false)).toEqual({ ring: 'major', position: 10 });
  });

  it('fills one wedge with a key’s harmonic field', () => {
    const cells = keyDegreesOnCircle({ tonic: 2, mode: 'minor' }).map(
      (d) =>
        `${d.numeral} ${(d.ring === 'major' ? MAJOR_RING : MINOR_RING)[d.position]}`,
    );
    expect(cells).toEqual([
      'i Dm',
      'iiø Em',
      'III F',
      'iv Gm',
      'v Am',
      'VI Bb',
      'VII C',
    ]);
  });

  it('counts root motion in steps, a fourth up being one step back', () => {
    expect(circleSteps(7, 0)).toBe(-1); // G → C: V→I
    expect(circleSteps(0, 7)).toBe(1); // C → G
    expect(circleSteps(0, 6)).toBe(6); // a tritone is half the circle
  });

  it('describes root moves for a beginner', () => {
    const names = [
      'C',
      'Db',
      'D',
      'Eb',
      'E',
      'F',
      'Gb',
      'G',
      'Ab',
      'A',
      'Bb',
      'B',
    ];
    expect(describeRootMotion(9, 2, names)).toBe(
      'A → D: um passo anti-horário, uma quarta acima (como V→I)',
    );
    expect(describeRootMotion(10, 9, names)).toBe(
      'Bb → A: 5 passos no sentido horário',
    );
    expect(describeRootMotion(0, 6, names)).toBe(
      'C → Gb: trítono, o lado oposto do ciclo',
    );
  });
});
