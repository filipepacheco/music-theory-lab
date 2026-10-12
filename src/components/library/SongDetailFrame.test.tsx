// @vitest-environment happy-dom
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { IDBFactory } from 'fake-indexeddb';
import SongDetailFrame, {
  songStats,
  type LineStart,
} from '@/components/library/SongDetailFrame';
import { useSongCursor } from '@/components/library/useSongCursor';
import { confirmDialog } from '@/services/confirm';
import { fixtureDrumChart, type HitSpec } from '@/domain/drumChartFixture';
import type { LabelLane } from '@/domain/bassChart';

// The frame with a part that is not the bass: a drum chart, which has hits
// and no bass notes, and a bar that is one plain button. The frame must lay
// the bars out, hold the line lengths, mark the repeats and move the cursor
// with no control of the bass.

const state = vi.hoisted(() => ({ seeks: [] as number[] }));
vi.mock('@/services/confirm', () => ({
  confirmDialog: vi.fn(() => Promise.resolve(true)),
}));
vi.mock('@/services/chartSettingsSync', () => ({
  syncChartSettings: vi.fn(() => Promise.resolve()),
}));

const LINE_WIDTH = 1000;
const BASE_BEAT_WIDTH = 20;
const BAR_CHROME = 10;
const NO_LANES: LabelLane[] = [];

/**
 * Ten bars: an intro of two bars with no hit, then a verse of eight bars with
 * a kick on beat 1 and a snare on beat 3; the last bar has one more snare.
 */
const specs: HitSpec[] = [
  ...Array.from({ length: 8 }, (_, i) => [
    { bar: i + 2, beat: 0, midi: 36 },
    { bar: i + 2, beat: 2, midi: 38 },
  ]).flat(),
  { bar: 9, beat: 3, midi: 38 },
];
const chart = fixtureDrumChart(10, specs, [
  { name: 'intro', parts: 1, startBar: 0, endBar: 2 },
  { name: 'verse', parts: 1, startBar: 2, endBar: 10 },
]);
const filledBars = new Set(chart.hits.map((hit) => hit.bar));
const barLanes = () => NO_LANES;
const barDrawing = (bar: number): string | null => {
  const cells = chart.hits
    .filter((hit) => hit.bar === bar)
    .map((hit) => `${hit.piece}@${hit.beatInBar}`);
  return cells.length > 0 ? cells.join(',') : null;
};
const sectionLayout = () => null;
const LINE_START_WIDTH = 50;
/** What a part with rows draws at the start of each line of bars. */
const rowLabels: LineStart<null> = {
  width: LINE_START_WIDTH,
  render: () => <span data-row-names>Peças</span>,
};

function Part({
  settingsKey,
  playing = false,
  lineStart,
}: {
  settingsKey?: unknown;
  playing?: boolean;
  lineStart?: LineStart<null>;
}) {
  // A seek moves the clock, as the transport of a real player does.
  const [currentSeconds, setCurrentSeconds] = useState(0);
  const audio = {
    ready: true,
    playing,
    duration: chart.songLengthSeconds,
    currentSeconds,
    play: () => Promise.resolve(),
    pause: () => {},
    seek: (seconds: number) => {
      state.seeks.push(seconds);
      setCurrentSeconds(seconds);
    },
  };
  const cursor = useSongCursor(chart, audio, true);
  return (
    <SongDetailFrame
      chart={chart}
      chartId={chart.id}
      settingsKey={settingsKey}
      onRemove={vi.fn()}
      sourceNote="Parte de teste"
      stats={songStats(chart)}
      audio={audio}
      hasPlayer
      recording={{
        state: { status: 'missing' },
        saveError: false,
        onAttach: () => Promise.resolve(),
        missingNote: 'Nenhuma gravação vinculada.',
      }}
      cursor={cursor}
      chartHeading="Grade por seção"
      filledBars={filledBars}
      baseBeatWidth={BASE_BEAT_WIDTH}
      barChrome={BAR_CHROME}
      labelGap={4}
      barLanes={barLanes}
      barDrawing={barDrawing}
      sectionLayout={sectionLayout}
      renderBar={(barIndex, layout) => (
        <button
          key={barIndex}
          type="button"
          data-bar={barIndex}
          data-beat-width={layout.beatWidth}
          data-repeat-of={layout.repeatOf}
          data-active={barIndex === cursor.activeBar}
          data-playhead={cursor.playhead(barIndex) ?? ''}
          onClick={() => cursor.seek?.(chart.bars[barIndex].startTime)}
        >
          {barIndex + 1}
        </button>
      )}
      lineStart={lineStart}
      legend="Cada linha é uma peça."
      dock={{
        label: 'Painel da parte',
        title: 'Título do painel',
        status: 'Estado do painel',
        actions: null,
        panel: <div data-part-panel />,
        showLabel: 'Mostrar painel',
        hideLabel: 'Recolher painel',
      }}
    />
  );
}

