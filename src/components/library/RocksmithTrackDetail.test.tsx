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
import { rocksmithLibrary } from '@/services/rocksmithLibrary';
import { syncChartSettings } from '@/services/chartSettingsSync';
import { confirmDialog } from '@/services/confirm';
import { parseChartSettings } from '@/domain/chartSettings';
import RocksmithTrackDetail from '@/components/library/RocksmithTrackDetail';
import { fixtureChart, walking } from '@/domain/bassChartFixture';
import type { BassChart } from '@/domain/bassChart';
import { fixtureDrumChart } from '@/domain/drumChartFixture';
import { partChartId } from '@/services/chartId';
import { beatMarkX, drumGridMarksByBar } from '@/domain/drumGrid';
import { summarizeChart, type ChartSummary } from '@/domain/chartSummary';
import type { Chart } from '@/domain/drumChart';

const state = vi.hoisted(() => ({
  audio: { status: 'missing' } as { status: string; url?: string },
  synthChart: null as BassChart | null,
  seeks: [] as number[],
}));
vi.mock('@/services/confirm', () => ({
  confirmDialog: vi.fn(() => Promise.resolve(true)),
}));
vi.mock('@/services/chartSettingsSync', () => ({
  syncChartSettings: vi.fn(() => Promise.resolve()),
}));
vi.mock('@/hooks/useRocksmithAudio', () => ({
  useRocksmithAudio: () => ({
    audioState: state.audio,
    attach: vi.fn(),
    saveError: false,
  }),
}));
vi.mock('@/hooks/useBassSynth', () => ({
  useBassSynth: () => ({ playBassNote: vi.fn() }),
}));
vi.mock('@/hooks/useBassSynthPlayback', async () => {
  const { useState } = await import('react');
  return {
    useBassSynthPlayback: (chart: BassChart) => {
      state.synthChart = chart;
      // A seek moves the clock, as the transport of the real player does.
      const [currentSeconds, setCurrentSeconds] = useState(0);
      return {
        ready: true,
        playing: false,
        duration: 2,
        currentSeconds,
        failed: false,
        play: vi.fn(),
        pause: vi.fn(),
        seek: (seconds: number) => {
          state.seeks.push(seconds);
          setCurrentSeconds(seconds);
        },
      };
    },
  };
});
vi.mock('@/components/library/useLibraryAudio', () => ({
  useLibraryAudio: () => ({
    ready: true,
    playing: false,
    duration: 2,
    currentSeconds: 0,
    play: vi.fn(),
    pause: vi.fn(),
    seek: vi.fn(),
  }),
}));

