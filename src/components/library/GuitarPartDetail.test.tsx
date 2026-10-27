// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { IDBFactory } from 'fake-indexeddb';
import BassTabBar from '@/components/library/BassTabBar';
import GuitarPartDetail from '@/components/library/GuitarPartDetail';
import { fixtureChart } from '@/domain/bassChartFixture';
import { notesByBar } from '@/domain/bassChart';
import {
  fixtureGuitarChart,
  type GuitarNoteSpec,
} from '@/domain/guitarChartFixture';

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

const STRING_LINE = 'line[stroke="var(--color-string)"]';

const chord: GuitarNoteSpec[] = [
  { bar: 0, beat: 0, string: 1, fret: 3 },
  { bar: 0, beat: 0, string: 2, fret: 2 },
  { bar: 0, beat: 0, string: 3, fret: 0 },
  { bar: 0, beat: 1, string: 4, fret: 1 },
  { bar: 0, beat: 2, string: 5, fret: 3, techniques: ['bend'] },
  { bar: 0, beat: 3, string: 5, fret: 5, techniques: ['mute'] },
  { bar: 1, beat: 0, string: 2, fret: 2, slideToFret: 4 },
  { bar: 1, beat: 1, string: 3, fret: 2, techniques: ['accent'] },
];

const bar = (index: number) =>
  document.querySelector(`button[data-bar="${index}"]`) as HTMLButtonElement;
const fretTexts = (element: Element) => [
  ...element.querySelectorAll('svg text:not([data-degree-level])'),
];
const degreeTexts = () => [...document.querySelectorAll('[data-degree-level]')];

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

function part(chart = fixtureGuitarChart(2, chord)) {
  render(<GuitarPartDetail chart={chart} onRemove={vi.fn()} />);
}

describe('guitar part of the song detail', () => {
  it('shows the song, the part name, the tuning, and the sections', () => {
    part(fixtureGuitarChart(2, chord, { partName: 'Guitarra 1 - Rhythm' }));
    expect(screen.getByRole('heading', { name: 'Test' })).toBeTruthy();
    expect(screen.getByText('Guitarra importada de test.gp')).toBeTruthy();
    expect(screen.getByText('Guitarra 1 - Rhythm')).toBeTruthy();
    expect(
      screen.getByRole('heading', { name: 'Tablatura por seção' }),
    ).toBeTruthy();
    expect(screen.getByText('E A D G B E')).toBeTruthy();
    expect(document.querySelectorAll('button[data-bar]')).toHaveLength(2);
  });

  it.each([
    [6, [40, 45, 50, 55, 59, 64]],
    [7, [35, 40, 45, 50, 55, 59, 64]],
    [12, [35, 40, 41, 45, 50, 55, 59, 62, 64, 67, 71, 76]],
  ])('draws all %i strings of the track on each bar', (count, openPitches) => {
    part(
      fixtureGuitarChart(2, [{ bar: 0, beat: 0, string: count - 1, fret: 0 }], {
        openPitches,
      }),
    );
    expect(bar(0).querySelectorAll(STRING_LINE)).toHaveLength(count);
    expect(bar(1).querySelectorAll(STRING_LINE)).toHaveLength(count);
  });

  it('puts the highest string on the top line and the lowest on the bottom line', () => {
    part(
      fixtureGuitarChart(1, [
        { bar: 0, beat: 0, string: 5, fret: 1 },
        { bar: 0, beat: 1, string: 0, fret: 2 },
      ]),
    );
    const lines = [...bar(0).querySelectorAll(STRING_LINE)].map((line) =>
      Number(line.getAttribute('y1')),
    );
    const yOf = (label: string) =>
      Number(
        fretTexts(bar(0))
          .find((item) => item.textContent === label)
          ?.getAttribute('y'),
      );
    expect(yOf('1')).toBe(Math.min(...lines));
    expect(yOf('2')).toBe(Math.max(...lines));
  });

  it('shows a "Capo n" tag when the track has a capo, and none without', () => {
    part(fixtureGuitarChart(2, chord, { capo: 2 }));
    expect(screen.getByText('Capo 2')).toBeTruthy();
    cleanup();
    part();
    expect(screen.queryByText(/Capo/)).toBeNull();
  });

  it('draws frets from the capo, not the sounding fret', () => {
    part(
      fixtureGuitarChart(2, [{ bar: 0, beat: 0, string: 0, fret: 3 }], {
        capo: 2,
      }),
    );
    expect(fretTexts(bar(0)).map((item) => item.textContent)).toEqual(['3']);
  });

  it('stacks the notes of one beat as a chord on one column', () => {
    part();
    const texts = fretTexts(bar(0));
    const column = texts[0].getAttribute('x');
    const first = texts.filter((item) => item.getAttribute('x') === column);
    expect(first.map((item) => item.textContent)).toEqual(['3', '2', '0']);
    expect(new Set(first.map((item) => item.getAttribute('y'))).size).toBe(3);
  });

  it('draws bends and the techniques of the bass tab', () => {
    part();
    const labels = (index: number) =>
      fretTexts(bar(index)).map((item) => item.textContent);
    expect(labels(0)).toContain('3b');
    expect(labels(0)).toContain('x');
    expect(labels(1)).toContain('2/');
    const accent = fretTexts(bar(1)).find(
      (item) =>
        item.textContent === '2' && item.getAttribute('font-weight') === '700',
    );
    expect(accent).toBeTruthy();
  });

  it('shows degrees only with "Mostrar graus" on', () => {
    part();
    expect(degreeTexts()).toHaveLength(0);
    const toggle = screen.getByLabelText('Mostrar graus') as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    fireEvent.click(toggle);
    expect(toggle.checked).toBe(true);
    const labels = degreeTexts().map((item) => item.textContent);
    expect(labels.length).toBeGreaterThan(0);
    expect(labels[0]).toBe('R/3/5');
    fireEvent.click(toggle);
    expect(degreeTexts()).toHaveLength(0);
  });
});

describe('tab of N strings', () => {
  const bass = fixtureChart(1, [
    { bar: 0, beat: 0, midi: 33 },
    { bar: 0, beat: 1, midi: 40 },
  ]);

  function bassBar(extra: Partial<Parameters<typeof BassTabBar>[0]> = {}) {
    return render(
      <BassTabBar
        bar={bass.bars[0]}
        notes={notesByBar(bass)[0]}
        activeNotes={[]}
        playhead={null}
        onSeek={null}
        analysis={null}
        segment={null}
        avoidNotes={null}
        noteNames={['C']}
        {...extra}
      />,
    );
  }

  it('keeps four strings, and no bend sign, for the bass tab', () => {
    const view = bassBar();
    expect(view.container.querySelectorAll(STRING_LINE)).toHaveLength(4);
  });

  it('does not draw the bend of a bass note', () => {
    const bent = {
      ...bass,
      notes: bass.notes.map((note) => ({
        ...note,
        techniques: ['bend' as const],
      })),
    };
    const view = bassBar({ notes: notesByBar(bent)[0] });
    expect(
      [...view.container.querySelectorAll('svg text')].some((text) =>
        text.textContent?.includes('b'),
      ),
    ).toBe(false);
  });
});