const bars = () => [
  ...document.querySelectorAll<HTMLButtonElement>('button[data-bar]'),
];
const lines = () => [...document.querySelectorAll<HTMLElement>('[data-line]')];
const barsOfLines = () =>
  lines().map((line) =>
    [...line.querySelectorAll<HTMLElement>('button[data-bar]')].map((bar) =>
      Number(bar.dataset.bar),
    ),
  );
const wrapping = () =>
  lines().filter((line) => line.classList.contains('flex-wrap'));
const verseLength = () =>
  screen.getByLabelText('Compassos por linha em Verso') as HTMLSelectElement;
const introLength = () =>
  screen.getByLabelText('Compassos por linha em Intro') as HTMLSelectElement;
const allLengths = () =>
  screen.getByLabelText(
    'Compassos por linha de todas as seções',
  ) as HTMLSelectElement;

/** A line that the frame can measure: `LINE_WIDTH` pixels wide. */
function measuredLines() {
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
}

beforeEach(() => {
  state.seeks = [];
  localStorage.clear();
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.mocked(confirmDialog).mockClear();
  measuredLines();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('frame of the song detail', () => {
  it('shows the song, the stats of any chart, and the sections', () => {
    render(<Part />);
    expect(screen.getByRole('heading', { name: 'Test' })).toBeTruthy();
    expect(screen.getByText('Parte de teste')).toBeTruthy();
    expect(
      screen.getByRole('heading', { name: 'Grade por seção' }),
    ).toBeTruthy();
    expect(
      [...document.querySelectorAll('dt')].map((term) => term.textContent),
    ).toEqual(['Andamento', 'Compasso', 'Duração', 'Compassos']);
    expect(
      [...document.querySelectorAll('dd')].map((value) => value.textContent),
    ).toEqual(['~120 bpm', '4/4', '0:20', '10']);
    expect(screen.getByText('Intro')).toBeTruthy();
    expect(screen.getByText('Verso')).toBeTruthy();
    expect(screen.getByText(/· 8 compassos/)).toBeTruthy();
    // The two bars of the intro that the part does not fill are one rest.
    expect(screen.getByText('Pausa ×2')).toBeTruthy();
    expect(screen.getByText('compassos 1–2')).toBeTruthy();
    expect(bars().map((bar) => Number(bar.dataset.bar))).toEqual([
      2, 3, 4, 5, 6, 7, 8, 9,
    ]);
    expect(screen.getByText(/Cada linha é uma peça\./)).toBeTruthy();
  });

  it('holds no control of the bass', () => {
    render(<Part />);
    for (const text of [
      /Afinação/,
      /Transpor/,
      /Digitação/,
      /Mostrar graus/,
      /Tom para análise/,
      /Mixagem/,
      /Braço/,
      /Ciclo/,
      /Notas/,
      /corda/i,
      /casa/i,
      /baixo/i,
      /bumbo/i,
    ]) {
      expect(screen.queryByText(text)).toBeNull();
    }
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(screen.queryByRole('group')).toBeNull();
    // The tab and the fretboard draw their numbers and names in an SVG; the
    // frame draws only the icons of the player.
    expect(document.querySelector('svg text')).toBeNull();
    // The options of the frame: the line length, the follow, the repeats.
    expect(
      [...document.querySelectorAll('input[type="checkbox"]')].map(
        (input) => input.parentElement?.textContent,
      ),
    ).toEqual(['Acompanhar a reprodução', 'Marcar repetições']);
    expect(
      [...document.querySelectorAll('select')].map((select) =>
        select.getAttribute('aria-label'),
      ),
    ).toEqual([
      'Compassos por linha de todas as seções',
      'Compassos por linha em Intro',
      'Compassos por linha em Verso',
    ]);
  });

  it('names the dock and its button from the part', () => {
    render(<Part />);
    const dock = screen.getByRole('region', { name: 'Painel da parte' });
    expect(within(dock).getByText('Título do painel')).toBeTruthy();
    expect(within(dock).getByText('Estado do painel')).toBeTruthy();
    expect(dock.querySelector('[data-part-panel]')).not.toBeNull();
    fireEvent.click(within(dock).getByText('Recolher painel'));
    expect(dock.querySelector('[data-part-panel]')).toBeNull();
    expect(within(dock).getByText('Mostrar painel')).toBeTruthy();
  });

  it('shows the linked recording with the note of the part', () => {
    render(<Part />);
    expect(screen.getByText('Nenhuma gravação vinculada.')).toBeTruthy();
    expect(screen.getByText('Vincular áudio')).toBeTruthy();
  });

  it('wraps the bars of a section in the automatic layout', () => {
    render(<Part />);
    expect(lines()).toEqual([]);
    expect(bars()[0].parentElement?.classList.contains('flex-wrap')).toBe(true);
    expect(new Set(bars().map((bar) => bar.dataset.beatWidth))).toEqual(
      new Set([String(BASE_BEAT_WIDTH)]),
    );
  });

  it('keeps a set line length: each line has exactly the chosen bars', () => {
    render(<Part />);
    fireEvent.change(verseLength(), { target: { value: '4' } });
    expect(barsOfLines()).toEqual([
      [2, 3, 4, 5],
      [6, 7, 8, 9],
    ]);
    // A measured row has no flex wrap.
    expect(wrapping()).toEqual([]);
    // (1000 - 3 gaps of 4 - 4 × 10 of chrome) / 16 beats, in 1/64 px.
    expect(new Set(bars().map((bar) => bar.dataset.beatWidth))).toEqual(
      new Set(['59.25']),
    );
    // No divisor rule: three bars to a line leave a last line of two.
    fireEvent.change(verseLength(), { target: { value: '3' } });
    expect(barsOfLines()).toEqual([
      [2, 3, 4],
      [5, 6, 7],
      [8, 9],
    ]);
    expect(wrapping()).toEqual([]);
    // Eight bars narrow the beats, and the line length still holds.
    fireEvent.change(verseLength(), { target: { value: '8' } });
    expect(barsOfLines()).toEqual([[2, 3, 4, 5, 6, 7, 8, 9]]);
    expect(wrapping()).toEqual([]);
    expect(Number(bars()[0].dataset.beatWidth)).toBeLessThan(
      BASE_BEAT_WIDTH * 2,
    );
    fireEvent.change(verseLength(), { target: { value: '' } });
    expect(lines()).toEqual([]);
  });

  it('wraps a line of a set length until the line is measured', () => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      },
    );
    render(<Part />);
    fireEvent.change(verseLength(), { target: { value: '4' } });
    expect(lines().length).toBe(2);
    expect(wrapping().length).toBe(2);
    expect(bars()[0].dataset.beatWidth).toBe(String(BASE_BEAT_WIDTH));
  });

  it('sets the line length of all sections, and marks a section with its own', async () => {
    render(<Part />);
    fireEvent.change(allLengths(), { target: { value: '4' } });
    await waitFor(() => expect(verseLength().value).toBe('4'));
    expect(introLength().value).toBe('4');
    // The intro is one rest on one line; the verse has two lines of four.
    expect(barsOfLines()).toEqual([[], [2, 3, 4, 5], [6, 7, 8, 9]]);
    expect(confirmDialog).not.toHaveBeenCalled();
    expect(document.querySelectorAll('[data-own-length]').length).toBe(0);

    fireEvent.change(verseLength(), { target: { value: '2' } });
    await waitFor(() =>
      expect(document.querySelectorAll('[data-own-length]').length).toBe(1),
    );
    expect(barsOfLines().slice(1)).toEqual([
      [2, 3],
      [4, 5],
      [6, 7],
      [8, 9],
    ]);
    // A section has its own value: the control for all asks first.
    fireEvent.change(allLengths(), { target: { value: '8' } });
    await waitFor(() => expect(verseLength().value).toBe('8'));
    expect(confirmDialog).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll('[data-own-length]').length).toBe(0);
    expect(barsOfLines().slice(1)).toEqual([[2, 3, 4, 5, 6, 7, 8, 9]]);
  });

  it('gives a bar the bar above that draws the same, under a line length', () => {
    render(<Part />);
    const repeats = () =>
      bars()
        .filter((bar) => bar.dataset.repeatOf !== undefined)
        .map((bar) => [Number(bar.dataset.bar), Number(bar.dataset.repeatOf)]);
    fireEvent.change(verseLength(), { target: { value: '4' } });
    // The repeats are drawn in full until the musician asks for the marks.
    expect(repeats()).toEqual([]);
    fireEvent.click(screen.getByLabelText('Marcar repetições'));
    // The last bar has one more hit than the bar above it.
    expect(repeats()).toEqual([
      [6, 2],
      [7, 3],
      [8, 4],
    ]);
    expect(localStorage.getItem('music-theory-lab:mark-repeats')).toBe('true');
    // "Above" means nothing in the automatic layout.
    fireEvent.change(verseLength(), { target: { value: '' } });
    expect(repeats()).toEqual([]);
  });

  it('moves the cursor to a clicked bar, and to the first bar of a rest', () => {
    render(<Part />);
    const active = () =>
      bars()
        .filter((bar) => bar.dataset.active === 'true')
        .map((bar) => Number(bar.dataset.bar));
    const heading = (name: string) => screen.getByText(name);
    expect(active()).toEqual([]);
    expect(heading('Verso').classList.contains('text-text-primary')).toBe(
      false,
    );

    fireEvent.click(bars()[3]);
    expect(state.seeks).toEqual([chart.bars[5].startTime]);
    expect(active()).toEqual([5]);
    expect(bars()[3].dataset.playhead).toBe('0');
    // The frame marks the section of the cursor.
    expect(heading('Verso').classList.contains('text-text-primary')).toBe(true);
    expect(heading('Intro').classList.contains('text-text-primary')).toBe(
      false,
    );

    // The cursor holds when the line length changes.
    fireEvent.change(verseLength(), { target: { value: '4' } });
    expect(active()).toEqual([5]);
    expect(state.seeks).toEqual([chart.bars[5].startTime]);

    // A seek to the start of the song leaves the clock at zero: no cursor.
    fireEvent.click(screen.getByText('Pausa ×2'));
    expect(state.seeks).toEqual([
      chart.bars[5].startTime,
      chart.bars[0].startTime,
    ]);
    expect(
      screen.getByText(/Clique num compasso para saltar a reprodução/),
    ).toBeTruthy();
  });

  it('scrolls to the bar under the playhead while the song plays', () => {
    // The bar is 100 px tall at 600 px; the dock starts at 700 px, and the
    // page has no header. The middle of the bar goes to the middle of the
    // room above the dock: 650 - 350.
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      },
    );
    const rect = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        if (this.dataset.bar !== undefined)
          return { top: 600, height: 100 } as DOMRect;
        return { top: 700, height: 0, width: 0 } as DOMRect;
      });
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    try {
      const { unmount } = render(<Part playing />);
      // The playhead starts in the rest of the intro, which is not a bar.
      expect(scrollTo).not.toHaveBeenCalled();
      fireEvent.click(bars()[2]);
      expect(state.seeks).toEqual([chart.bars[4].startTime]);
      expect(scrollTo).toHaveBeenCalledTimes(1);
      expect(scrollTo).toHaveBeenLastCalledWith({
        top: 300,
        behavior: 'smooth',
      });
      // The musician turns the follow off: the page stays where it is.
      fireEvent.click(screen.getByLabelText('Acompanhar a reprodução'));
      fireEvent.click(bars()[5]);
      expect(state.seeks).toHaveLength(2);
      expect(scrollTo).toHaveBeenCalledTimes(1);
      unmount();

      // A song that does not play does not move the page.
      state.seeks = [];
      render(<Part />);
      fireEvent.click(bars()[2]);
      expect(state.seeks).toEqual([chart.bars[4].startTime]);
      expect(scrollTo).toHaveBeenCalledTimes(1);
    } finally {
      rect.mockRestore();
      scrollTo.mockRestore();
    }
  });

  it('draws nothing at the start of a line for a part that gives no line start', () => {
    render(<Part />);
    fireEvent.change(verseLength(), { target: { value: '4' } });
    expect(document.querySelector('[data-line-start]')).toBeNull();
    expect(lines().every((line) => line.style.paddingLeft === '')).toBe(true);
  });

  it('draws the line start of the part at the start of each line of a set length', async () => {
    render(<Part lineStart={rowLabels} />);
    fireEvent.change(allLengths(), { target: { value: '4' } });
    await waitFor(() => expect(lines()).toHaveLength(3));
    const starts = lines().map((line) => line.firstElementChild as HTMLElement);
    expect(starts.every((start) => 'lineStart' in start.dataset)).toBe(true);
    expect(starts.map((start) => start.style.width)).toEqual([
      '50px',
      '50px',
      '50px',
    ]);
    // The line of the intro holds only a rest: it keeps the room, so its
    // rest starts where the bars start, and it has nothing to name.
    expect(starts.map((start) => start.textContent)).toEqual([
      '',
      'Peças',
      'Peças',
    ]);
    expect(barsOfLines()).toEqual([[], [2, 3, 4, 5], [6, 7, 8, 9]]);
    // The bars share what the line start leaves:
    // (1000 - 50 - 4 - 3 gaps of 4 - 4 × 10 of chrome) / 16 beats.
    expect(new Set(bars().map((bar) => bar.dataset.beatWidth))).toEqual(
      new Set(['55.875']),
    );
  });

  it('draws the line start of the part at each line that the browser wraps', () => {
    // The browser puts bars 3 to 6 on a first line and 7 to 10 on a second.
    const offsetTop = vi
      .spyOn(HTMLElement.prototype, 'offsetTop', 'get')
      .mockImplementation(function (this: HTMLElement) {
        return Number(this.dataset.bar) >= 6 ? 80 : 0;
      });
    try {
      render(<Part lineStart={rowLabels} />);
      expect(lines()).toEqual([]);
      const starts = [
        ...document.querySelectorAll<HTMLElement>('[data-line-start]'),
      ];
      // The intro is one rest, with no bar: it has no line start.
      expect(starts.map((start) => start.style.top)).toEqual(['0px', '80px']);
      expect(starts.map((start) => start.textContent)).toEqual([
        'Peças',
        'Peças',
      ]);
      const wrap = bars()[0].parentElement as HTMLElement;
      expect(starts.every((start) => start.parentElement === wrap)).toBe(true);
      // The bars start after the room of the line start and one gap.
      expect(wrap.style.paddingLeft).toBe('54px');
      expect(wrap.classList.contains('flex-wrap')).toBe(true);
    } finally {
      offsetTop.mockRestore();
    }
  });
});
