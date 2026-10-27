import { describe, expect, it } from 'vitest';
import { exporter, importer } from '@coderline/alphatab';
import {
  parseBassChartRecord,
  parseChart,
  parseVocalChart,
} from '@/domain/bassChartRecord';
import { isBassChart, isDrumChart, type Chart } from '@/domain/drumChart';
import { isGuitarChart } from '@/domain/guitarChart';
import { isVocalChart, type VocalChart } from '@/domain/vocalChart';
import { partChartId } from '@/services/chartId';
import { importGpChart } from '@/services/gp/importGpChart';

const SIX = 'E4 B3 G3 D3 A2 E2';
const BASS_BARS = '0.4.4 2.4 3.4 0.3 | 2.3.4 3.3 0.2 2.2';
const DRUM_BARS = ':4 (36 42) 42 (38{ac} 42) 38{g} | 37 46 44 49{hac}';
const RIFF = ':4 3.6 5.5 7.4 0.3 | 0.2 0.1 3.2 5.1';
const MELODY = ':4 c4 d4 e4 f4 | g4 a4 b4 c5';
const LYRICS = '\\lyrics "Hel-lo wor-ld a-ma-zing day"';

function gp(tex: string): Uint8Array<ArrayBuffer> {
  const score = importer.ScoreLoader.loadAlphaTex(
    String.raw`\title "Teste" \artist "Artista" \tempo 120 ${tex}`,
  );
  return new exporter.Gp7Exporter().export(score).slice();
}

function file(bytes: Uint8Array, name = 'Teste.gp') {
  return { name, arrayBuffer: async () => bytes.slice().buffer } as Blob & {
    name: string;
  };
}

async function sha256(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}

async function vocals(tex: string): Promise<VocalChart[]> {
  const { charts } = await importGpChart(file(gp(tex)));
  return charts.filter(isVocalChart);
}

const vocalTrack = (name: string, notes = MELODY, lyrics = LYRICS, program = 53) =>
  String.raw`\track "${name}" \instrument ${program} ${lyrics} ${notes}`;

const guitarTrack = (name: string) =>
  String.raw`\track "${name}" \instrument 25 \tuning (${SIX}) ${RIFF}`;

const bassTrack = String.raw`\track "Baixo" \instrument 34 \tuning (G2 D2 A1 E1) ${BASS_BARS}`;
const drumTrack = String.raw`\track "Bateria" \instrument percussion ${DRUM_BARS}`;

const kind = (chart: Chart) => ('part' in chart ? chart.part : 'bass');

