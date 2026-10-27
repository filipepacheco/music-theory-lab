import { describe, expect, it } from 'vitest';
import { exporter, importer } from '@coderline/alphatab';
import { parseBassChartRecord, parseChart } from '@/domain/bassChartRecord';
import { isBassChart, type Chart } from '@/domain/drumChart';
import { isGuitarChart, type GuitarChart } from '@/domain/guitarChart';
import { partChartId } from '@/services/chartId';
import { importGpChart } from '@/services/gp/importGpChart';

const SIX = 'E4 B3 G3 D3 A2 E2';
const SEVEN = 'E4 B3 G3 D3 A2 E2 B1';
const TWELVE = 'E5 B4 G4 E4 D4 B3 G3 D3 A2 F2 E2 B1';
const BASS_BARS = '0.4.4 2.4 3.4 0.3 | 2.3.4 3.3 0.2 2.2';
const DRUM_BARS = ':4 (36 42) 42 (38{ac} 42) 38{g} | 37 46 44 49{hac}';

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

async function guitars(tex: string): Promise<GuitarChart[]> {
  const { charts } = await importGpChart(file(gp(tex)));
  return charts.filter(isGuitarChart);
}

const guitarTrack = (
  name: string,
  notes: string,
  tuning = SIX,
  extra = '',
  program = 25,
) =>
  String.raw`\track "${name}" \instrument ${program} \tuning (${tuning}) ${extra} ${notes}`;

const RIFF = ':4 3.6 5.5 7.4 0.3 | 0.2 0.1 3.2 5.1';

