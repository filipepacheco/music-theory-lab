// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { IDBFactory } from 'fake-indexeddb';
import VocalPartDetail from '@/components/library/VocalPartDetail';
import { fixtureChart } from '@/domain/bassChartFixture';
import { summarizeChart } from '@/domain/chartSummary';
import { fixtureVocalChart } from '@/domain/vocalChartFixture';
import type { VocalNoteSpec } from '@/domain/vocalChartFixture';
import { partChartId } from '@/services/chartId';
import { rocksmithLibrary } from '@/services/rocksmithLibrary';

vi.mock('@/services/confirm', () => ({
  confirmDialog: vi.fn(() => Promise.resolve(true)),
}));
vi.mock('@/services/chartSettingsSync', () => ({
  syncChartSettings: vi.fn(() => Promise.resolve()),
}));
vi.mock('@/hooks/useRocksmithAudio', () => ({
  useRocksmithAudio: () => ({
    audioState: { status: 'missing' },
    attach: vi.fn(),
    saveError: false,
  }),
}));
vi.mock('@/hooks/useBassSynth', () => ({
  useBassSynth: () => ({ playBassNote: vi.fn() }),
}));

const BASS_ID = 'b'.repeat(64);

const melody: VocalNoteSpec[] = [
  { bar: 0, beat: 0, midi: 64, lyric: 'Hel-' },
  { bar: 0, beat: 1, midi: 67, lyric: 'lo' },
  { bar: 0, beat: 2, midi: 72, lyric: 'wor-' },
  { bar: 0, beat: 3, midi: 71, lyric: 'ld' },
  { bar: 1, beat: 0, midi: 60 },
  { bar: 1, beat: 1, midi: 62, lyric: 'la' },
];

const bar = (index: number) =>
  document.querySelector(`button[data-bar="${index}"]`) as HTMLButtonElement;
const texts = (element: Element, selector: string) =>
  [...element.querySelectorAll(selector)].map((item) => item.textContent);
const names = (index: number) => texts(bar(index), '[data-note-name]');
const lyrics = (index: number) => texts(bar(index), '[data-lyric]');
const degrees = () => texts(document.body, '[data-degree-level]');
const attribute = (element: Element, name: string) =>
  Number(element.getAttribute(name));

async function bassChart() {
  const bass = {
    ...fixtureChart(4, [
      ...[36, 40, 43, 40].map((midi, beat) => ({ bar: 0, beat, midi })),
      ...[41, 45, 48, 45].map((midi, beat) => ({ bar: 1, beat, midi })),
      ...[43, 47, 50, 47].map((midi, beat) => ({ bar: 2, beat, midi })),
      ...[36, 40, 43, 40].map((midi, beat) => ({ bar: 3, beat, midi })),
    ]),
    id: BASS_ID,
    source: 'gp' as const,
  };
  await rocksmithLibrary.save(bass, null);
  return bass;
}