describe('Guitar Pro import of vocal tracks', () => {
  it('gives one vocal chart for a track by program and one by name, with their part names', async () => {
    const charts = await vocals(
      [
        vocalTrack('Voz principal', MELODY, LYRICS, 53),
        vocalTrack('Coro', MELODY, LYRICS, 54),
        vocalTrack('Backing Vocal', MELODY, LYRICS, 25),
        String.raw`\track "Lead voice" \instrument 1 ${MELODY}`,
        String.raw`\track "Piano" \instrument 1 ${MELODY}`,
      ].join('\n'),
    );
    expect(charts.map((c) => c.partName)).toEqual([
      'Voz principal',
      'Coro',
      'Backing Vocal',
      'Lead voice',
    ]);
    expect(charts.map((c) => c.trackIndex)).toEqual([0, 1, 2, 3]);
    expect(new Set(charts.map((c) => c.id)).size).toBe(4);
    expect(charts.every((c) => c.part === 'vocals' && c.source === 'gp')).toBe(
      true,
    );
  });

  it('detects a vocal track by program 55 alone, whatever its name', async () => {
    const charts = await vocals(vocalTrack('Orquestra', MELODY, LYRICS, 55));
    expect(charts.map((c) => c.partName)).toEqual(['Orquestra']);
  });

  it('keeps the pitch, the time, and the lyric syllable of each note', async () => {
    const [chart] = await vocals(vocalTrack('Voz'));
    expect(chart.notes.map((n) => n.midi)).toEqual([
      60, 62, 64, 65, 67, 69, 71, 72,
    ]);
    expect(chart.notes.map((n) => n.time)).toEqual(
      [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].map((t) => expect.closeTo(t, 3)),
    );
    expect(chart.notes.map((n) => [n.bar, n.beatInBar])).toEqual([
      [0, 0],
      [0, 1],
      [0, 2],
      [0, 3],
      [1, 0],
      [1, 1],
      [1, 2],
      [1, 3],
    ]);
    expect(chart.notes.map((n) => n.lyric)).toEqual([
      'Hel-',
      'lo',
      'wor-',
      'ld',
      'a-',
      'ma-',
      'zing',
      'day',
    ]);
    expect(chart.notes[0].endTime).toBeGreaterThan(chart.notes[0].time);
    expect(chart.averageTempoBpm).toBeCloseTo(120, 0);
  });

  it('imports a vocal track with no lyrics with the melody only', async () => {
    const [chart] = await vocals(vocalTrack('Voz', MELODY, ''));
    expect(chart.notes).toHaveLength(8);
    expect(chart.notes.every((n) => n.lyric === null)).toBe(true);
    expect(parseChart(chart)).toEqual(chart);
  });

  it('gives a note without a syllable a null lyric, between sung notes', async () => {
    const [chart] = await vocals(
      vocalTrack('Voz', ':4 c4 d4 e4 f4', '\\lyrics "one two"'),
    );
    expect(chart.notes.map((n) => n.lyric)).toEqual(['one', 'two', null, null]);
  });

  it('keeps both notes that sound at once', async () => {
    const [chart] = await vocals(
      vocalTrack('Duo', ':4 (c4 e4) g4 (d4 f4 a4) c5', '\\lyrics "la la la la"'),
    );
    const first = chart.notes.filter((n) => n.beatInBar === 0);
    expect(first.map((n) => n.midi)).toEqual([60, 64]);
    expect(new Set(first.map((n) => n.time)).size).toBe(1);
    expect(first.map((n) => n.lyric)).toEqual(['la', 'la']);
    expect(chart.notes.filter((n) => n.beatInBar === 2)).toHaveLength(3);
    expect(chart.notes).toHaveLength(7);
    expect(parseChart(chart)).not.toBeNull();
  });

  it('imports a file with a vocal track and no bass or drums', async () => {
    const bytes = gp(vocalTrack('Só voz'));
    const { charts, audio } = await importGpChart(file(bytes));
    expect(audio).toBeNull();
    expect(charts).toHaveLength(1);
    expect(isVocalChart(charts[0])).toBe(true);
    expect(isBassChart(charts[0])).toBe(false);
  });

  it('does not take a vocal track for the bass, and keeps the real bass', async () => {
    const { charts } = await importGpChart(
      file(gp([vocalTrack('Voz'), bassTrack].join('\n'))),
    );
    expect(charts.map(kind)).toEqual(['bass', 'vocals']);
    expect(charts.find(isBassChart)!.notes).toHaveLength(8);
  });

  it('gives a vocal chart, not a guitar chart, for a six-string track that names a voice', async () => {
    const { charts } = await importGpChart(
      file(
        gp(
          String.raw`\track "Voz de guitarra" \instrument 25 \tuning (${SIX}) ${RIFF}`,
        ),
      ),
    );
    expect(charts.map(kind)).toEqual(['vocals']);
  });

  it('gives bass, drums, guitar, vocals in that order, with the part names of the tracks', async () => {
    const bytes = gp(
      [
        vocalTrack('Voz', MELODY),
        guitarTrack('Guitarra 1 - Rhythm'),
        drumTrack,
        guitarTrack('Guitarra 2 - Lead'),
        bassTrack,
      ].join('\n'),
    );
    const { charts } = await importGpChart(file(bytes));
    expect(charts.map(kind)).toEqual([
      'bass',
      'drums',
      'guitar',
      'guitar',
      'vocals',
    ]);
    expect(charts.filter(isGuitarChart).map((c) => c.partName)).toEqual([
      'Guitarra 1 - Rhythm',
      'Guitarra 2 - Lead',
    ]);
    expect(charts.filter(isVocalChart).map((c) => c.partName)).toEqual(['Voz']);
    expect(charts.some(isDrumChart)).toBe(true);
    const hash = await sha256(bytes);
    expect(charts.filter(isVocalChart)[0].id).toBe(
      await partChartId(hash, 'vocals', 0),
    );
  });

  it('keeps the bass chart and the drum chart ids when a vocal joins the file', async () => {
    const bytes = gp([bassTrack, drumTrack, vocalTrack('Voz')].join('\n'));
    const hash = await sha256(bytes);
    const { charts } = await importGpChart(file(bytes));
    expect(charts.find(isBassChart)!.id).toBe(hash);
    expect(charts.find(isDrumChart)!.id).toBe(await partChartId(hash, 'drums'));
  });

  it('gives a vocal chart that the shared parser accepts, in a record', async () => {
    const [chart] = await vocals(vocalTrack('Voz'));
    expect(parseChart(chart)).toEqual(chart);
    expect(
      parseBassChartRecord({
        id: chart.id,
        updatedAt: '2026-10-05T10:00:00.000Z',
        chart,
      })?.chart,
    ).toEqual(chart);
  });

  it('makes the shared parser reject a malformed vocal chart built from alphaTex', async () => {
    const [chart] = await vocals(vocalTrack('Voz'));
    const note = chart.notes[0];
    const bad: unknown[] = [
      { ...chart, partName: 3 },
      { ...chart, trackIndex: -1 },
      { ...chart, source: 'midi' },
      { ...chart, strings: 6 },
      { ...chart, audio: 'binary' },
      { ...chart, notes: [] },
      { ...chart, notes: [{ ...note, midi: 130 }] },
      { ...chart, notes: [{ ...note, midi: 60.5 }] },
      { ...chart, notes: [{ ...note, lyric: 4 }] },
      { ...chart, notes: [{ ...note, lyric: 'x'.repeat(201) }] },
      { ...chart, notes: [{ ...note, string: 1 }] },
      { ...chart, notes: [{ ...note, bar: 99 }] },
      { ...chart, notes: [{ ...note, endTime: note.time - 1 }] },
      { ...chart, notes: [chart.notes[2], chart.notes[0]] },
      { ...chart, bars: [] },
    ];
    for (const value of bad) {
      expect(parseVocalChart(value)).toBeNull();
      expect(parseChart(value)).toBeNull();
    }
  });
});
