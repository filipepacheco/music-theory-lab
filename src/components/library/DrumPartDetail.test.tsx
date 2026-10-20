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
import DrumPartDetail from '@/components/library/DrumPartDetail';
import { fixtureDrumChart, type HitSpec } from '@/domain/drumChartFixture';
import { rocksmithLibrary } from '@/services/rocksmithLibrary';

const state = vi.hoisted(() => ({
  recording: null as string | null,
  seeks: [] as number[],
  sampleSeeks: [] as number[],
  sampleEnabled: [] as boolean[],
}));
vi.mock('@/services/confirm', () => ({
  confirmDialog: vi.fn(() => Promise.resolve(true)),
}));
vi.mock('@/services/chartSettingsSync', () => ({
  syncChartSettings: vi.fn(() => Promise.resolve()),
}));
vi.mock('@/hooks/useRocksmithAudio', () => ({
  useRocksmithAudio: () => ({
    audioState: state.recording
      ? {
          status: 'ready',
          url: 'blob:recording',
          origin: 'local',
          fileName: state.recording,
          playable: true,
        }
      : { status: 'missing' },
    attach: vi.fn(),
    saveError: false,
  }),
}));
vi.mock('@/components/library/useLibraryAudio', () => ({
  useLibraryAudio: (url: string | null) => {
    const [currentSeconds, setCurrentSeconds] = useState(0);
    return {
      ready: url !== null,
      playing: false,
      duration: 20,
      currentSeconds,
      play: () => Promise.resolve(),
      pause: () => {},
      seek: (seconds: number) => {
        state.seeks.push(seconds);
        setCurrentSeconds(seconds);
      },
    };
  },
}));

vi.mock('@/hooks/useDrumSamplePlayback', () => ({
  useDrumSamplePlayback: (_chart: unknown, enabled: boolean) => {
    state.sampleEnabled.push(enabled);
    const [currentSeconds, setCurrentSeconds] = useState(0);
    return {
      ready: enabled,
      playing: false,
      duration: 20,
      currentSeconds,
      play: () => Promise.resolve(),
      pause: () => {},
      seek: (seconds: number) => {
        state.sampleSeeks.push(seconds);
        setCurrentSeconds(seconds);
      },
    };
  },
}));

const KICK = 36;
const SNARE = 38;
const CLOSED_HAT = 42;
const OPEN_HAT = 46;
const HIGH_TOM = 48;
const FLOOR_TOM = 41;
const CRASH = 49;

const groove = (bar: number): HitSpec[] => [
  ...Array.from({ length: 8 }, (_, i) => ({
    bar,
    beat: i / 2,
    midi: CLOSED_HAT,
  })),
  { bar, beat: 0, midi: KICK },
  { bar, beat: 2, midi: KICK },
  { bar, beat: 1, midi: SNARE },
  { bar, beat: 3, midi: SNARE },
];

const specs: HitSpec[] = [
  { bar: 2, beat: 0, midi: CRASH, dynamic: 'accent' },
  { bar: 2, beat: 0, midi: KICK, dynamic: 'accent' },
  { bar: 2, beat: 1, midi: SNARE },
  { bar: 2, beat: 1.5, midi: SNARE, dynamic: 'ghost' },
  { bar: 2, beat: 2, midi: CLOSED_HAT, dynamic: 'ghost' },
  { bar: 2, beat: 3, midi: CLOSED_HAT },
  { bar: 2, beat: 3.5, midi: OPEN_HAT },
  ...[3, 4, 5, 6, 7, 8].flatMap(groove),
  { bar: 9, beat: 0, midi: HIGH_TOM },
  { bar: 9, beat: 1, midi: HIGH_TOM },
  { bar: 9, beat: 2, midi: FLOOR_TOM },
  { bar: 9, beat: 3, midi: FLOOR_TOM },
];
const sections = [
  { name: 'intro', parts: 1, startBar: 0, endBar: 2 },
  { name: 'verse', parts: 1, startBar: 2, endBar: 10 },
];
const chart = fixtureDrumChart(10, specs, sections);

const SLOW = { timeout: 5000 };
const ROWS = ['pratos', 'chimbal', 'toms', 'caixa', 'surdo', 'bumbo'];
const LABELS = ['Pratos', 'Chimbal', 'Tons', 'Caixa', 'Surdo', 'Bumbo'];

const bars = () => [
  ...document.querySelectorAll<HTMLButtonElement>('button[data-bar]'),
];
const bar = (index: number) =>
  document.querySelector<HTMLButtonElement>(
    `button[data-bar="${index}"]`,
  ) as HTMLButtonElement;