const chart = {
  ...fixtureChart(1, walking([[48, 52, 55, 59]])),
  source: 'gp' as const,
};
beforeEach(() => {
  state.audio = { status: 'missing' };
  state.seeks = [];
  localStorage.clear();
  localStorage.setItem('music-theory-lab:fifths-window-open', 'false');
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Biblioteca semitone buttons', () => {
  it('switches GP fingering without changing pitches, and restores the choice after transposition', () => {
    const gp = {
      ...fixtureChart(1, [
        { bar: 0, beat: 0, string: 0, fret: 0 },
        { bar: 0, beat: 1, string: 2, fret: 2 },
      ]),
      source: 'gp' as const,
      originalFingering: [
        { string: 0, fret: 0 },
        { string: 1, fret: 7 },
      ],
    };
    render(<RocksmithTrackDetail chart={gp} onRemove={vi.fn()} />);
    const picker = screen.getByLabelText('Digitação') as HTMLSelectElement;
    expect(picker.value).toBe('original');
    expect(
      screen.getByText(/Cordas e casas seguem a digitação original do GP/),
    ).toBeTruthy();
    expect(state.synthChart!.notes[1]).toMatchObject({
      midi: 40,
      string: 1,
      fret: 7,
    });
    fireEvent.change(picker, { target: { value: 'suggested' } });
    expect(
      screen.getByText(/Cordas e casas são uma sugestão automática/),
    ).toBeTruthy();
    expect(state.synthChart!.notes[1]).toMatchObject({
      midi: 40,
      string: 2,
      fret: 2,
    });
    fireEvent.change(picker, { target: { value: 'original' } });
    fireEvent.click(screen.getByRole('button', { name: 'Diminuir meio tom' }));
    expect(picker.disabled).toBe(true);
    expect(picker.value).toBe('suggested');
    expect(state.synthChart!.notes.map((n) => n.midi)).toEqual([39, 51]);
    fireEvent.click(screen.getByRole('button', { name: 'Tom original' }));
    expect(picker.disabled).toBe(false);
    expect(picker.value).toBe('original');
    expect(state.synthChart!.notes[1]).toMatchObject({
      midi: 40,
      string: 1,
      fret: 7,
    });
    fireEvent.change(screen.getByLabelText('Afinação para tocar'), {
      target: { value: 'drop-d' },
    });
    expect(picker.disabled).toBe(true);
    expect(picker.value).toBe('suggested');
    fireEvent.change(screen.getByLabelText('Afinação para tocar'), {
      target: { value: 'original' },
    });
    expect(picker.value).toBe('original');
    expect(state.synthChart!.notes.map((n) => n.midi)).toEqual(
      gp.notes.map((n) => n.midi),
    );
  });

  it('explains how to recover original fingering for older GP imports', () => {
    render(<RocksmithTrackDetail chart={chart} onRemove={vi.fn()} />);
    expect(
      (screen.getByLabelText('Digitação') as HTMLSelectElement).disabled,
    ).toBe(true);
    expect(screen.getByText(/Reimporte o arquivo para recuperar/)).toBeTruthy();
  });

  it('does not offer an original tab choice for MIDI imports', () => {
    render(
      <RocksmithTrackDetail
        chart={{ ...chart, source: 'midi' }}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText('Digitação')).toBeNull();
  });

  it('offers E Standard and Drop D for imports with a different tuning', () => {
    render(
      <RocksmithTrackDetail
        chart={{ ...chart, tuning: [-2, -2, -2, -2] }}
        onRemove={vi.fn()}
      />,
    );
    const tuning = screen.getByLabelText('Afinação para tocar');
    fireEvent.change(tuning, { target: { value: 'standard' } });
    expect(state.synthChart!.tuning).toEqual([0, 0, 0, 0]);
    expect(state.synthChart!.notes.map((n) => n.midi)).toEqual(
      chart.notes.map((n) => n.midi),
    );
    fireEvent.change(tuning, { target: { value: 'drop-d' } });
    expect(state.synthChart!.tuning).toEqual([-2, 0, 0, 0]);
  });
  it('limits transposition and tuning choices when the full line cannot fit', () => {
    const wide = {
      ...fixtureChart(1, [
        { bar: 0, beat: 0, string: 0, fret: 0 },
        { bar: 0, beat: 1, string: 3, fret: 24 },
      ]),
      source: 'gp' as const,
    };
    render(<RocksmithTrackDetail chart={wide} onRemove={vi.fn()} />);
    const lower = screen.getByRole('button', {
      name: 'Diminuir meio tom',
    }) as HTMLButtonElement;
    const raise = screen.getByRole('button', {
      name: 'Aumentar meio tom',
    }) as HTMLButtonElement;
    expect(lower.disabled).toBe(true);
    expect(raise.disabled).toBe(true);
    expect(
      screen.getByText(
        /A transposição foi limitada para preservar os intervalos/,
      ),
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Afinação para tocar'), {
      target: { value: 'drop-d' },
    });
    expect(lower.disabled).toBe(false);
    fireEvent.click(lower);
    expect(state.synthChart!.notes.map((n) => n.midi)).toEqual([27, 66]);
    expect(
      (
        screen.getByRole('option', {
          name: 'E Standard (E A D G)',
        }) as HTMLOptionElement
      ).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Tom original' }));
    expect(state.synthChart).toBe(wide);
  });
  it.each(['midi', 'gp'] as const)(
    'lowers %s in E Standard and independently switches to Drop D and back',
    (source) => {
      const low = {
        ...fixtureChart(1, [
          { bar: 0, beat: 0, string: 0, fret: 0 },
          { bar: 0, beat: 1, string: 3, fret: 0 },
        ]),
        source,
      };
      render(<RocksmithTrackDetail chart={low} onRemove={vi.fn()} />);
      const lower = screen.getByRole('button', {
        name: 'Diminuir meio tom',
      }) as HTMLButtonElement;
      expect(lower.disabled).toBe(false);
      expect(state.synthChart!.tuning).toEqual([0, 0, 0, 0]);
      fireEvent.click(lower);
      fireEvent.click(lower);
      expect(state.synthChart!.notes.map((n) => n.midi)).toEqual([38, 53]);
      expect(state.synthChart!.tuning).toEqual([0, 0, 0, 0]);
      expect(screen.getByText(/Linha inteira 1 oitava acima/)).toBeTruthy();
      fireEvent.change(screen.getByLabelText('Afinação para tocar'), {
        target: { value: 'drop-d' },
      });
      expect(lower.disabled).toBe(false);
      expect(state.synthChart!.tuning).toEqual([-2, 0, 0, 0]);
      expect(
        state.synthChart!.notes.map((n) => [n.midi, n.string, n.fret]),
      ).toEqual([
        [26, 0, 0],
        [41, 2, 3],
      ]);
      expect(lower.disabled).toBe(false);
      expect(screen.queryByText(/Linha inteira 1 oitava acima/)).toBeNull();
      expect(
        (
          screen.getByRole('option', {
            name: 'E Standard (E A D G)',
          }) as HTMLOptionElement
        ).disabled,
      ).toBe(false);
      fireEvent.change(screen.getByLabelText('Afinação para tocar'), {
        target: { value: 'original' },
      });
      expect(state.synthChart!.tuning).toEqual([0, 0, 0, 0]);
      expect(state.synthChart!.notes.map((n) => n.midi)).toEqual([38, 53]);
      fireEvent.click(screen.getByRole('button', { name: 'Tom original' }));
      expect(state.synthChart).toBe(low);
      expect(
        (screen.getByLabelText('Afinação para tocar') as HTMLSelectElement)
          .value,
      ).toBe('original');
    },
  );

  it.each(['midi', 'gp'] as const)(
    'transposes %s chords and synth notes in both directions, then restores the original',
    (source) => {
      render(
        <RocksmithTrackDetail
          chart={{ ...chart, source }}
          onRemove={vi.fn()}
        />,
      );
      fireEvent.click(screen.getByLabelText('Mostrar graus'));
      fireEvent.change(screen.getByLabelText('Tom para análise'), {
        target: { value: '0-major' },
      });
      expect(screen.getAllByText('Cmaj7').length).toBeGreaterThan(0);
      fireEvent.click(
        screen.getByRole('button', { name: 'Aumentar meio tom' }),
      );
      expect(state.synthChart!.notes.map((n) => n.midi)).toEqual([
        49, 53, 56, 60,
      ]);
      expect(screen.getAllByText('Dbmaj7').length).toBeGreaterThan(0);
      expect(
        (screen.getByLabelText('Tom para análise') as HTMLSelectElement).value,
      ).toBe('1-major');
      fireEvent.click(
        screen.getByRole('button', { name: 'Diminuir meio tom' }),
      );
      fireEvent.click(
        screen.getByRole('button', { name: 'Diminuir meio tom' }),
      );
      expect(state.synthChart!.notes.map((n) => n.midi)).toEqual([
        47, 51, 54, 58,
      ]);
      expect(screen.getAllByText('Bmaj7').length).toBeGreaterThan(0);
      fireEvent.click(screen.getByRole('button', { name: 'Tom original' }));
      expect(state.synthChart!.notes).toEqual(chart.notes);
      expect(screen.getAllByText('Cmaj7').length).toBeGreaterThan(0);
    },
  );

  it('disables transposition when an MP3/Ogg recording is attached, restoring the original score', () => {
    const { rerender } = render(
      <RocksmithTrackDetail chart={chart} onRemove={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Aumentar meio tom' }));
    state.audio = { status: 'ready', url: 'blob:recording' };
    rerender(<RocksmithTrackDetail chart={chart} onRemove={vi.fn()} />);
    expect(
      (
        screen.getByRole('button', {
          name: 'Aumentar meio tom',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole('button', {
          name: 'Diminuir meio tom',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(state.synthChart!.notes).toEqual(chart.notes);
    expect(
      (screen.getByLabelText('Afinação para tocar') as HTMLSelectElement)
        .disabled,
    ).toBe(true);
  });

  it('does not offer transposition for Rocksmith', () => {
    render(
      <RocksmithTrackDetail
        chart={{ ...chart, source: 'rocksmith' }}
        onRemove={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole('button', { name: 'Aumentar meio tom' }),
    ).toBeNull();
  });
});

describe('Biblioteca bar layout', () => {
  const LINE_WIDTH = 1000;
  const eightBars = fixtureChart(
    8,
    walking(Array.from({ length: 8 }, () => [48, 52, 55, 59])),
  );
  /** Bar 4 is in 3/4, the others in 4/4. */
  const mixed: BassChart = {
    ...eightBars,
    source: 'gp',
    bars: eightBars.bars.map((bar) =>
      bar.index === 3 ? { ...bar, beatCount: 3 } : bar,
    ),
    notes: eightBars.notes.filter(
      (note) => !(note.bar === 3 && note.beatInBar >= 3),
    ),
  };

  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(private readonly onResize: () => void) {}
        observe(element: Element) {
          element.getBoundingClientRect = () =>
            ({ width: LINE_WIDTH }) as DOMRect;
          this.onResize();
        }
        disconnect() {}
      },
    );
  });

  const bars = () => [
    ...document.querySelectorAll<HTMLButtonElement>('button[data-bar]'),
  ];
  const widths = () => bars().map((bar) => parseFloat(bar.style.width));
  /** The rows of a section with a set line length. */
  const lines = () => [
    ...document.querySelectorAll<HTMLElement>('[data-line]'),
  ];
  const typeSizes = () =>
    [...document.querySelectorAll('button[data-bar] svg text')].map((text) =>
      Number(text.getAttribute('font-size')),
    );
  const setLineLength = (value: string) =>
    fireEvent.change(screen.getByLabelText(/^Compassos por linha em/), {
      target: { value },
    });

  it('keeps the base width in the automatic layout', () => {
    render(<RocksmithTrackDetail chart={mixed} onRemove={vi.fn()} />);
    expect(widths()).toEqual([152, 152, 152, 118, 152, 152, 152, 152]);
  });

  it('makes the bars of a line share its full width at one beat width', () => {
    render(<RocksmithTrackDetail chart={mixed} onRemove={vi.fn()} />);
    setLineLength('4');
    // (1000 - 3 gaps of 4 - 4 × 16 of padding and border) / 16 beats.
    expect(widths()).toEqual([247, 247, 247, 189.25, 247, 247, 247, 247]);
    expect(247 * 4 + 4 * 3).toBe(LINE_WIDTH);
    expect(new Set(bars().map((bar) => bar.dataset.beatWidth))).toEqual(
      new Set(['57.75']),
    );
  });

  it('narrows the beats to keep the line length, at one type size', () => {
    render(<RocksmithTrackDetail chart={mixed} onRemove={vi.fn()} />);
    const automatic = typeSizes();
    // 7 bars do not fit at the base width (152 px): the beats narrow.
    setLineLength('7');
    expect(widths().slice(0, 3)).toEqual([139.375, 139.375, 139.375]);
    expect(139.375 * 7 + 4 * 6).toBeLessThanOrEqual(LINE_WIDTH);
    expect(139.375 * 7 + 4 * 6).toBeGreaterThan(LINE_WIDTH - 1);
    expect(typeSizes()).toEqual(automatic);
    // 8 bars narrow the beats under 0.8 of the base: the length still holds.
    setLineLength('8');
    // (1000 - 7 gaps of 4 - 8 × 16) / 32 beats = 26.375 < 27.2.
    expect(widths()[0]).toBe(16 + 4 * 26.375);
    expect(typeSizes()).toEqual(automatic);
  });

  it('stops a bar at three times the base beat width', () => {
    render(<RocksmithTrackDetail chart={mixed} onRemove={vi.fn()} />);
    setLineLength('1');
    expect(widths()[0]).toBe(16 + 4 * 34 * 3);
    expect(widths()[0]).toBeLessThan(LINE_WIDTH);
  });

  it('draws the text at one size, never under 10 px, at each width', () => {
    render(<RocksmithTrackDetail chart={mixed} onRemove={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('Mostrar graus'));
    const automatic = typeSizes();
    // Frets and degree labels.
    expect(new Set(automatic).size).toBe(2);
    expect(Math.min(...automatic)).toBeGreaterThanOrEqual(10);
    for (const length of ['1', '4', '16']) {
      setLineLength(length);
      expect(typeSizes()).toEqual(automatic);
      for (const svg of document.querySelectorAll('button[data-bar] svg')) {
        expect(svg.getAttribute('viewBox')).toBe(
          `0 0 ${svg.getAttribute('width')} ${svg.getAttribute('height')}`,
        );
      }
    }
  });

  it('keeps a line of a set length on one row, with exactly its bars', () => {
    render(<RocksmithTrackDetail chart={mixed} onRemove={vi.fn()} />);
    // The automatic layout has no lines: its bars wrap where they must.
    expect(lines()).toEqual([]);
    expect(bars()[0].parentElement?.classList.contains('flex-wrap')).toBe(true);
    const barsOfLines = () =>
      lines().map((line) =>
        [...line.querySelectorAll<HTMLElement>('button[data-bar]')].map((bar) =>
          Number(bar.dataset.bar),
        ),
      );
    const wrapping = () =>
      lines().filter((line) => line.classList.contains('flex-wrap'));
    setLineLength('4');
    expect(barsOfLines()).toEqual([
      [0, 1, 2, 3],
      [4, 5, 6, 7],
    ]);
    expect(wrapping()).toEqual([]);
    // The bars keep their width: none shrinks to make room.
    expect(bars().every((bar) => bar.classList.contains('shrink-0'))).toBe(
      true,
    );
    setLineLength('7');
    expect(barsOfLines()).toEqual([[0, 1, 2, 3, 4, 5, 6], [7]]);
    expect(wrapping()).toEqual([]);
    // 8 bars at a narrow beat: the line length holds, and does not wrap.
    setLineLength('8');
    expect(barsOfLines()).toEqual([[0, 1, 2, 3, 4, 5, 6, 7]]);
    expect(wrapping()).toEqual([]);
  });

  it('wraps a line of a set length until the line is measured', () => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      },
    );
    render(<RocksmithTrackDetail chart={mixed} onRemove={vi.fn()} />);
    setLineLength('4');
    // The bars still have the base width, which may not fit the line.
    expect(widths()[0]).toBe(152);
    expect(lines().length).toBe(2);
    expect(lines().every((line) => line.classList.contains('flex-wrap'))).toBe(
      true,
    );
  });

  it('seeks to a clicked bar under a line length, and moves the cursor', () => {
    render(<RocksmithTrackDetail chart={mixed} onRemove={vi.fn()} />);
    setLineLength('4');
    const activeBars = () =>
      bars()
        .filter((bar) => bar.classList.contains('border-live'))
        .map((bar) => Number(bar.dataset.bar));
    expect(activeBars()).toEqual([]);
    // Bar 6 is the second bar of the second line.
    fireEvent.click(bars()[5]);
    expect(state.seeks).toEqual([mixed.bars[5].startTime]);
    expect(activeBars()).toEqual([5]);
    // The playhead is the only line the cursor adds, at the start of the bar.
    const playhead = bars()[5].querySelector(
      'line[stroke="var(--color-accent)"]',
    );
    expect(playhead?.getAttribute('x1')).toBe(playhead?.getAttribute('x2'));
    expect(
      document.querySelectorAll(
        'button[data-bar] line[stroke="var(--color-accent)"]',
      ).length,
    ).toBe(1);
    fireEvent.click(bars()[2]);
    expect(state.seeks).toEqual([
      mixed.bars[5].startTime,
      mixed.bars[2].startTime,
    ]);
    expect(activeBars()).toEqual([2]);
  });

  it('keeps the repeat marks under a line length', () => {
    render(<RocksmithTrackDetail chart={mixed} onRemove={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('Marcar repetições'));
    setLineLength('4');
    expect(bars().every((bar) => !bar.disabled)).toBe(true);
    // Bars 5-7 show the same tab as bars 1-3 above; bar 8 is over a 3/4 bar.
    expect(
      bars().filter((bar) => bar.title.includes('igual ao compasso')).length,
    ).toBe(3);
  });
});

describe('Biblioteca dense sections', () => {
  const LINE_WIDTH = 1000;
  /** Bars 1-2 hold quarter notes; bars 3-4 hold sixteenths on frets 12-14. */
  const dense = fixtureChart(
    4,
    [
      ...walking([
        [48, 52, 55, 59],
        [48, 52, 55, 59],
      ]),
      ...[2, 3].flatMap((bar) =>
        Array.from({ length: 16 }, (_, i) => ({
          bar,
          beat: i / 4,
          string: 1,
          fret: 12 + (i % 3),
        })),
      ),
    ],
    [
      { name: 'verse', parts: 1, startBar: 0, endBar: 2 },
      { name: 'chorus', parts: 1, startBar: 2, endBar: 4 },
    ],
  );

  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(private readonly onResize: () => void) {}
        observe(element: Element) {
          element.getBoundingClientRect = () =>
            ({ width: LINE_WIDTH }) as DOMRect;
          this.onResize();
        }
        disconnect() {}
      },
    );
  });

  const beatWidths = () =>
    [...document.querySelectorAll<HTMLButtonElement>('button[data-bar]')].map(
      (bar) => Number(bar.dataset.beatWidth),
    );
  const setLineLength = (section: number, value: string) =>
    fireEvent.change(
      screen.getAllByLabelText(/^Compassos por linha em/)[section],
      {
        target: { value },
      },
    );

  it('gives a dense section wider bars and a sparse one the base width', () => {
    render(<RocksmithTrackDetail chart={dense} onRemove={vi.fn()} />);
    const [a, b, c, d] = beatWidths();
    expect(a).toBe(34);
    expect(b).toBe(34);
    // Two digits (13.2 px) and 4 px over a quarter beat: 68.8 px.
    expect(c).toBeCloseTo(68.8);
    expect(d).toBe(c);
  });

  it('keeps the set line length of a dense section', () => {
    const sixDense = fixtureChart(
      6,
      Array.from({ length: 6 }, (_, bar) =>
        Array.from({ length: 16 }, (_, i) => ({
          bar,
          beat: i / 4,
          string: 1,
          fret: 12 + (i % 3),
        })),
      ).flat(),
    );
    render(<RocksmithTrackDetail chart={sixDense} onRemove={vi.fn()} />);
    setLineLength(0, '6');
    // 6 bars of 68.8 px beats would need 6 × 291 px; the line length holds
    // anyway: (1000 - 20 - 96) / 24 beats, rounded down to 1/64 px.
    expect(new Set(beatWidths())).toEqual(new Set([36.828125]));
    expect(36.828125).toBeLessThan(68.8);
    // With exactly that number of bars in each line.
    const rows = [...document.querySelectorAll('[data-line]')];
    expect(
      rows.map((row) => row.querySelectorAll('button[data-bar]').length),
    ).toEqual([6]);
  });

  describe('degree lane', () => {
    /** Bars 1-2 hold quarter notes; bars 3-4 hold thirty-second notes. */
    const fast = fixtureChart(
      4,
      [
        ...walking([
          [48, 52, 55, 59],
          [48, 52, 55, 59],
        ]),
        ...[2, 3].flatMap((bar) =>
          Array.from({ length: 32 }, (_, i) => ({
            bar,
            beat: i / 8,
            midi: 48 + [0, 3, 6, 10][i % 4],
          })),
        ),
      ],
      [
        { name: 'verse', parts: 1, startBar: 0, endBar: 2 },
        { name: 'chorus', parts: 1, startBar: 2, endBar: 4 },
      ],
    );
    /** Character width of the 10 px degree labels, in pixels. */
    const CHAR = 6;
    const barButtons = () => [
      ...document.querySelectorAll<HTMLButtonElement>('button[data-bar]'),
    ];
    /** The degree labels of a bar as boxes: level, left edge, right edge. */
    const labelBoxes = (bar: HTMLButtonElement) =>
      [...bar.querySelectorAll('text[data-degree-level]')].map((text) => {
        const x = Number(text.getAttribute('x'));
        return {
          level: Number(text.getAttribute('data-degree-level')),
          y: Number(text.getAttribute('y')),
          x,
          end: x + (text.textContent ?? '').length * CHAR,
        };
      });
    const overlapping = (bar: HTMLButtonElement) => {
      const boxes = labelBoxes(bar);
      return boxes.flatMap((a, i) =>
        boxes
          .slice(i + 1)
          .filter((b) => a.level === b.level && a.x < b.end && b.x < a.end),
      );
    };
    const svgHeights = () =>
      barButtons().map((bar) =>
        Number(bar.querySelector('svg')?.getAttribute('height')),
      );
    const showDegrees = () =>
      fireEvent.click(screen.getByLabelText('Mostrar graus'));

    it('keeps the labels of a sparse section on the first level', () => {
      render(<RocksmithTrackDetail chart={fast} onRemove={vi.fn()} />);
      showDegrees();
      const [first, second] = barButtons();
      for (const bar of [first, second]) {
        expect(labelBoxes(bar).length).toBe(4);
        expect(new Set(labelBoxes(bar).map((box) => box.level))).toEqual(
          new Set([1]),
        );
      }
    });

    it('puts a label that touches the one before it on the second level', () => {
      render(<RocksmithTrackDetail chart={fast} onRemove={vi.fn()} />);
      showDegrees();
      // The section needs more than three times the base width: it stops
      // there, and the labels of thirty-second notes touch.
      expect(beatWidths().slice(2)).toEqual([102, 102]);
      const boxes = labelBoxes(barButtons()[2]);
      expect(boxes.length).toBe(32);
      expect(new Set(boxes.map((box) => box.level))).toEqual(new Set([1, 2]));
      // The second level is drawn under the first.
      const y = (level: number) =>
        new Set(boxes.filter((b) => b.level === level).map((b) => b.y));
      expect(y(1).size).toBe(1);
      expect(y(2).size).toBe(1);
      expect([...y(2)][0]).toBeGreaterThanOrEqual([...y(1)][0] + 10);
    });

    it.each(['auto', '1', '2', '4'])(
      'draws no two overlapping labels in a dense section: line length %s',
      (length) => {
        render(<RocksmithTrackDetail chart={fast} onRemove={vi.fn()} />);
        showDegrees();
        if (length !== 'auto') {
          setLineLength(0, length);
          setLineLength(1, length);
        }
        for (const bar of barButtons()) {
          expect(labelBoxes(bar).length).toBeGreaterThan(0);
          expect(overlapping(bar)).toEqual([]);
        }
      },
    );

    it('gives the bars of a section one height, with room for its levels', () => {
      render(<RocksmithTrackDetail chart={fast} onRemove={vi.fn()} />);
      const [plain] = svgHeights();
      showDegrees();
      const [a, b, c, d] = svgHeights();
      // One level of 12 px in the sparse section, two in the dense one.
      expect([a, b]).toEqual([plain + 12, plain + 12]);
      expect([c, d]).toEqual([plain + 24, plain + 24]);
    });
  });
});

