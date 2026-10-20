import { describe, expect, it } from 'vitest';
import { importFormat } from '@/domain/importFormat';

describe('import filename dispatch', () => {
  it.each([
    ['song.GP', 'gp'],
    ['song.PSARC', 'rocksmith'],
    ['song.mid', 'midi'],
    ['song.MIDI', 'midi'],
    ['song.gp.zip', null],
    ['song.mp3', null],
    ['gp', null],
  ])('routes %s before reading bytes', (name, format) => {
    expect(importFormat(name)).toBe(format);
  });
});