const lines = () => [...document.querySelectorAll<HTMLElement>('[data-line]')];
const rowsOf = (element: Element) =>
  [...element.querySelectorAll('line[data-row]')].map((line) =>
    line.getAttribute('data-row'),
  );
const labelsOf = (element: Element) =>
  [...element.querySelectorAll('[role="listitem"]')].map(
    (item) => item.textContent,
  );
const mark = (barIndex: number, row: string, beat: number) =>
  bar(barIndex).querySelector(
    `[data-mark="${row}"][data-beat="${beat}"]`,
  ) as SVGGElement;
const verseLength = () =>
  screen.getByLabelText('Compassos por linha em Verso') as HTMLSelectElement;
const allLengths = () =>
  screen.getByLabelText(
    'Compassos por linha de todas as seções',
  ) as HTMLSelectElement;

beforeEach(() => {
  state.recording = null;
  state.seeks = [];
  state.sampleSeeks = [];
  state.sampleEnabled = [];
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

function renderPart(of = chart, onRemove = vi.fn()) {
  render(<DrumPartDetail chart={of} onRemove={onRemove} />);
  return onRemove;
}

describe('drum part of the song detail', () => {
  it('explains grouped drum rows and fills without hover', () => {
    renderPart();
    expect(screen.getByText(/Pratos de ataque e de condução/)).toBeTruthy();
    expect(screen.getByText(/Tons agudo e médio/)).toBeTruthy();
    expect(
      screen.getByText(/Virada: este compasso foge do groove da seção/),
    ).toBeTruthy();
  });
  it('shows the song, the stats, and the sections of the drum chart', () => {
    renderPart();
    expect(screen.getByRole('heading', { name: 'Test' })).toBeTruthy();
    expect(screen.getByText('Bateria importada de test.gp')).toBeTruthy();
    expect(
      screen.getByRole('heading', { name: 'Grade da bateria por seção' }),
    ).toBeTruthy();
    expect(
      [...document.querySelectorAll('dt')]
        .slice(0, 5)
        .map((term) => term.textContent),
    ).toEqual(['Andamento', 'Compasso', 'Duração', 'Compassos', 'Toques']);
    expect(screen.getByText('Toques').nextElementSibling?.textContent).toBe(
      String(chart.hits.length),
    );
    expect(screen.getByText('Intro')).toBeTruthy();
    expect(screen.getByText('Verso')).toBeTruthy();
    expect(screen.getByText('Pausa ×2')).toBeTruthy();
    expect(bars().map((item) => Number(item.dataset.bar))).toEqual([
      2, 3, 4, 5, 6, 7, 8, 9,
    ]);
  });

  it('gives each bar one row for each drum piece of the chart, from the cymbals down', () => {
    renderPart();
    for (const item of bars()) expect(rowsOf(item)).toEqual(ROWS);
    expect(
      bar(9).querySelectorAll('[data-mark="chimbal"]').length +
        bar(9).querySelectorAll('[data-mark="bumbo"]').length,
    ).toBe(0);
    expect(new Set(bars().map((item) => item.offsetHeight))).toHaveLength(1);
    expect(
      new Set(
        bars().map((item) => item.querySelector('svg')?.getAttribute('height')),
      ),
    ).toHaveLength(1);
  });

  it('keeps a simple groove compact: two pieces give two rows', () => {
    const simple = fixtureDrumChart(2, [
      { bar: 0, beat: 0, midi: KICK },
      { bar: 0, beat: 2, midi: SNARE },
      { bar: 1, beat: 0, midi: KICK },
    ]);
    renderPart(simple);
    for (const item of bars()) expect(rowsOf(item)).toEqual(['caixa', 'bumbo']);
    expect(labelsOf(document.body)).toEqual(['Caixa', 'Bumbo']);
    const height = (of: Element) =>
      Number(of.querySelector('svg')?.getAttribute('height'));
    cleanup();
    renderPart();
    expect(height(bar(2))).toBeGreaterThan(22 + 9 + 18);
  });

  it('shows the row labels, in Portuguese, at the start of each line of a set length', async () => {
    renderPart();
    fireEvent.change(allLengths(), { target: { value: '4' } });
    await waitFor(() => expect(lines()).toHaveLength(3));
    const [intro, ...verse] = lines();
    for (const line of verse) {
      const start = line.firstElementChild as HTMLElement;
      expect('lineStart' in start.dataset).toBe(true);
      expect(labelsOf(start)).toEqual(LABELS);
      expect(start.nextElementSibling?.hasAttribute('data-bar')).toBe(true);
    }
    expect(labelsOf(intro)).toEqual([]);
    const labels = verse[0].querySelector('[data-row-labels]') as HTMLElement;
    const grid = Number(bar(2).querySelector('svg')?.getAttribute('height'));
    expect(labels.style.height).toBe(`${grid + 2}px`);
  });

  it('shows the row labels at the start of each line that the browser wraps', () => {
    const offsetTop = vi
      .spyOn(HTMLElement.prototype, 'offsetTop', 'get')
      .mockImplementation(function (this: HTMLElement) {
        return Number(this.dataset.bar) >= 6 ? 140 : 0;
      });
    try {
      renderPart();
      expect(lines()).toEqual([]);
      const starts = [
        ...document.querySelectorAll<HTMLElement>('[data-line-start]'),
      ];
      expect(starts.map((start) => start.style.top)).toEqual(['0px', '140px']);
      for (const start of starts) expect(labelsOf(start)).toEqual(LABELS);
    } finally {
      offsetTop.mockRestore();
    }
  });

  it('draws a drum as a dot, a closed hi-hat as x, and an open hi-hat as o', () => {
    renderPart();
    const kick = mark(3, 'bumbo', 0);
    expect(kick.dataset.symbol).toBe('dot');
    expect(kick.querySelectorAll('circle')).toHaveLength(1);
    expect(kick.textContent).toBe('');
    expect(mark(3, 'caixa', 1).querySelectorAll('circle')).toHaveLength(1);
    expect(mark(9, 'surdo', 2).querySelectorAll('circle')).toHaveLength(1);

    const closed = mark(3, 'chimbal', 0);
    expect(closed.textContent).toBe('x');
    expect(closed.querySelector('circle')).toBeNull();

    const open = mark(2, 'chimbal', 3.5);
    expect(open.dataset.symbol).toBe('o');
    expect(open.textContent).toBe('o');
    expect(mark(2, 'chimbal', 3).textContent).toBe('x');
  });

  it('draws the crash, the ride, and each tom with a shape of its own', () => {
    renderPart();
    const crash = mark(2, 'pratos', 0);
    expect(crash.dataset.symbol).toBe('crash');
    expect(crash.querySelectorAll('path').length).toBeGreaterThan(0);
    expect(crash.textContent).not.toContain('x');

    const tom1 = mark(9, 'toms', 0);
    expect(tom1.dataset.symbol).toBe('tom1');
    expect(tom1.querySelectorAll('polygon')).toHaveLength(1);
    expect(tom1.querySelector('circle')).toBeNull();
  });

  it('draws a ghost note in parentheses, and an accent in bold under a >', () => {
    renderPart();
    const weight = (element: Element | null) =>
      element?.getAttribute('font-weight');
    const radius = (of: Element) =>
      Number(of.querySelector('circle')?.getAttribute('r'));

    const ghostHat = mark(2, 'chimbal', 2);
    expect(ghostHat.dataset.dynamic).toBe('ghost');
    expect(ghostHat.textContent).toBe('(x)');
    const ghostSnare = mark(2, 'caixa', 1.5);
    expect(ghostSnare.textContent).toBe('()');
    expect(ghostSnare.querySelectorAll('circle')).toHaveLength(1);
    const [before, after] = [...ghostSnare.querySelectorAll('text')].map(
      (text) => Number(text.getAttribute('x')),
    );
    const centre = Number(
      ghostSnare.querySelector('circle')?.getAttribute('cx'),
    );
    expect(before).toBeLessThan(centre);
    expect(after).toBeGreaterThan(centre);

    const accentCrash = mark(2, 'pratos', 0);
    expect(accentCrash.dataset.dynamic).toBe('accent');
    expect(accentCrash.textContent).toBe('>');
    // The > is above the star, and the star of an accent is bold.
    const sign = accentCrash.querySelector('text');
    const paths = accentCrash.querySelectorAll('path');
    const star = paths[paths.length - 1];
    expect(Number(sign?.getAttribute('y'))).toBeLessThan(
      Number(star?.getAttribute('d')?.split(' ')[2]),
    );
    expect(Number(star?.getAttribute('stroke-width'))).toBeGreaterThan(1.2);
    // A dot has no bold form: the dot of an accent is larger.
    const accentKick = mark(2, 'bumbo', 0);
    expect(accentKick.textContent).toBe('>');
    expect(radius(accentKick)).toBeGreaterThan(radius(mark(3, 'bumbo', 0)));

    const plain = mark(3, 'chimbal', 0);
    expect(plain.dataset.dynamic).toBe('normal');
    expect(weight(plain.querySelector('text'))).toBe('400');
    expect(mark(2, 'caixa', 1).textContent).toBe('');
  });

  it('keeps each text of a bar at 10 px or more, on the type scale', () => {
    renderPart();
    const sizes = [...document.querySelectorAll('button[data-bar] svg text')]
      .map((text) => Number(text.getAttribute('font-size')))
      .filter((size, index, all) => all.indexOf(size) === index);
    expect(sizes.length).toBeGreaterThan(0);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(10);
    expect(bar(2).querySelector('span')?.classList.contains('text-micro')).toBe(
      true,
    );
    for (const label of document.querySelectorAll('[role="listitem"]')) {
      expect(label.classList.contains('text-small')).toBe(true);
    }
    expect(document.querySelector('[class*="text-["]')).toBeNull();
  });

  it('uses the tokens of the theme for each colour of the grid', () => {
    renderPart();
    const colours = [
      ...document.querySelectorAll('button[data-bar] svg *'),
    ].flatMap((element) =>
      ['fill', 'stroke']
        .map((name) => element.getAttribute(name))
        .filter((value): value is string => value !== null),
    );
    expect(colours.length).toBeGreaterThan(0);
    for (const colour of colours) expect(colour).toMatch(/^var\(--color-/);
  });

  it('widens the beats so that two symbols of a row do not touch', () => {
    const dense = fixtureDrumChart(
      2,
      [0, 1].flatMap((item) =>
        Array.from({ length: 16 }, (_, i) => ({
          bar: item,
          beat: i / 4,
          midi: CLOSED_HAT,
        })),
      ),
    );
    renderPart(dense);
    expect(Number(bar(0).dataset.beatWidth)).toBeCloseTo(42.4);
    const xs = [...bar(0).querySelectorAll('[data-mark] text')].map((text) =>
      Number(text.getAttribute('x')),
    );
    const steps = xs.slice(1).map((x, i) => x - xs[i]);
    expect(Math.min(...steps)).toBeGreaterThanOrEqual(6.6 + 4 - 1e-6);
    cleanup();
    renderPart(fixtureDrumChart(2, [...groove(0), ...groove(1)]));
    expect(bar(0).dataset.beatWidth).toBe('34');
    cleanup();
    renderPart();
    expect(
      new Set(bars().map((item) => Number(item.dataset.beatWidth))),
    ).toEqual(new Set([34.4]));
  });

  it('has no transposition, tuning, fingering, degrees, key, fretboard, or circle of fifths', () => {
    renderPart();
    for (const text of [
      /Afinação/,
      /Transpor/,
      /Transposição/,
      /Digitação/,
      /Mostrar graus/,
      /Tom para análise/,
      /Mixagem/,
      /Braço/,
      /Ciclo/,
      /corda/i,
      /casa/i,
      /baixo/i,
    ]) {
      expect(screen.queryByText(text)).toBeNull();
    }
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(
      [...document.querySelectorAll('input[type="checkbox"]')].map(
        (input) => input.parentElement?.textContent,
      ),
    ).toEqual(['Acompanhar a reprodução', 'Marcar repetições']);
    const dock = screen.getByRole('region', { name: 'Bateria' });
    expect(within(dock).getByText('chimbal aberto')).toBeTruthy();
    expect(within(dock).getAllByRole('button')).toHaveLength(2);
  });

  it('keeps its own line lengths in the settings of the drum chart, with the control for all sections', async () => {
    renderPart();
    fireEvent.change(verseLength(), { target: { value: '4' } });
    expect(
      lines().map((line) => line.querySelectorAll('[data-bar]').length),
    ).toEqual([4, 4]);
    await waitFor(async () =>
      expect(
        (await rocksmithLibrary.listSettings()).map((item) => item.chartId),
      ).toEqual([chart.id]),
    );
    await waitFor(() =>
      expect(document.querySelectorAll('[data-own-length]')).toHaveLength(1),
    );
    fireEvent.change(allLengths(), { target: { value: '2' } });
    await waitFor(() => expect(verseLength().value).toBe('2'), SLOW);
    await waitFor(
      () =>
        expect(document.querySelectorAll('[data-own-length]')).toHaveLength(0),
      SLOW,
    );
    expect(
      lines().map((line) => line.querySelectorAll('[data-bar]').length),
    ).toEqual([0, 2, 2, 2, 2]);
    cleanup();
    renderPart();
    await waitFor(() => expect(verseLength().value).toBe('2'), SLOW);
  });

  it('marks the bar that draws the same as the bar above, under a line length', () => {
    renderPart();
    fireEvent.change(verseLength(), { target: { value: '2' } });
    fireEvent.click(screen.getByLabelText('Marcar repetições'));
    const repeated = bars()
      .filter((item) => item.querySelector('svg g[aria-hidden]'))
      .map((item) => Number(item.dataset.bar));
    expect(repeated).toEqual([5, 6, 7, 8]);
    expect(bar(5).querySelectorAll('[data-mark]')).toHaveLength(0);
    expect(bar(5).querySelector('svg')?.getAttribute('aria-label')).toBe(
      'Compasso 6: igual ao compasso 4',
    );
    expect(rowsOf(bar(5))).toEqual(ROWS);
    expect(bar(3).querySelectorAll('[data-mark]')).toHaveLength(12);
  });

  it('plays the chart with the drum samples without a linked recording', () => {
    renderPart();
    expect(
      screen.getByText(/a bateria toca com as amostras do app/),
    ).toBeTruthy();
    expect(bars().every((item) => !item.disabled)).toBe(true);
    fireEvent.click(bar(4));
    expect(state.sampleSeeks).toEqual([chart.bars[4].startTime]);
    expect(state.seeks).toEqual([]);
    const dock = screen.getByRole('region', { name: 'Bateria' });
    expect(
      (within(dock).getByLabelText('Tocar') as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it('moves the cursor with a linked recording, and jumps to a clicked bar', () => {
    state.recording = 'show.mp3';
    renderPart();
    expect(screen.getByText('Áudio local: show.mp3')).toBeTruthy();
    const active = () =>
      bars()
        .filter((item) => item.dataset.active === 'true')
        .map((item) => Number(item.dataset.bar));
    expect(active()).toEqual([]);
    expect(bars().every((item) => !item.disabled)).toBe(true);

    fireEvent.click(bar(4));
    expect(state.seeks).toEqual([chart.bars[4].startTime]);
    expect(state.sampleSeeks).toEqual([]);
    expect(state.sampleEnabled.includes(true)).toBe(false);
    expect(active()).toEqual([4]);
    expect(bar(4).classList.contains('border-live')).toBe(true);
    expect(bar(4).querySelectorAll('[data-playhead]')).toHaveLength(1);
    expect(document.querySelectorAll('[data-playhead]')).toHaveLength(1);
    expect(
      screen.getByText('Verso').classList.contains('text-text-primary'),
    ).toBe(true);
    const dock = screen.getByRole('region', { name: 'Bateria' });
    expect(within(dock).getByText('Compasso 5')).toBeTruthy();
    expect(
      within(dock).getByText('Chimbal x x x x x x x x · Caixa ● ● · Bumbo ● ●'),
    ).toBeTruthy();

    fireEvent.click(bar(7));
    expect(active()).toEqual([7]);
    fireEvent.click(screen.getByText('Pausa ×2'));
    expect(state.seeks).toEqual([
      chart.bars[4].startTime,
      chart.bars[7].startTime,
      chart.bars[0].startTime,
    ]);
  });

  it('shows the section groove with the groove chart, and a fill mark on a bar that leaves it', () => {
    renderPart();
    const grooves = document.querySelectorAll('[data-section-groove]');
    expect(grooves).toHaveLength(1);
    expect(grooves[0].querySelector('svg[role="img"]')).toBeTruthy();
    const filled = [...document.querySelectorAll('[data-fill-mark]')].map(
      (mark) => mark.closest('button')?.dataset.bar,
    );
    expect(filled).toEqual(['2']);
    expect(bar(9).querySelector('[data-fill-mark]')).toBeNull();
  });

  it('shows no fill mark and no groove for a chart with no kick, snare, or hi-hat', () => {
    renderPart(
      fixtureDrumChart(2, [
        { bar: 0, beat: 0, midi: CRASH },
        { bar: 1, beat: 0, midi: HIGH_TOM },
      ]),
    );
    expect(document.querySelector('[data-section-groove]')).toBeNull();
    expect(document.querySelector('[data-fill-mark]')).toBeNull();
  });

  it('shows no chart when the groove chart cannot draw the section groove', () => {
    renderPart(
      fixtureDrumChart(2, [
        { bar: 0, beat: 1 / 3, midi: KICK },
        { bar: 1, beat: 1 / 3, midi: KICK },
      ]),
    );
    expect(document.querySelector('[data-section-groove]')).toBeNull();
    expect(bars()).toHaveLength(2);
  });

  it('removes the drum chart with the control of the frame', async () => {
    const onRemove = renderPart();
    fireEvent.click(screen.getByRole('button', { name: 'Remover' }));
    await waitFor(() => expect(onRemove).toHaveBeenCalledTimes(1));
  });
});
