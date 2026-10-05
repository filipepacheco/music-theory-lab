import { describe, expect, it } from 'vitest';
import { exporter, importer, midi, model, Settings } from '@coderline/alphatab';
import {
  importGpChart,
  gpChartImportErrorMessage,
} from '@/services/gp/importGpChart';
import { importMidi } from '@/services/midi/importMidi';
import { analyzeBassChart } from '@/domain/bassAnalysis';
import { parseBassChart } from '@/domain/bassChartRecord';

function score(tex = '0.4.4 2.4 3.4 0.3 | 2.3.4 3.3 0.2 2.2') {
  return importer.ScoreLoader.loadAlphaTex(
    String.raw`\title "Teste" \artist "Artista" \album "Álbum" \tempo 120 \instrument 34 \tuning G2 D2 A1 E1 . ${tex}`,
  );
}

function file(bytes: Uint8Array, name = 'Teste.gp') {
  return { name, arrayBuffer: async () => bytes.slice().buffer } as Blob & {
    name: string;
  };
}

describe('Biblioteca Guitar Pro import', () => {
  it('reuses the MIDI chart and analysis with score metadata', async () => {
    const original = score();
    const gp = await importGpChart(
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
    const again = await importGpChart(
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
    const result = await importGpChart(
      file(new exporter.Gp7Exporter().export(original)),
    );
    expect(result.chart.bars).toHaveLength(4);
    expect(result.chart.songLengthSeconds).toBeCloseTo(8);
    expect(result.chart.notes).toHaveLength(16);
    expect(result.chart.notes[8].time).toBeCloseTo(4);
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
    const result = await importGpChart(
      file(new exporter.Gp7Exporter().export(original)),
    );
    expect(result.chart.notes).toHaveLength(8);
    expect(
      result.chart.notes.some((note) => note.techniques.includes('bend')),
    ).toBe(true);
  });

  it('keeps mixed meters and tempo changes on their own beat grid', async () => {
    const original = score(
      String.raw`\ts 3 4 0.4.4 2.4 3.4 | \ts 6 8 \tempo 60 0.3.8 2.3 3.3 0.2 2.2 3.2`,
    );
    const result = await importGpChart(
      file(new exporter.Gp7Exporter().export(original)),
    );
    expect(result.chart.bars.map((bar) => bar.beatCount)).toEqual([3, 6]);
    expect(result.chart.bars[1].startTime).toBeCloseTo(1.5);
    expect(result.chart.songLengthSeconds).toBeCloseTo(4.5);
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