describe('Biblioteca section line length in the chart settings', () => {
  const eight = {
    ...fixtureChart(
      8,
      walking(Array.from({ length: 8 }, () => [48, 52, 55, 59])),
    ),
    id: 'b'.repeat(64),
    source: 'gp' as const,
  };
  const select = () => screen.getByLabelText(/^Compassos por linha em/);
  const lines = () => document.querySelectorAll('[data-line]').length;

  beforeEach(() => {
    vi.stubGlobal('indexedDB', new IDBFactory());
    vi.mocked(syncChartSettings).mockClear();
  });

  it('writes the choice by the first bar as a settings record, and synchronizes it', async () => {
    render(<RocksmithTrackDetail chart={eight} onRemove={vi.fn()} />);
    fireEvent.change(select(), { target: { value: '4' } });
    await waitFor(() => expect(syncChartSettings).toHaveBeenCalledTimes(1));
    const saved = await rocksmithLibrary.getSettings(eight.id);
    expect(saved?.sectionLineLengths).toEqual({ 0: 4 });
    expect(saved?.songLineLength).toBe('auto');
    // A second device pulls this record, which the settings check accepts.
    expect(parseChartSettings(saved)).toEqual(saved);
    expect(await rocksmithLibrary.listSettings()).toEqual([saved]);
    expect(lines()).toBe(2);

    fireEvent.change(select(), { target: { value: '' } });
    await waitFor(() => expect(syncChartSettings).toHaveBeenCalledTimes(2));
    expect(
      (await rocksmithLibrary.getSettings(eight.id))?.sectionLineLengths,
    ).toEqual({ 0: 'auto' });
    expect(lines()).toBe(0);
  });

  it('shows the line length of the settings, also one that a synchronization brings', async () => {
    const view = render(
      <RocksmithTrackDetail chart={eight} settingsKey={1} onRemove={vi.fn()} />,
    );
    expect(lines()).toBe(0);
    await rocksmithLibrary.applySettings({
      chartId: eight.id,
      updatedAt: '2026-10-05T10:00:00.000Z',
      songLineLength: 'auto',
      sectionLineLengths: { 0: 2 },
      groupOverride: null,
    });
    view.rerender(
      <RocksmithTrackDetail chart={eight} settingsKey={2} onRemove={vi.fn()} />,
    );
    await waitFor(() => expect(lines()).toBe(4));
    expect((select() as HTMLSelectElement).value).toBe('2');
  });

  it('does not restart playback or move the cursor when a length changes', async () => {
    render(<RocksmithTrackDetail chart={eight} onRemove={vi.fn()} />);
    fireEvent.click(document.querySelectorAll('button[data-bar]')[5]);
    const playing = state.synthChart;
    const seeks = [...state.seeks];
    const active = () =>
      [...document.querySelectorAll('button[data-bar]')]
        .filter((bar) => bar.classList.contains('border-live'))
        .map((bar) => (bar as HTMLElement).dataset.bar);
    expect(active()).toEqual(['5']);
    fireEvent.change(select(), { target: { value: '3' } });
    await waitFor(() => expect(syncChartSettings).toHaveBeenCalled());
    // The player gets the same chart object, and no seek follows the change.
    expect(state.synthChart).toBe(playing);
    expect(state.seeks).toEqual(seeks);
    expect(active()).toEqual(['5']);
  });

  describe('the control for all sections', () => {
    const all = () =>
      screen.getByLabelText('Compassos por linha de todas as seções');

    beforeEach(() => vi.mocked(confirmDialog).mockClear());

    it('offers 1 to 16 and automatic', () => {
      render(<RocksmithTrackDetail chart={eight} onRemove={vi.fn()} />);
      const values = [...(all() as HTMLSelectElement).options].map(
        (o) => o.value,
      );
      expect(values).toEqual([
        '',
        ...Array.from({ length: 16 }, (_, i) => `${i + 1}`),
      ]);
    });

    it('sets the song line length without a question when no section has a value', async () => {
      render(<RocksmithTrackDetail chart={eight} onRemove={vi.fn()} />);
      fireEvent.change(all(), { target: { value: '4' } });
      await waitFor(() => expect(syncChartSettings).toHaveBeenCalledTimes(1));
      expect(confirmDialog).not.toHaveBeenCalled();
      const saved = await rocksmithLibrary.getSettings(eight.id);
      expect(saved?.songLineLength).toBe(4);
      expect(saved?.sectionLineLengths).toEqual({});
      // A section with no value shows the song line length.
      expect((select() as HTMLSelectElement).value).toBe('4');
      expect(lines()).toBe(2);
      expect(document.querySelector('[data-own-length]')).toBeNull();
    });

    it('asks first when a section has a value, and a cancel changes nothing', async () => {
      render(<RocksmithTrackDetail chart={eight} onRemove={vi.fn()} />);
      fireEvent.change(select(), { target: { value: '2' } });
      await waitFor(() => expect(syncChartSettings).toHaveBeenCalledTimes(1));
      const before = await rocksmithLibrary.getSettings(eight.id);
      vi.mocked(confirmDialog).mockResolvedValueOnce(false);
      fireEvent.change(all(), { target: { value: '6' } });
      await waitFor(() => expect(confirmDialog).toHaveBeenCalledTimes(1));
      await Promise.resolve();
      expect(await rocksmithLibrary.getSettings(eight.id)).toEqual(before);
      expect(syncChartSettings).toHaveBeenCalledTimes(1);
      expect((all() as HTMLSelectElement).value).toBe('');
      expect((select() as HTMLSelectElement).value).toBe('2');
    });

    it('on a yes writes one record with the song value and no section value', async () => {
      render(<RocksmithTrackDetail chart={eight} onRemove={vi.fn()} />);
      fireEvent.change(select(), { target: { value: '2' } });
      await waitFor(() => expect(syncChartSettings).toHaveBeenCalledTimes(1));
      fireEvent.change(all(), { target: { value: '6' } });
      await waitFor(() => expect(syncChartSettings).toHaveBeenCalledTimes(2));
      const saved = await rocksmithLibrary.getSettings(eight.id);
      expect(saved?.songLineLength).toBe(6);
      expect(saved?.sectionLineLengths).toEqual({});
      expect(await rocksmithLibrary.listSettings()).toEqual([saved]);
      expect((select() as HTMLSelectElement).value).toBe('6');
    });

    it('marks a section with its own value, and a control removes it', async () => {
      render(<RocksmithTrackDetail chart={eight} onRemove={vi.fn()} />);
      fireEvent.change(all(), { target: { value: '4' } });
      await waitFor(() => expect(syncChartSettings).toHaveBeenCalledTimes(1));
      fireEvent.change(select(), { target: { value: '2' } });
      await waitFor(() => expect(syncChartSettings).toHaveBeenCalledTimes(2));
      // The change applies to that section only.
      expect(
        (await rocksmithLibrary.getSettings(eight.id))?.songLineLength,
      ).toBe(4);
      expect(document.querySelector('[data-own-length]')).not.toBeNull();
      fireEvent.click(
        screen.getByLabelText(/^Usar o valor de todas as seções em/),
      );
      await waitFor(() => expect(syncChartSettings).toHaveBeenCalledTimes(3));
      expect(document.querySelector('[data-own-length]')).toBeNull();
      const saved = await rocksmithLibrary.getSettings(eight.id);
      expect(saved?.sectionLineLengths).toEqual({});
      expect((select() as HTMLSelectElement).value).toBe('4');
    });
  });
});