async function vocalId(trackIndex = 2) {
  return partChartId(BASS_ID, 'vocals', trackIndex);
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(private readonly onResize: () => void) {}
      observe(element: Element) {
        element.getBoundingClientRect = () => ({ width: 1000 }) as DOMRect;
        this.onResize();
      }
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('vocal part of the song detail', () => {
  it('shows the song, the part name, and the melody by section', () => {
    render(
      <VocalPartDetail
        chart={fixtureVocalChart(2, melody, { partName: 'Voz principal' })}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Test' })).toBeTruthy();
    expect(screen.getByText('Vocais importados de test.gp')).toBeTruthy();
    expect(screen.getByText('Voz principal')).toBeTruthy();
    expect(
      screen.getByRole('heading', { name: 'Melodia por seção' }),
    ).toBeTruthy();
    expect(document.querySelectorAll('button[data-bar]')).toHaveLength(2);
  });

  it('shows the note name of each note on the pitch lane, and the lyrics under the notes', () => {
    render(<VocalPartDetail chart={fixtureVocalChart(2, melody)} onRemove={vi.fn()} />);
    expect(names(0)).toEqual(['E', 'G', 'C', 'B']);
    expect(names(1)).toEqual(['C', 'D']);
    expect(lyrics(0)).toEqual(['Hel-', 'lo', 'wor-', 'ld']);
    expect(lyrics(1)).toEqual(['la']);
    const y = (selector: string, from = bar(0)) =>
      [...from.querySelectorAll(selector)].map((item) => attribute(item, 'y'));
    const rectBottom = Math.max(
      ...[...bar(0).querySelectorAll('rect')].map(
        (rect) => attribute(rect, 'y') + attribute(rect, 'height'),
      ),
    );
    expect(Math.min(...y('[data-lyric]'))).toBeGreaterThan(rectBottom);
  });

  it('puts a higher pitch higher on the lane', () => {
    render(<VocalPartDetail chart={fixtureVocalChart(2, melody)} onRemove={vi.fn()} />);
    const rects = [...bar(0).querySelectorAll('rect')].map((rect) =>
      attribute(rect, 'y'),
    );
    const [e4, g4, c5, b4] = rects;
    expect(c5).toBeLessThan(b4);
    expect(b4).toBeLessThan(g4);
    expect(g4).toBeLessThan(e4);
  });

  it('shows both notes that sound at once', () => {
    const chord: VocalNoteSpec[] = [
      { bar: 0, beat: 0, midi: 60, lyric: 'la' },
      { bar: 0, beat: 0, midi: 64, lyric: 'la' },
      { bar: 0, beat: 2, midi: 67 },
    ];
    render(<VocalPartDetail chart={fixtureVocalChart(1, chord)} onRemove={vi.fn()} />);
    expect(bar(0).querySelectorAll('rect')).toHaveLength(3);
    expect(names(0)).toEqual(['C', 'E', 'G']);
    expect(lyrics(0)).toEqual(['la']);
    const [low, high] = [...bar(0).querySelectorAll('rect')];
    expect(attribute(low, 'x')).toBe(attribute(high, 'x'));
    expect(attribute(high, 'y')).toBeLessThan(attribute(low, 'y'));
  });

  it('draws a melody with no lyrics, with no lyric row text', () => {
    const plain = melody.map(({ lyric: _lyric, ...note }) => note);
    render(<VocalPartDetail chart={fixtureVocalChart(2, plain)} onRemove={vi.fn()} />);
    expect(names(0)).toEqual(['E', 'G', 'C', 'B']);
    expect(lyrics(0)).toEqual([]);
    expect(screen.getByText('sem letra')).toBeTruthy();
  });

  it('shows the degree of each note in the key of the bass analysis, with "Mostrar graus" on', async () => {
    const bass = await bassChart();
    render(
      <VocalPartDetail
        chart={fixtureVocalChart(2, melody, { id: await vocalId() })}
        songCharts={[summarizeChart(bass)]}
        onRemove={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText('C maior')).toBeTruthy());
    expect(degrees()).toEqual([]);

    const toggle = screen.getByLabelText('Mostrar graus') as HTMLInputElement;
    fireEvent.click(toggle);
    expect(toggle.checked).toBe(true);
    expect(texts(bar(0), '[data-degree-level]')).toEqual(['3', '5', 'R', '7']);
    expect(texts(bar(1), '[data-degree-level]')).toEqual(['R', '2']);

    fireEvent.click(toggle);
    expect(degrees()).toEqual([]);
  });

  it('shows no degree, and says why, when the song has no bass for a key', () => {
    render(<VocalPartDetail chart={fixtureVocalChart(2, melody)} onRemove={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('Mostrar graus'));
    expect(degrees()).toEqual([]);
    expect(screen.getByRole('status').textContent).toMatch(/Sem tom/);
  });

  it('does not take the key from a bass chart of another file', async () => {
    const bass = await bassChart();
    render(
      <VocalPartDetail
        chart={fixtureVocalChart(2, melody, { id: 'a'.repeat(64) })}
        songCharts={[summarizeChart(bass)]}
        onRemove={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText('Mostrar graus'));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(degrees()).toEqual([]);
  });

  it('keeps the bass fretboard in the dock', () => {
    render(<VocalPartDetail chart={fixtureVocalChart(2, melody)} onRemove={vi.fn()} />);
    const strings = new Set(
      [...document.querySelectorAll('[data-pos]')].map((cell) =>
        cell.getAttribute('data-pos')?.split('-')[0],
      ),
    );
    expect(strings.size).toBe(4);
  });
});
