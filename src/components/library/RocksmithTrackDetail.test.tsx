// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import RocksmithTrackDetail from '@/components/library/RocksmithTrackDetail';
import { fixtureChart, walking } from '@/domain/bassChartFixture';
import type { BassChart } from '@/domain/bassChart';

const state = vi.hoisted(() => ({
  audio: { status: 'missing' } as { status: string; url?: string },
  synthChart: null as BassChart | null,
  seeks: [] as number[],
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

  it('narrows the beats before it shortens the line, at one type size', () => {
    render(<RocksmithTrackDetail chart={mixed} onRemove={vi.fn()} />);
    const automatic = typeSizes();
    // 7 bars do not fit at the base width (152 px), but do at 0.8 of it.
    setLineLength('7');
    expect(widths().slice(0, 3)).toEqual([139.375, 139.375, 139.375]);
    expect(139.375 * 7 + 4 * 6).toBeLessThanOrEqual(LINE_WIDTH);
    expect(139.375 * 7 + 4 * 6).toBeGreaterThan(LINE_WIDTH - 1);
    expect(typeSizes()).toEqual(automatic);
    // 8 do not: the line length falls to 4.
    setLineLength('8');
    expect(widths()[0]).toBe(247);
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
    // 8 bars do not fit: the line length falls to 4, and still does not wrap.
    setLineLength('8');
    expect(barsOfLines()).toEqual([
      [0, 1, 2, 3],
      [4, 5, 6, 7],
    ]);
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

  it('falls to a divisor of the line length when the need does not fit', () => {
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
    // 6 bars of 68.8 px beats need 6 × 291 px: only 3 fit. 6 falls to 3, and
    // the 3 bars share the line: (1000 - 8 - 48) / 12 beats.
    expect(new Set(beatWidths())).toEqual(new Set([78.65625]));
    expect(78.65625).toBeGreaterThanOrEqual(68.8);
  });
});
