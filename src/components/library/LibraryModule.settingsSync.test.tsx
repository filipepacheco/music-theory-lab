// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { IDBFactory } from 'fake-indexeddb';
import LibraryModule from '@/components/library/LibraryModule';
import { fixtureChart, walking } from '@/domain/bassChartFixture';
import type { BassChart } from '@/domain/bassChart';
import type { ChartSettings } from '@/domain/chartSettings';
import { summarizeChart } from '@/domain/chartSummary';
import { groupLibrarySongs } from '@/domain/librarySong';
import { formatLibraryRoute, routeOfChart } from '@/domain/libraryRoute';
import { LINE_LENGTH_MIGRATED_KEY } from '@/services/lineLengthMigration';
import { rocksmithLibrary } from '@/services/rocksmithLibrary';

// The Biblioteca with the real chart list hook, the real song detail, the
// real local store and the real synchronization. Only the network and the
// audio are fakes. A song is open, and a synchronization then brings chart
// settings of a different device and no chart.

const state = vi.hoisted(() => ({
  synthChart: null as unknown,
  seeks: [] as number[],
}));
vi.mock('@/components/library/libraryData', async (original) => ({
  ...(await original<object>()),
  fetchLibraryIndex: async () => ({ tracks: [] }),
}));
vi.mock('@/hooks/useRocksmithAudio', () => ({
  useRocksmithAudio: () => ({
    audioState: { status: 'missing' },
    attach: vi.fn(),
    saveError: false,
  }),
}));
vi.mock('@/hooks/useDrumSamplePlayback', () => ({
  useDrumSamplePlayback: () => ({
    ready: true,
    playing: false,
    duration: 2,
    currentSeconds: 0,
    play: vi.fn(),
    pause: vi.fn(),
    seek: vi.fn(),
  }),
}));
vi.mock('@/hooks/useBassSynth', () => ({
  useBassSynth: () => ({ playBassNote: vi.fn() }),
}));
vi.mock('@/hooks/useBassSynthPlayback', () => ({
  useBassSynthPlayback: (chart: unknown) => {
    state.synthChart = chart;
    return {
      ready: true,
      playing: false,
      duration: 2,
      currentSeconds: 0,
      failed: false,
      play: vi.fn(),
      pause: vi.fn(),
      seek: (seconds: number) => state.seeks.push(seconds),
    };
  },
}));
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

function chartOf(id: string, title: string, source: 'gp' | 'midi'): BassChart {
  return {
    ...fixtureChart(
      8,
      walking(Array.from({ length: 8 }, () => [48, 52, 55, 59])),
    ),
    id: id.repeat(64),
    title,
    artist: 'The Beatles',
    source,
  };
}

/** One route of the fake cloud: a read with a counter, and a write. */
function route() {
  const rows = new Map<string, { record: unknown; counter: number }>();
  let last = 0;
  let gate: Promise<void> = Promise.resolve();
  return {
    reads: 0,
    /** A write of a different device. */
    put(key: string, record: unknown) {
      rows.set(key, { record, counter: ++last });
      return last;
    },
    /** The route answers no read before the returned function runs. */
    hold() {
      let release = () => {};
      gate = new Promise((resolve) => {
        release = resolve;
      });
      return release;
    },
    async read(after: number) {
      await gate;
      this.reads += 1;
      const page = [...rows.values()]
        .filter((row) => row.counter > after)
        .sort((a, b) => a.counter - b.counter);
      return {
        records: page.map((row) => row.record),
        counter: page.length > 0 ? page[page.length - 1].counter : after,
        more: false,
      };
    },
  };
}

function network() {
  const routes = {
    '/api/bass-charts': route(),
    '/api/chart-settings': route(),
  };
  const keyOf = (record: unknown) => {
    const item = record as { id?: string; chartId?: string };
    return item.chartId ?? item.id ?? '';
  };
  vi.stubGlobal(
    'fetch',
    async (url: string, init?: { method?: string; body?: string }) => {
      const [path, search = ''] = String(url).split('?');
      const target = routes[path as keyof typeof routes];
      if (!target) return { ok: false, status: 404 };
      if (init?.method === 'POST') {
        const records: unknown[] = JSON.parse(init.body!).records;
        const counters = records.map((record) =>
          target.put(keyOf(record), record),
        );
        return { ok: true, status: 200, json: async () => ({ counters }) };
      }
      const page = await target.read(
        Number(new URLSearchParams(search).get('after')),
      );
      return {
        ok: true,
        status: 200,
        json: async () => structuredClone(page),
      };
    },
  );
  return { settings: routes['/api/chart-settings'] };
}

