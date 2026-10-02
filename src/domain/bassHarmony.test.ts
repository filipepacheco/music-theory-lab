import { describe, expect, it } from 'vitest';
import { analyzeBassChart } from '@/domain/bassAnalysis';
import type { BassChartSection } from '@/domain/bassChart';
import {
  fixtureChart,
  walking,
  type NoteSpec,
} from '@/domain/bassChartFixture';
import {
  analyzeHarmony,
  barChordTones,
  describeKeyEvidence,
  fieldChords,
  keyLabel,
  keyNoteNames,
  repeatingCycle,
  suggestKeys,
  type HarmonyAnalysis,
  type MusicalKey,
} from '@/domain/bassHarmony';

// MIDI pitches in the bass register (C2 = 36).
const D2 = 38;
const E2 = 40;
const F2 = 41;
const G2 = 43;
const GS2 = 44;
const A2 = 45;
const BB2 = 46;
const B2 = 47;
const C3 = 48;
const CS3 = 49;
const D3 = 50;
const EB3 = 51;
const E3 = 52;
const F3 = 53;
const G3 = 55;
const AB3 = 56;
const BB3 = 58;
const B3 = 59;

/** Root, third, fifth and seventh of common chords, as walking bars. */
const Dm7 = [D2, F2, A2, C3];
const G7 = [G2, B2, D3, F3];
const Cmaj7 = [C3, E3, G3, B3];
const C = [C3, E3, G3, E3];
const A7 = [A2, CS3, E3, G3];
const Am = [A2, C3, E3, C3];
const F = [F2, A2, C3, A2];
const G = [G2, B2, D3, B2];
const E7 = [E2, GS2, B2, D3];
const Bb = [BB2, D3, F3, D3];

/** Root and fifth only: the bass never says major or minor. */
const D5 = [D2, A2, D2, A2];
const G5 = [G2, D3, G2, D3];
const Bb5 = [BB2, F3, BB2, F3];
const A5 = [A2, E3, A2, E3];
const E5 = [E2, B2, E2, B2];

const C_MAJOR: MusicalKey = { tonic: 0, mode: 'major' };
const A_MINOR: MusicalKey = { tonic: 9, mode: 'minor' };
const D_MINOR: MusicalKey = { tonic: 2, mode: 'minor' };

function analyze(
  barNotes: number[][],
  key: MusicalKey,
  sections?: BassChartSection[],
  extra: NoteSpec[] = [],
): HarmonyAnalysis {
  const chart = fixtureChart(
    barNotes.length,
    [...walking(barNotes), ...extra],
    sections,
  );
  return analyzeHarmony(chart, analyzeBassChart(chart), key);
}

function numerals(analysis: HarmonyAnalysis): string[] {
  return analysis.segments.map((s) => s.harmony.numeral);
}

function eventLabels(analysis: HarmonyAnalysis): string[] {
  return analysis.events.map((e) => e.label);
}

describe('suggestKeys', () => {
  it('prefers the key the bass resolves to over the relative minor', () => {
    const chart = fixtureChart(
      8,
      walking([Dm7, G7, Cmaj7, A7, Dm7, G7, Cmaj7, C]),
    );
    const [best] = suggestKeys(chart, analyzeBassChart(chart));
    expect(best).toMatchObject({ tonic: 0, mode: 'major' });
    expect(best.evidence.dominantArrivals).toBe(2);
    expect(best.evidence.endsOnTonic).toBe(true);
    expect(describeKeyEvidence(best)).toBe(
      '38% dos compassos em C · 100% das seções terminam em C · ' +
        '2 chegadas do 5º grau à tônica · última nota em C · 97% das notas na escala',
    );
  });

  it('reads a minor key from the third over the tonic', () => {
    const chart = fixtureChart(5, walking([Am, [G2, B2, D3, B2], F, E7, Am]));
    const [best] = suggestKeys(chart, analyzeBassChart(chart));
    expect(best).toMatchObject({ tonic: 9, mode: 'minor' });
  });

  it('does not take a rarely heard final note as the tonic', () => {
    // Ten bars around C, then one stray E (9% of bars) to end on.
    const chart = fixtureChart(
      11,
      walking([C, Dm7, G7, C, F, G7, C, Am, Dm7, G7, [E2]]),
    );
    const suggestions = suggestKeys(chart, analyzeBassChart(chart));
    expect(suggestions[0]).toMatchObject({ tonic: 0, mode: 'major' });
    expect(suggestions.map((s) => s.tonic)).not.toContain(4);
  });

  it('suggests nothing for a chart without pitched notes', () => {
    const chart = fixtureChart(1, [
      { bar: 0, beat: 0, string: 0, fret: 3, techniques: ['mute'] },
    ]);
    expect(suggestKeys(chart, analyzeBassChart(chart))).toEqual([]);
  });
});

