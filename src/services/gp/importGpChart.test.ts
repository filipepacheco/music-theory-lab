import { describe, expect, it } from 'vitest';
import { exporter, importer, midi, model, Settings } from '@coderline/alphatab';
import {
  importGpChart,
  gpChartImportErrorMessage,
} from '@/services/gp/importGpChart';
import { importMidi } from '@/services/midi/importMidi';
import { analyzeBassChart } from '@/domain/bassAnalysis';
import type { BassChart } from '@/domain/bassChart';
import {
  parseBassChart,
  parseBassChartRecord,
  parseDrumChart,
} from '@/domain/bassChartRecord';
import { withOriginalGpFingering } from '@/domain/bassFingering';
import { summarizeChart } from '@/domain/chartSummary';
import { isDrumChart, type DrumChart } from '@/domain/drumChart';
import { groupLibrarySongs } from '@/domain/librarySong';

function score(tex = '0.4.4 2.4 3.4 0.3 | 2.3.4 3.3 0.2 2.2') {
  return importer.ScoreLoader.loadAlphaTex(
    String.raw`\title "Teste" \artist "Artista" \album "Álbum" \tempo 120 \instrument 34 \tuning G2 D2 A1 E1 . ${tex}`,
  );
}

const BASS_BARS = '0.4.4 2.4 3.4 0.3 | 2.3.4 3.3 0.2 2.2';
const DRUM_BARS = ':4 (36 42) 42 (38{ac} 42) 38{g} | 37 46 44 49{hac}';

/** A score with a bass track and a percussion track. */
function bandScore(bass = BASS_BARS, drums = DRUM_BARS) {
  return importer.ScoreLoader.loadAlphaTex(
    String.raw`\title "Teste" \artist "Artista" \tempo 120
\track "Baixo" \instrument 34 \tuning (G2 D2 A1 E1) ${bass}
\track "Bateria" \instrument percussion ${drums}`,
  );
}

/** A score with a percussion track alone. */
function drumScore(drums = ':4 36 38 36 38') {
  return importer.ScoreLoader.loadAlphaTex(
    String.raw`\title "Só bateria" \artist "Artista" \tempo 120 \instrument percussion ${drums}`,
  );
}

function gp(original: model.Score): Uint8Array<ArrayBuffer> {
  return new exporter.Gp7Exporter().export(original).slice();
}

function file(bytes: Uint8Array, name = 'Teste.gp') {
  return { name, arrayBuffer: async () => bytes.slice().buffer } as Blob & {
    name: string;
  };
}

/** The import of a file with a bass part: its bass chart. */
async function importBass(source: Blob & { name: string }) {
  const { charts, audio } = await importGpChart(source);
  const chart = charts[0];
  if (!chart || isDrumChart(chart)) throw new Error('no bass chart');
  return { chart: chart as BassChart, audio };
}

async function sha256(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}