/** The address of the song screen of a chart, as a saved link has it. */
function addressOf(chart: BassChart, all: BassChart[] = [chart]) {
  const summary = summarizeChart(chart);
  const song = groupLibrarySongs(all.map(summarizeChart), []).find((item) =>
    item.charts.some((c) => c.id === chart.id),
  )!;
  return formatLibraryRoute(
    routeOfChart(song.key, summary.source, summary.part),
  );
}

const settingsOf = (
  chart: BassChart,
  change: Partial<ChartSettings>,
): ChartSettings => ({
  chartId: chart.id,
  updatedAt: '2026-10-05T10:00:00.000Z',
  songLineLength: 'auto',
  sectionLineLengths: {},
  groupOverride: null,
  ...change,
});

const select = () =>
  screen.getByLabelText(/^Compassos por linha em/) as HTMLSelectElement;
const lines = () => document.querySelectorAll('[data-line]').length;

/**
 * The next synchronization of the Biblioteca. The event "online" starts it,
 * as a focus does; a focus also starts the sql.js library, which has no
 * WASM file here.
 */
const synchronizeAgain = () => window.dispatchEvent(new Event('online'));

let cloud: ReturnType<typeof network>;

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  localStorage.clear();
  localStorage.setItem('music-theory-lab:fifths-window-open', 'false');
  // The copy of the browser line lengths ran on an earlier start.
  localStorage.setItem(LINE_LENGTH_MIGRATED_KEY, 'true');
  state.synthChart = null;
  state.seeks = [];
  cloud = network();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '#/biblioteca');
});

describe('chart settings of a different device, with the song open', () => {
  const eight = chartOf('b', 'Come Together', 'gp');

  it('shows the line length that the first synchronization after a saved address brings', async () => {
    await rocksmithLibrary.save(eight, null);
    cloud.settings.put(
      eight.id,
      settingsOf(eight, { sectionLineLengths: { 0: 2 } }),
    );
    // The settings route answers after the song detail is on the screen.
    const release = cloud.settings.hold();
    window.history.replaceState(null, '', addressOf(eight));
    render(<LibraryModule />);

    await waitFor(() => expect(select().value).toBe(''));
    expect(lines()).toBe(0);
    const playing = state.synthChart;

    release();
    await waitFor(() => expect(lines()).toBe(4));
    expect(select().value).toBe('2');
    // The player keeps its chart object, and no seek follows the reload.
    expect(state.synthChart).toBe(playing);
    expect(state.seeks).toEqual([]);
  });

  it('shows the line length that a later synchronization brings, with no close and open', async () => {
    await rocksmithLibrary.save(eight, null);
    window.history.replaceState(null, '', addressOf(eight));
    render(<LibraryModule />);

    await waitFor(() => expect(select().value).toBe(''));
    await waitFor(() => expect(cloud.settings.reads).toBeGreaterThan(0));
    expect(lines()).toBe(0);
    const playing = state.synthChart;

    cloud.settings.put(
      eight.id,
      settingsOf(eight, { sectionLineLengths: { 0: 2 } }),
    );
    synchronizeAgain();

    await waitFor(() => expect(lines()).toBe(4));
    expect(select().value).toBe('2');
    expect(state.synthChart).toBe(playing);
    expect(state.seeks).toEqual([]);
  });

  it('shows the group override that a synchronization brings, with no close and open', async () => {
    const other = chartOf('c', 'Come Togther', 'midi');
    await rocksmithLibrary.save(eight, null);
    await rocksmithLibrary.save(other, null);
    const song = groupLibrarySongs([summarizeChart(eight)], [])[0];
    window.history.replaceState(null, '', addressOf(eight, [eight, other]));
    render(<LibraryModule />);

    await waitFor(() => expect(select().value).toBe(''));
    await waitFor(() => expect(cloud.settings.reads).toBeGreaterThan(0));
    // Two songs: the open one has one source, so no source selector.
    expect(screen.queryByText('MIDI')).toBeNull();
    const playing = state.synthChart;

    cloud.settings.put(
      other.id,
      settingsOf(other, { groupOverride: song.key }),
    );
    synchronizeAgain();

    // The open song now holds the two sources.
    expect(await screen.findByText('MIDI')).toBeTruthy();
    expect(screen.getByText('Guitar Pro')).toBeTruthy();
    expect(state.synthChart).toBe(playing);
    expect(state.seeks).toEqual([]);
  });
});