describe('analyzeHarmony', () => {
  it('reads degrees, functions and a ii–V–I with a secondary dominant', () => {
    const analysis = analyze([Dm7, G7, Cmaj7, A7, Dm7, G7, Cmaj7, C], C_MAJOR);
    expect(numerals(analysis)).toEqual([
      'ii',
      'V',
      'I',
      'V7/ii',
      'ii',
      'V',
      'I',
    ]);
    expect(analysis.segments.map((s) => s.harmony.func)).toEqual([
      'SD',
      'D',
      'T',
      'D',
      'SD',
      'D',
      'T',
    ]);
    expect(analysis.segments[3].harmony.detail).toBe(
      'Dominante secundária de ii',
    );
    // The last two bars hold one chord.
    expect(analysis.segments[6]).toMatchObject({ startBar: 6, endBar: 8 });
    expect(analysis.barSegments).toEqual([0, 1, 2, 3, 4, 5, 6, 6]);
    expect(eventLabels(analysis)).toEqual([
      'ii–V–I',
      'Turnaround de jazz (I–vi–ii–V)',
      'ii–V–I',
    ]);
  });

  it('keeps the field quality when the bass plays no third', () => {
    const analysis = analyze([[A2, E3, A2, E3]], C_MAJOR);
    expect(analysis.segments[0].harmony).toMatchObject({
      numeral: 'vi',
      kind: 'diatonic',
      confirmed: false,
    });
  });

  it('names borrowed chords, passing diminished chords and SubV', () => {
    const analysis = analyze(
      [C, Bb, F, C, [CS3, E3, G3, BB3], Dm7, G7, C, [CS3, F3, AB3, B3], C],
      C_MAJOR,
    );
    expect(numerals(analysis)).toEqual([
      'I',
      'bVII',
      'IV',
      'I',
      '#i°7',
      'ii',
      'V',
      'I',
      'SubV7',
      'I',
    ]);
    expect(analysis.segments[1].harmony).toMatchObject({
      kind: 'borrowed',
      func: 'SD',
      detail: 'Empréstimo modal (menor natural / mixolídio) · Subdominante',
    });
    expect(analysis.segments[4].harmony).toMatchObject({
      kind: 'passingDiminished',
      func: 'D',
      detail: 'Diminuto de passagem ascendente',
    });
    expect(analysis.segments[8].harmony.kind).toBe('subV');
    expect(eventLabels(analysis)).toEqual([
      'Rock modal (I–bVII–IV)',
      'Cadência plagal (IV→I)',
      'ii–V–I',
    ]);
  });

  it('reads the minor iv borrowed in a major key', () => {
    const analysis = analyze([C, [F2, AB3, C3, AB3], C], C_MAJOR);
    expect(numerals(analysis)).toEqual(['I', 'iv', 'I']);
  });

  it('takes V7 from the harmonic minor and finds the Andalusian cadence', () => {
    const analysis = analyze([Am, [G2, B2, D3, B2], F, E7, Am], A_MINOR);
    expect(numerals(analysis)).toEqual(['i', 'VII', 'VI', 'V7', 'i']);
    expect(analysis.segments[3].harmony.detail).toBe(
      'Dominante · V da menor harmônica',
    );
    expect(eventLabels(analysis)).toEqual([
      'Cadência andaluza (i–bVII–bVI–V)',
      'Baixo b6→5: cadência frígia (iv6→V) ou sexta aumentada',
      'Cadência autêntica (V7→i)',
    ]);
  });

  it('calls v→i modal, not authentic, when the bass plays no leading tone', () => {
    // i–iv–VI–v ×2 in D minor on roots and fifths, then home.
    const bars = [D5, G5, Bb5, A5, D5, G5, Bb5, A5, D5];
    const chart = fixtureChart(bars.length, walking(bars));
    const [best] = suggestKeys(chart, analyzeBassChart(chart));
    expect(best).toMatchObject({ tonic: 2, mode: 'minor' });

    const analysis = analyze(bars, D_MINOR);
    expect(numerals(analysis)).toEqual([
      'i',
      'iv',
      'VI',
      'v',
      'i',
      'iv',
      'VI',
      'v',
      'i',
    ]);
    // No Phrygian / augmented-sixth reading: VI→v is a step, not a cadence.
    expect(eventLabels(analysis)).toEqual([
      'Cadência modal (v→i, sem sensível)',
      'Cadência modal (v→i, sem sensível)',
    ]);
  });

  it('needs a played major V for minor-key cadences that resolve on V', () => {
    expect(eventLabels(analyze([Am, E5, F], A_MINOR))).toEqual([]);
    expect(eventLabels(analyze([Am, E7, F], A_MINOR))).toEqual([
      'Cadência deceptiva (V7→VI)',
    ]);
    expect(eventLabels(analyze([Am, F, E7, Am], A_MINOR))).toEqual([
      'Baixo b6→5: cadência frígia (iv6→V) ou sexta aumentada',
      'Cadência autêntica (V7→i)',
    ]);
  });

  it('finds deceptive and half cadences', () => {
    const deceptive = analyze([C, G7, Am], C_MAJOR);
    expect(eventLabels(deceptive)).toEqual(['Cadência deceptiva (V→vi)']);

    const half = analyze([C, G, F, C], C_MAJOR, [
      { name: 'verse', parts: 1, startBar: 0, endBar: 2 },
      { name: 'chorus', parts: 1, startBar: 2, endBar: 4 },
    ]);
    expect(eventLabels(half)).toEqual([
      'Semicadência (→V)',
      'Cadência plagal (IV→I)',
    ]);
  });

  it('counts a repeated progression once', () => {
    const analysis = analyze([C, G, Am, F, C, G, Am, F], C_MAJOR);
    expect(eventLabels(analysis)).toEqual(['Pop/Punk (I–V–vi–IV) ×2']);
  });

  it('recognises a 12-bar blues', () => {
    const C7 = [C3, E3, G3, BB3];
    const F7 = [F2, A2, C3, EB3];
    const analysis = analyze(
      [C7, C7, C7, C7, F7, F7, C7, C7, G7, F7, C7, G7],
      C_MAJOR,
    );
    expect(analysis.events.map((e) => e.kind)).toContain('blues');
    const blues = analysis.events.find((e) => e.kind === 'blues');
    expect(blues).toMatchObject({ startBar: 0, endBar: 12 });
    // I7 resolving to IV reads as its secondary dominant (§6.2 rule 2).
    expect(numerals(analysis)[0]).toBe('V7/IV');
  });

  it('flags prominent avoid notes, and the 13 of ii only before V', () => {
    // F on beat 3 over C: the 11, a b9 above the major third.
    const avoidOnI = analyze([[C3, E3, F3, G3], Am], C_MAJOR);
    expect([...avoidOnI.avoidNotes]).toEqual([2]);

    // B on beat 3 over Dm: the 13 is avoided in a ii–V only.
    const iiV = analyze([[D2, F2, B2, A2], G7], C_MAJOR);
    expect([...iiV.avoidNotes]).toEqual([2]);
    const iiAlone = analyze([[D2, F2, B2, A2], C], C_MAJOR);
    expect(iiAlone.avoidNotes.size).toBe(0);
  });
});