describe('Guitar Pro import of guitar tracks', () => {
  it('gives one guitar chart for each guitar track, with its part name, in the track order', async () => {
    const charts = await guitars(
      [
        guitarTrack('Guitarra 1 - Rhythm', RIFF),
        guitarTrack(
          'Guitarra 2 - Lead',
          ':4 12.1 15.1 12.2 10.2 | 0.1 0.1 0.1 0.1',
          SIX,
          '',
          27,
        ),
      ].join('\n'),
    );
    expect(charts.map((c) => c.partName)).toEqual([
      'Guitarra 1 - Rhythm',
      'Guitarra 2 - Lead',
    ]);
    expect(charts.map((c) => c.trackIndex)).toEqual([0, 1]);
    expect(new Set(charts.map((c) => c.id)).size).toBe(2);
    expect(charts.every((c) => c.part === 'guitar' && c.source === 'gp')).toBe(
      true,
    );
    expect(charts[0].notes).toHaveLength(8);
    expect(charts[1].notes).toHaveLength(8);
  });

  it('keeps the track order when a bass and drums sit between the guitars', async () => {
    const bytes = gp(
      [
        guitarTrack('Segunda', RIFF),
        String.raw`\track "Baixo" \instrument 34 \tuning (G2 D2 A1 E1) ${BASS_BARS}`,
        String.raw`\track "Bateria" \instrument percussion ${DRUM_BARS}`,
        guitarTrack('Terceira', RIFF),
      ].join('\n'),
    );
    const { charts } = await importGpChart(file(bytes));
    expect(charts.map((c) => ('part' in c ? c.part : 'bass'))).toEqual([
      'bass',
      'drums',
      'guitar',
      'guitar',
    ]);
    const parts = charts.filter(isGuitarChart);
    expect(parts.map((c) => [c.partName, c.trackIndex])).toEqual([
      ['Segunda', 0],
      ['Terceira', 3],
    ]);
    const hash = await sha256(bytes);
    expect(parts.map((c) => c.id)).toEqual([
      await partChartId(hash, 'guitar', 0),
      await partChartId(hash, 'guitar', 3),
    ]);
  });

  it('keeps the strings and the open pitch of a 7-string and a 12-string track', async () => {
    const [seven, twelve] = await guitars(
      [
        guitarTrack('Sete', ':4 0.7 3.7 5.6 0.1', SEVEN),
        guitarTrack('Doze', ':4 0.12 3.12 5.6 0.1', TWELVE),
      ].join('\n'),
    );
    expect(seven.strings).toBe(7);
    expect(seven.openPitches).toEqual([35, 40, 45, 50, 55, 59, 64]);
    expect(seven.notes.map((n) => [n.string, n.fret, n.midi])).toEqual([
      [0, 0, 35],
      [0, 3, 38],
      [1, 5, 45],
      [6, 0, 64],
    ]);
    expect(twelve.strings).toBe(12);
    expect(twelve.openPitches).toEqual([
      35, 40, 41, 45, 50, 55, 59, 62, 64, 67, 71, 76,
    ]);
    expect(twelve.notes.map((n) => [n.string, n.fret])).toEqual([
      [0, 0],
      [0, 3],
      [6, 5],
      [11, 0],
    ]);
  });

  it('keeps the capo, and counts the frets from the capo', async () => {
    const [capo, free] = await guitars(
      [
        guitarTrack('Com capo', ':4 3.6 0.5 2.4 0.1', SIX, String.raw`\capo 2`),
        guitarTrack('Sem capo', ':4 3.6 0.5 2.4 0.1'),
      ].join('\n'),
    );
    expect(capo.capo).toBe(2);
    expect(free.capo).toBe(0);
    expect(capo.openPitches).toEqual(free.openPitches);
    expect(capo.notes.map((n) => [n.string, n.fret])).toEqual(
      free.notes.map((n) => [n.string, n.fret]),
    );
    expect(capo.notes.map((n) => n.midi)).toEqual(
      free.notes.map((n) => n.midi + 2),
    );
    expect(parseChart(capo)).not.toBeNull();
  });

  it('keeps the string and the fret of each note, also where a pitch has two places', async () => {
    const [chart] = await guitars(
      guitarTrack('Guitarra', ':4 5.6 0.5 7.5 12.1 | 3.4 0.3 8.2 1.1'),
    );
    expect(chart.notes.map((n) => [n.string, n.fret, n.midi])).toEqual([
      [0, 5, 45],
      [1, 0, 45],
      [1, 7, 52],
      [5, 12, 76],
      [2, 3, 53],
      [3, 0, 55],
      [4, 8, 67],
      [5, 1, 65],
    ]);
  });

  it('places the notes on the bars and on the beats of the song', async () => {
    const [chart] = await guitars(guitarTrack('Guitarra', RIFF));
    expect(chart.bars).toHaveLength(2);
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
    expect(chart.notes[1].time).toBeCloseTo(0.5, 3);
    expect(chart.notes[0].endTime).toBeLessThanOrEqual(chart.notes[1].time);
    expect(chart.averageTempoBpm).toBeCloseTo(120, 0);
  });

  it('puts the notes of one beat on one position, as a chord', async () => {
    const [chart] = await guitars(
      guitarTrack('Guitarra', ':4 (3.6 2.5 0.4 0.3) 0.1 (0.6 2.5)'),
    );
    const first = chart.notes.filter((n) => n.beatInBar === 0);
    expect(first.map((n) => [n.string, n.fret])).toEqual([
      [0, 3],
      [1, 2],
      [2, 0],
      [3, 0],
    ]);
    expect(new Set(first.map((n) => n.time)).size).toBe(1);
    expect(chart.notes.filter((n) => n.beatInBar === 2)).toHaveLength(2);
  });

  it('keeps bends and the other techniques of a note', async () => {
    const [chart] = await guitars(
      guitarTrack(
        'Guitarra',
        ':4 7.3{b (0 4)} 5.3{sl} 7.3 x.3 | 5.3{h} 7.3 5.3{ac} 5.2{pm}',
      ),
    );
    const at = (bar: number, beat: number) =>
      chart.notes.find((n) => n.bar === bar && n.beatInBar === beat)!;
    expect(at(0, 0).techniques).toContain('bend');
    expect(at(0, 1).techniques).toContain('slide');
    expect(at(0, 1).slideToFret).toBe(7);
    expect(at(0, 3).techniques).toContain('mute');
    expect(at(1, 1).techniques).toContain('hammerOn');
    expect(at(1, 2).techniques).toContain('accent');
    expect(at(1, 3).techniques).toContain('palmMute');
    expect(parseChart(chart)).not.toBeNull();
  });

  it('imports a file with a guitar track and no bass or drums', async () => {
    const bytes = gp(guitarTrack('Só guitarra', RIFF));
    const { charts, audio } = await importGpChart(file(bytes));
    expect(audio).toBeNull();
    expect(charts).toHaveLength(1);
    expect(isGuitarChart(charts[0] as Chart)).toBe(true);
  });

  it('leaves the other tracks out: a track of four strings that is not the bass', async () => {
    const { charts } = await importGpChart(
      file(
        gp(
          [
            String.raw`\track "Baixo" \instrument 34 \tuning (G2 D2 A1 E1) ${BASS_BARS}`,
            String.raw`\track "Ukulele" \instrument 24 \tuning (A4 E4 C4 G4) :4 0.1 2.2 0.3 0.4`,
          ].join('\n'),
        ),
      ),
    );
    expect(charts).toHaveLength(1);
    expect(isBassChart(charts[0])).toBe(true);
  });

  it('gives a guitar chart that the shared parser accepts, in a record', async () => {
    const [chart] = await guitars(guitarTrack('Guitarra', RIFF));
    expect(parseChart(chart)).toEqual(chart);
    expect(
      parseBassChartRecord({
        id: chart.id,
        updatedAt: '2026-10-05T10:00:00.000Z',
        chart,
      })?.chart,
    ).toEqual(chart);
  });

  it('keeps the bass chart and the drum chart ids when a guitar joins the file, and on a second import', async () => {
    const bytes = gp(
      [
        String.raw`\track "Baixo" \instrument 34 \tuning (G2 D2 A1 E1) ${BASS_BARS}`,
        String.raw`\track "Bateria" \instrument percussion ${DRUM_BARS}`,
        guitarTrack('Guitarra', RIFF),
      ].join('\n'),
    );
    const hash = await sha256(bytes);
    const first = await importGpChart(file(bytes));
    const second = await importGpChart(file(bytes));
    const bass = first.charts.find(isBassChart)!;
    expect(bass.id).toBe(hash);
    expect(bass.notes).toHaveLength(8);
    expect(bass.tuning).toHaveLength(4);
    const ids = (charts: Chart[]) => charts.map((c) => c.id);
    expect(ids(first.charts)).toEqual(ids(second.charts));
    const drums = first.charts.find((c) => 'part' in c && c.part === 'drums');
    expect(drums?.id).toBe(await partChartId(hash, 'drums'));
  });
});