describe('Biblioteca kick row under the bass tab', () => {
  const summary = (c: Chart): ChartSummary => summarizeChart(c);
  const drums = async (bassId: string, id?: string) => ({
    ...fixtureDrumChart(1, [
      { bar: 0, beat: 0, midi: 36 },
      { bar: 0, beat: 2, midi: 36 },
      { bar: 0, beat: 1, midi: 38 },
    ]),
    id: id ?? (await partChartId(bassId, 'drums')),
  });
  beforeEach(() => {
    vi.stubGlobal('indexedDB', new IDBFactory());
  });

  it('shows the kick at the beat of each hit when the drum chart is from the same file', async () => {
    const drum = await drums(chart.id);
    await rocksmithLibrary.save(drum, null);
    const { container } = render(
      <RocksmithTrackDetail
        chart={chart}
        songCharts={[summary(drum)]}
        onRemove={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(container.querySelector('[data-kick-row]')).toBeTruthy(),
    );
    const beats = [...container.querySelectorAll('[data-kick-beat]')].map(
      (c) => [c.getAttribute('data-kick-beat'), c.getAttribute('cx')],
    );
    expect(beats).toEqual([
      ['0', String(beatMarkX(0, 34))],
      ['2', String(beatMarkX(2, 34))],
    ]);
  });

  it('shows no kick row with a drum chart from another file', async () => {
    const other = await drums(chart.id, 'another-file-drums');
    await rocksmithLibrary.save(other, null);
    const { container } = render(
      <RocksmithTrackDetail
        chart={chart}
        songCharts={[summary(other)]}
        onRemove={vi.fn()}
      />,
    );
    await new Promise((r) => setTimeout(r, 30));
    expect(container.querySelector('[data-kick-row]')).toBeNull();
  });

  it('shows no kick row in the bass part of a file with no drums', async () => {
    const { container } = render(
      <RocksmithTrackDetail chart={chart} onRemove={vi.fn()} />,
    );
    await new Promise((r) => setTimeout(r, 30));
    expect(container.querySelector('[data-bar]')).toBeTruthy();
    expect(container.querySelector('[data-kick-row]')).toBeNull();
  });

  it('puts each kick at the beat of the bumbo mark of the drum grid, in each bar', async () => {
    const two = {
      ...fixtureChart(
        2,
        walking([
          [48, 52, 55, 59],
          [43, 47, 50, 55],
        ]),
      ),
      source: 'gp' as const,
    };
    const drum = {
      ...fixtureDrumChart(2, [
        { bar: 0, beat: 0, midi: 36 },
        { bar: 0, beat: 2, midi: 36 },
        { bar: 0, beat: 2.5, midi: 36 },
        { bar: 0, beat: 1, midi: 38 },
        { bar: 1, beat: 1, midi: 36 },
        { bar: 1, beat: 3, midi: 36 },
      ]),
      id: await partChartId(two.id, 'drums'),
    };
    await rocksmithLibrary.save(drum, null);
    const { container } = render(
      <RocksmithTrackDetail
        chart={two}
        songCharts={[summary(drum)]}
        onRemove={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(container.querySelector('[data-kick-row]')).toBeTruthy(),
    );
    const grid = drumGridMarksByBar(drum).map((marks) =>
      marks.filter((m) => m.row === 'bumbo').map((m) => m.beat),
    );
    expect(grid).toEqual([
      [0, 2, 2.5],
      [1, 3],
    ]);
    grid.forEach((beats, bar) => {
      const circles = [
        ...container.querySelectorAll(`[data-bar="${bar}"] [data-kick-beat]`),
      ];
      expect(
        circles.map((c) => Number(c.getAttribute('data-kick-beat'))),
      ).toEqual(beats);
      const width = Number(
        container
          .querySelector(`[data-bar="${bar}"]`)
          ?.getAttribute('data-beat-width'),
      );
      expect(circles.map((c) => Number(c.getAttribute('cx')))).toEqual(
        beats.map((beat) => beatMarkX(beat, width)),
      );
    });
  });

  it('draws the kicks of a repeat bar, each bar with its own', async () => {
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
    const A = [48, 52, 55, 59];
    const B = [43, 47, 50, 55];
    const same = {
      ...fixtureChart(4, walking([A, B, A, B])),
      source: 'gp' as const,
    };
    const drum = {
      ...fixtureDrumChart(4, [
        { bar: 0, beat: 0, midi: 36 },
        { bar: 1, beat: 0, midi: 36 },
        { bar: 2, beat: 1, midi: 36 },
        { bar: 2, beat: 3, midi: 36 },
        { bar: 3, beat: 2, midi: 36 },
      ]),
      id: await partChartId(same.id, 'drums'),
    };
    await rocksmithLibrary.save(drum, null);
    const { container } = render(
      <RocksmithTrackDetail
        chart={same}
        songCharts={[summary(drum)]}
        onRemove={vi.fn()}
      />,
    );
    const marks = screen.getByLabelText(
      'Marcar repetições',
    ) as HTMLInputElement;
    if (!marks.checked) fireEvent.click(marks);
    // Let the stored settings load first, or they replace the change.
    await new Promise((r) => setTimeout(r, 30));
    fireEvent.change(screen.getByLabelText(/^Compassos por linha em/), {
      target: { value: '2' },
    });
    await waitFor(() =>
      expect(container.querySelector('[data-kick-row]')).toBeTruthy(),
    );
    await waitFor(() =>
      expect(
        (container.querySelector('[data-bar="2"]') as HTMLElement).title,
      ).toContain('igual ao compasso'),
    );
    expect(
      (container.querySelector('[data-bar="3"]') as HTMLElement).title,
    ).toContain('igual ao compasso');
    const beatsOf = (bar: number) =>
      [
        ...container.querySelectorAll(`[data-bar="${bar}"] [data-kick-beat]`),
      ].map((c) => Number(c.getAttribute('data-kick-beat')));
    expect([0, 1, 2, 3].map(beatsOf)).toEqual([[0], [0], [1, 3], [2]]);
  });

  it('names the kicks in the label of the bar', async () => {
    const drum = await drums(chart.id);
    await rocksmithLibrary.save(drum, null);
    const { container } = render(
      <RocksmithTrackDetail
        chart={chart}
        songCharts={[summary(drum)]}
        onRemove={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(container.querySelector('[data-kick-row]')).toBeTruthy(),
    );
    expect(
      container.querySelector('[data-bar="0"] svg')?.getAttribute('aria-label'),
    ).toContain('Bumbo no tempo 1, 3');
  });

  it('shows the kick row although the song grouping lists no drum chart of the file', async () => {
    const drum = await drums(chart.id);
    await rocksmithLibrary.save(drum, null);
    const other = await drums(chart.id, 'other-song-drums');
    const { container } = render(
      <RocksmithTrackDetail
        chart={chart}
        songCharts={[summary(other)]}
        onRemove={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(container.querySelector('[data-kick-row]')).toBeTruthy(),
    );
  });

  it('keeps a kick row in every bar, at one height, when only one bar has a kick', async () => {
    const two = {
      ...fixtureChart(
        2,
        walking([
          [48, 52, 55, 59],
          [43, 47, 50, 55],
        ]),
      ),
      source: 'gp' as const,
    };
    const drum = {
      ...fixtureDrumChart(2, [{ bar: 0, beat: 0, midi: 36 }]),
      id: await partChartId(two.id, 'drums'),
    };
    await rocksmithLibrary.save(drum, null);
    const { container } = render(
      <RocksmithTrackDetail
        chart={two}
        songCharts={[summary(drum)]}
        onRemove={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(container.querySelector('[data-kick-row]')).toBeTruthy(),
    );
    const bars = [...container.querySelectorAll('[data-bar]')];
    expect(bars.length).toBe(2);
    bars.forEach((bar) =>
      expect(bar.querySelector('[data-kick-row]')).toBeTruthy(),
    );
    expect(container.querySelectorAll('[data-kick-beat]').length).toBe(1);
    const heights = bars.map((bar) =>
      bar.querySelector('svg')?.getAttribute('height'),
    );
    expect(heights[0]).toBeTruthy();
    expect(heights[1]).toBe(heights[0]);
  });
});