describe('keyLabel', () => {
  it('names keys with the conventional flat spellings', () => {
    expect(keyLabel({ tonic: 10, mode: 'major' })).toBe('Bb maior');
    expect(keyLabel({ tonic: 9, mode: 'minor' })).toBe('A menor');
  });
});

describe('repeatingCycle', () => {
  const same = (a: string, b: string) => a === b;
  it('finds the shortest exact repetition', () => {
    expect(
      repeatingCycle(['I', 'V', 'vi', 'IV', 'I', 'V', 'vi', 'IV'], same),
    ).toEqual({ cycle: ['I', 'V', 'vi', 'IV'], repeats: 2 });
    expect(repeatingCycle(['I', 'I', 'I'], same)).toEqual({
      cycle: ['I'],
      repeats: 3,
    });
  });

  it('keeps a sequence that does not repeat whole', () => {
    expect(repeatingCycle(['I', 'V', 'I'], same)).toEqual({
      cycle: ['I', 'V', 'I'],
      repeats: 1,
    });
    expect(repeatingCycle([], same)).toEqual({ cycle: [], repeats: 1 });
  });
});

describe('keyNoteNames and fieldChords', () => {
  it('spells minor keys with their relative major’s accidentals', () => {
    expect(keyNoteNames(D_MINOR)[10]).toBe('Bb');
    expect(keyNoteNames({ tonic: 4, mode: 'minor' })[6]).toBe('F#');
    expect(keyNoteNames(C_MAJOR)[10]).toBe('A#');
  });

  it('lists the harmonic field of D minor', () => {
    expect(fieldChords(D_MINOR).map((c) => `${c.numeral} ${c.name}`)).toEqual([
      'i Dm7',
      'iiø Em7(b5)',
      'III Fmaj7',
      'iv Gm7',
      'v Am7',
      'VI Bbmaj7',
      'VII C7',
    ]);
  });
});

