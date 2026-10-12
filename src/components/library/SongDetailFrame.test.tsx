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

function Part({ settingsKey }: { settingsKey?: unknown }) {
  // A seek moves the clock, as the transport of a real player does.
  const [currentSeconds, setCurrentSeconds] = useState(0);
  const audio = {
    ready: true,
    playing: false,
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
});