describe('Biblioteca Guitar Pro import', () => {
  it('keeps the written A-string seventh fret alongside the suggested D-string second fret', async () => {
    const result = await importBass(
      file(
        new exporter.Gp7Exporter().export(
          score('0.4.8 7.3 0.4 7.3 0.4 0.4 7.3 0.4'),
        ),
      ),
    );
    expect(result.chart.notes[1]).toMatchObject({
      midi: 40,
      string: 2,
      fret: 2,
    });
    expect(result.chart.originalFingering?.[1]).toEqual({ string: 1, fret: 7 });
    const original = withOriginalGpFingering(result.chart);
    expect(original.notes[1]).toMatchObject({ midi: 40, string: 1, fret: 7 });
    expect(original.notes.map((n) => [n.midi, n.time, n.sustain])).toEqual(
      result.chart.notes.map((n) => [n.midi, n.time, n.sustain]),
    );
    expect(analyzeBassChart(original)).toEqual(analyzeBassChart(result.chart));
    expect(parseBassChart(result.chart)).not.toBeNull();
  });

  it('preserves the score tuning rather than inferring it from the lowest note', async () => {
    const original = importer.ScoreLoader.loadAlphaTex(
      String.raw`\instrument 34 \tuning G2 D2 A1 D1 . 0.4.4 7.3 0.4 7.3`,
    );
    const { chart } = await importBass(
      file(new exporter.Gp7Exporter().export(original)),
    );
    expect(chart.tuning).toEqual([-2, 0, 0, 0]);
    expect(chart.originalFingering).toEqual([
      { string: 0, fret: 0 },
      { string: 1, fret: 7 },
      { string: 0, fret: 0 },
      { string: 1, fret: 7 },
    ]);
    expect(parseBassChart(chart)).not.toBeNull();
  });

  it('keeps original fingering aligned when a tie sustains across two bars', async () => {
    const original = score('7.3.1 | 7.3.1');
    original.tracks[0].staves[0].bars[1].voices[0].beats[0].notes[0].isTieDestination = true;
    const { chart } = await importBass(
      file(new exporter.Gp7Exporter().export(original)),
    );
    expect(chart.notes).toHaveLength(1);
    expect(chart.notes[0].sustain).toBeGreaterThan(3.9);
    expect(chart.originalFingering).toEqual([{ string: 1, fret: 7 }]);
  });

  it('does not advertise invented original positions for harmonic pitches', async () => {
    const original = score();
    const note =
      original.tracks[0].staves[0].bars[0].voices[0].beats[0].notes[0];
    note.harmonicType = model.HarmonicType.Natural;
    note.harmonicValue = 12;
    const { chart } = await importBass(
      file(new exporter.Gp7Exporter().export(original)),
    );
    expect(chart.originalFingering).toBeUndefined();
    expect(parseBassChart(chart)).not.toBeNull();
  });

  it('reuses the MIDI chart and analysis with score metadata', async () => {
    const original = score();
    const gp = await importBass(
      file(new exporter.Gp7Exporter().export(original)),
    );
    const generated = new midi.MidiFile();
    new midi.MidiFileGenerator(
      original,
      new Settings(),
      new midi.AlphaSynthMidiFileHandler(generated, true),
    ).generate();
    const equivalent = await importMidi(
      file(generated.toBinary(), 'Teste.mid'),
    );
    expect(gp.audio).toBeNull();
    expect(gp.chart).toMatchObject({
      source: 'gp',
      title: 'Teste',
      artist: 'Artista',
      album: 'Álbum',
    });
    expect(gp.chart.bars).toEqual(equivalent.chart.bars);
    expect(gp.chart.notes).toEqual(equivalent.chart.notes);
    expect(gp.chart.notes.map((note) => note.midi)).toEqual([
      28, 30, 31, 33, 35, 36, 38, 40,
    ]);
    expect(analyzeBassChart(gp.chart)).toEqual(
      analyzeBassChart(equivalent.chart),
    );
    expect(parseBassChart(gp.chart)).not.toBeNull();
    const again = await importBass(
      file(new exporter.Gp7Exporter().export(original)),
    );
    expect(again.chart.id).toBe(gp.chart.id);
  });

  it('expands repeat playback instead of stopping at written bars', async () => {
    const original = score(
      String.raw`\section "Parte A" 0.4.4 2.4 3.4 0.3 | \section "Parte B" 2.3.4 3.3 0.2 2.2`,
    );
    original.masterBars[0].isRepeatStart = true;
    original.masterBars[1].repeatCount = 2;
    const result = await importBass(
      file(new exporter.Gp7Exporter().export(original)),
    );
    expect(result.chart.bars).toHaveLength(4);
    expect(result.chart.songLengthSeconds).toBeCloseTo(8);
    expect(result.chart.notes).toHaveLength(16);
    expect(result.chart.notes[8].time).toBeCloseTo(4);
    expect(result.chart.originalFingering).toHaveLength(16);
    expect(result.chart.originalFingering?.slice(8)).toEqual(
      result.chart.originalFingering?.slice(0, 8),
    );
    expect(
      result.chart.sections.map((section) => [
        section.name,
        section.startBar,
        section.endBar,
      ]),
    ).toEqual([
      ['Parte A', 0, 1],
      ['Parte B', 1, 2],
      ['Parte A', 2, 3],
      ['Parte B', 3, 4],
    ]);
  });

  it('keeps bent bass notes on the secondary channel with the main bass part', async () => {
    const original = score();
    const note =
      original.tracks[0].staves[0].bars[0].voices[0].beats[1].notes[0];
    note.addBendPoint(new model.BendPoint(0, 0));
    note.addBendPoint(new model.BendPoint(60, 4));
    const result = await importBass(
      file(new exporter.Gp7Exporter().export(original)),
    );
    expect(result.chart.notes).toHaveLength(8);
    expect(result.chart.originalFingering).toHaveLength(8);
    expect(
      result.chart.notes.some((note) => note.techniques.includes('bend')),
    ).toBe(true);
  });

  it('keeps mixed meters and tempo changes on their own beat grid', async () => {
    const original = score(
      String.raw`\ts 3 4 0.4.4 2.4 3.4 | \ts 6 8 \tempo 60 0.3.8 2.3 3.3 0.2 2.2 3.2`,
    );
    const result = await importBass(
      file(new exporter.Gp7Exporter().export(original)),
    );
    expect(result.chart.bars.map((bar) => bar.beatCount)).toEqual([3, 6]);
    expect(result.chart.bars[1].startTime).toBeCloseTo(1.5);
    expect(result.chart.songLengthSeconds).toBeCloseTo(4.5);
    expect(result.chart.originalFingering).toHaveLength(
      result.chart.notes.length,
    );
  });

  it('rejects malformed and legacy files with a useful message', async () => {
    await expect(importGpChart(file(new Uint8Array(40)))).rejects.toMatchObject(
      { kind: 'not-a-zip' },
    );
    try {
      await importGpChart(file(new TextEncoder().encode('BCFZlegacy')));
    } catch (error) {
      expect(gpChartImportErrorMessage(error)).toContain('Guitar Pro 6');
    }
  });
});