describe('barChordTones', () => {
  function tones(barNotes: number[][], key: MusicalKey, bar = 0) {
    const chart = fixtureChart(barNotes.length, walking(barNotes));
    const bars = analyzeBassChart(chart);
    const analysis = analyzeHarmony(chart, bars, key);
    const segment = analysis.segments[analysis.barSegments[bar]] ?? null;
    return barChordTones(bars[bar], segment).map(
      (t) => `${t.label}${t.played ? '' : '?'}`,
    );
  }

  it('fills the chord from the key when the bass plays only the root', () => {
    // i in D minor is Dm7: the b3, 5 and b7 are implied, not played.
    expect(tones([D5, A5, D5], D_MINOR)).toEqual(['R', 'b3?', '5', 'b7?']);
  });

  it('prefers what the bass played over the key', () => {
    // Two bars of D read as ii in C major (min7). The second bar plays F#:
    // its played major third wins over the b3 the reading implies.
    const FS2 = 42;
    expect(
      tones([[D2, F2, A2, F2], [D2, FS2, A2, FS2], G7], C_MAJOR, 1),
    ).toEqual(['R', '3', '5', 'b7?']);
  });

  it('adds the tensions the bass played', () => {
    // F# on beat 3 over C major: the #11.
    expect(tones([[C3, E3, 54, G3]], C_MAJOR)).toEqual([
      'R',
      '3',
      '5',
      '7?',
      '#11',
    ]);
  });

  it('uses only the played notes without a key', () => {
    const chart = fixtureChart(1, walking([D5]));
    const [bar] = analyzeBassChart(chart);
    expect(barChordTones(bar, null).map((t) => t.label)).toEqual(['R', '5']);
  });
});