describe('Guitar Pro import of the drum part', () => {
  it('a file with only drums imports with no error and gives one drum chart', async () => {
    const bytes = gp(drumScore());
    const { charts, audio } = await importGpChart(file(bytes, 'Bateria.gp'));
    expect(audio).toBeNull();
    expect(charts).toHaveLength(1);
    const chart = charts[0] as DrumChart;
    expect(chart).toMatchObject({
      part: 'drums',
      source: 'gp',
      sourceFileName: 'Bateria.gp',
      title: 'Só bateria',
      artist: 'Artista',
    });
    expect('tuning' in chart).toBe(false);
    expect('notes' in chart).toBe(false);
    expect(chart.hits.map((hit) => [hit.piece, hit.time])).toEqual([
      ['bumbo', 0],
      ['caixa', 0.5],
      ['bumbo', 1],
      ['caixa', 1.5],
    ]);
    expect(chart.bars).toHaveLength(1);
    expect(parseDrumChart(JSON.parse(JSON.stringify(chart)))).toEqual(chart);
  });

  it('a file with bass and drums gives two charts in one song, with no question about tracks', async () => {
    const { charts } = await importGpChart(file(gp(bandScore())));
    expect(charts.map((chart) => summarizeChart(chart).part)).toEqual([
      'bass',
      'drums',
    ]);
    const [bass, drums] = charts as [BassChart, DrumChart];
    expect(bass.notes.map((note) => note.midi)).toEqual([
      28, 30, 31, 33, 35, 36, 38, 40,
    ]);
    expect(bass.originalFingering).toHaveLength(8);
    expect(parseBassChart(bass)).not.toBeNull();
    expect(parseDrumChart(drums)).not.toBeNull();
    // One song: the two charts have one song key.
    const songs = groupLibrarySongs(charts.map(summarizeChart), []);
    expect(songs).toHaveLength(1);
    expect(songs[0].parts).toEqual(['bass', 'drums']);
    expect(songs[0].best).toEqual({ kind: 'chart', id: bass.id });
  });

  it('a file with no bass and no drums gives an error message', async () => {
    const silent = importer.ScoreLoader.loadAlphaTex(
      String.raw`\title "Silêncio" \instrument 34 \tuning (G2 D2 A1 E1) r.1 | r.1`,
    );
    const failure = await importGpChart(file(gp(silent))).catch(
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(Error);
    expect(gpChartImportErrorMessage(failure)).toBe(
      'Este arquivo Guitar Pro não tem baixo nem bateria.',
    );
  });

  it('keeps the file hash as the id of the bass chart, and gives the drum chart a hash of the file hash and the part name', async () => {
    const bytes = gp(bandScore());
    const fileHash = await sha256(bytes);
    const { charts } = await importGpChart(file(bytes));
    expect(charts[0].id).toBe(fileHash);
    expect(charts[1].id).toBe(
      await sha256(new TextEncoder().encode(`${fileHash}:drums`)),
    );
    expect(charts[1].id).toMatch(/^[a-f0-9]{64}$/);
    expect(charts[1].id).not.toBe(fileHash);
    // A file with only drums: the id of its chart is not the file hash.
    const alone = gp(drumScore());
    const only = await importGpChart(file(alone));
    expect(only.charts[0].id).toBe(
      await sha256(new TextEncoder().encode(`${await sha256(alone)}:drums`)),
    );
  });

  it('a new import of a file gives the same charts again, so the library adds only the part that it lacks', async () => {
    const bytes = gp(bandScore());
    const first = await importGpChart(
      file(bytes),
      new Date('2026-10-01T10:00:00.000Z'),
    );
    const second = await importGpChart(
      file(bytes),
      new Date('2026-10-12T10:00:00.000Z'),
    );
    expect(second.charts.map((chart) => chart.id)).toEqual(
      first.charts.map((chart) => chart.id),
    );
    expect(
      second.charts.map((chart) => ({ ...chart, importedAt: '' })),
    ).toEqual(first.charts.map((chart) => ({ ...chart, importedAt: '' })));
  });

  it('each hit holds its time, bar, position in the bar, drum piece, articulation, intensity, and MIDI number', async () => {
    const { charts } = await importGpChart(file(gp(bandScore())));
    const drums = charts[1] as DrumChart;
    expect(
      drums.hits.map((hit) => [
        hit.time,
        hit.bar,
        hit.beatInBar,
        hit.piece,
        hit.articulation,
        hit.dynamic,
        hit.midi,
      ]),
    ).toEqual([
      [0, 0, 0, 'bumbo', 'normal', 'normal', 36],
      [0, 0, 0, 'chimbal', 'closed', 'normal', 42],
      [0.5, 0, 1, 'chimbal', 'closed', 'normal', 42],
      [1, 0, 2, 'caixa', 'normal', 'accent', 38],
      [1, 0, 2, 'chimbal', 'closed', 'normal', 42],
      [1.5, 0, 3, 'caixa', 'normal', 'ghost', 38],
      [2, 1, 0, 'caixa', 'crossStick', 'normal', 37],
      [2.5, 1, 1, 'chimbal', 'open', 'normal', 46],
      [3, 1, 2, 'chimbal', 'pedal', 'normal', 44],
      [3.5, 1, 3, 'pratoAtaque', 'normal', 'accent', 49],
    ]);
    for (const hit of drums.hits) {
      expect(Object.keys(hit).sort()).toEqual([
        'articulation',
        'bar',
        'beatInBar',
        'dynamic',
        'intensity',
        'midi',
        'piece',
        'time',
      ]);
      expect(hit.intensity).toBeGreaterThanOrEqual(1);
      expect(hit.intensity).toBeLessThanOrEqual(127);
    }
  });

  it('takes the ghost note and the accent of a hit from the score, not from the intensity', async () => {
    // A ghost note in a loud passage, then plain notes and an accent in a
    // soft passage.
    const original = drumScore(':4 38{g} 38 38 38{ac}');
    const beats = original.tracks[0].staves[0].bars[0].voices[0].beats;
    beats[0].dynamics = model.DynamicValue.FFF;
    beats[1].dynamics = model.DynamicValue.FFF;
    beats[2].dynamics = model.DynamicValue.PPP;
    beats[3].dynamics = model.DynamicValue.PPP;
    for (const beat of beats) {
      for (const note of beat.notes) note.dynamics = beat.dynamics;
    }
    const { charts } = await importGpChart(file(gp(original)));
    const [ghost, loud, soft, accent] = (charts[0] as DrumChart).hits;
    expect([ghost, loud, soft, accent].map((hit) => hit.dynamic)).toEqual([
      'ghost',
      'normal',
      'normal',
      'accent',
    ]);
    // The export only moves the intensity one step from the passage.
    expect(ghost.intensity).toBeLessThan(loud.intensity);
    expect(accent.intensity).toBeGreaterThan(soft.intensity);
    // So the intensity alone gives the wrong answer for the two hits.
    expect(ghost.intensity).toBeGreaterThan(accent.intensity);
    expect(ghost.intensity).toBeGreaterThan(soft.intensity);
  });

  it('gives the drum chart and the bass chart of one file the same bars and sections, with repeats and tempo changes', async () => {
    const original = bandScore(
      String.raw`\section "Parte A" 0.4.4 2.4 3.4 0.3 | \section "Parte B" \tempo 60 2.3.4 3.3 0.2 2.2`,
      ':4 36 38 36 38 | 36 38 36 38',
    );
    original.masterBars[0].isRepeatStart = true;
    original.masterBars[1].repeatCount = 2;
    const { charts } = await importGpChart(file(gp(original)));
    const [bass, drums] = charts as [BassChart, DrumChart];
    expect(drums.bars).toEqual(bass.bars);
    expect(drums.sections).toEqual(bass.sections);
    expect(drums.songLengthSeconds).toBe(bass.songLengthSeconds);
    expect(drums.averageTempoBpm).toBe(bass.averageTempoBpm);
    // The repeat plays the two bars two times: 2 s at 120 bpm, 4 s at 60.
    expect(drums.bars.map((bar) => [bar.startTime, bar.endTime])).toEqual([
      [0, 2],
      [2, 6],
      [6, 8],
      [8, 12],
    ]);
    expect(
      drums.sections.map((section) => [section.name, section.startBar]),
    ).toEqual([
      ['Parte A', 0],
      ['Parte B', 1],
      ['Parte A', 2],
      ['Parte B', 3],
    ]);
    expect(drums.hits).toHaveLength(16);
    expect(drums.hits.map((hit) => hit.bar)).toEqual(
      [0, 1, 2, 3].flatMap((bar) => [bar, bar, bar, bar]),
    );
    // The bass note and the drum hit of one beat have one time.
    expect(drums.hits.map((hit) => hit.time)).toEqual(
      bass.notes.map((note) => note.time),
    );
    expect(drums.hits[4]).toMatchObject({ time: 2, bar: 1, beatInBar: 0 });
    expect(drums.hits[5]).toMatchObject({ time: 3, bar: 1, beatInBar: 1 });
  });

  it('makes one drum chart of all percussion tracks of a file', async () => {
    const original = importer.ScoreLoader.loadAlphaTex(
      String.raw`\title "Duas baterias" \tempo 120
\track "Bateria" \instrument percussion :4 36 38 36 38
\track "Percussão" \instrument percussion :4 42 42 42 42`,
    );
    const { charts } = await importGpChart(file(gp(original)));
    expect(charts).toHaveLength(1);
    expect((charts[0] as DrumChart).hits.map((hit) => hit.midi)).toEqual([
      36, 42, 38, 42, 36, 42, 38, 42,
    ]);
  });

  it('gives charts that the record check of the chart route accepts', async () => {
    const { charts } = await importGpChart(file(gp(bandScore())));
    for (const chart of charts) {
      const record = {
        id: chart.id,
        updatedAt: '2026-10-12T10:00:00.000Z',
        chart: JSON.parse(JSON.stringify(chart)),
      };
      expect(parseBassChartRecord(record)?.chart).toEqual(chart);
    }
  });
});
