// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { IDBFactory } from 'fake-indexeddb';
import LibraryModule from '@/components/library/LibraryModule';
import { fixtureChart, walking } from '@/domain/bassChartFixture';
import { summarizeChart } from '@/domain/chartSummary';
import type { Chart } from '@/domain/drumChart';
import { fixtureDrumChart } from '@/domain/drumChartFixture';
import { partChartId } from '@/services/chartId';

const engine = vi.hoisted(() => ({
  preloadBassNotes: vi.fn(async () => {}),
  preloadDrumSamples: vi.fn(async () => {}),
  scheduleBassNote: vi.fn(),
  scheduleDrumHit: vi.fn(),
  stopBassNotes: vi.fn(),
  stopDrumHits: vi.fn(),
  now: () => Date.now() / 1000,
}));
vi.mock('@/services/playbackEngine', () => ({
  ensureAudio: async () => true,
  playbackEngine: engine,
}));

const state = vi.hoisted(() => ({
  charts: [] as unknown[],
  drumId: '',
}));

vi.mock('@/services/rocksmithLibrary', async (original) => {
  const real = (await original<{ rocksmithLibrary: object }>())
    .rocksmithLibrary;
  return {
    rocksmithLibrary: {
      ...real,
      getChart: async (id: string) =>
        (state.charts as Chart[]).find((c) => c.id === id) ?? null,
      getAudio: () => new Promise((resolve) => setTimeout(resolve, 15, null)),
    },
  };
});
vi.mock('@/hooks/useRocksmithCharts', () => ({
  useRocksmithCharts: () => {
    const [openId, setOpenId] = useState<string | null>(null);
    const charts = state.charts as Chart[];
    return {
      summaries: charts.map((c) => summarizeChart(c)),
      openId,
      openChart: charts.find((c) => c.id === openId) ?? null,
      open: async (id: string | null) => setOpenId(id),
      importStatus: { state: 'idle' },
      importFile: vi.fn(),
      remove: vi.fn(),
      syncStatus: 'synced',
      synchronize: vi.fn(),
    };
  },
}));
vi.mock('@/components/library/libraryData', async (original) => ({
  ...(await original<object>()),
  fetchLibraryIndex: async () => ({ tracks: [] }),
}));
vi.mock('@/services/confirm', () => ({
  confirmDialog: vi.fn(() => Promise.resolve(true)),
}));
vi.mock('@/services/chartSettingsSync', () => ({
  syncChartSettings: vi.fn(() => Promise.resolve()),
}));
vi.mock('@/hooks/useBassSynth', () => ({
  useBassSynth: () => ({ playBassNote: vi.fn() }),
}));

const KEY = encodeURIComponent('come together|the beatles');
const GP_BASS = 'c'.repeat(64);

const part = (name: string) =>
  within(screen.getByRole('group', { name: 'Parte' }))
    .getByText(name)
    .closest('button') as HTMLButtonElement;
const activeBars = () =>
  [...document.querySelectorAll('button[data-bar]')]
    .filter((item) => (item as HTMLElement).dataset.active === 'true')
    .map((item) => Number((item as HTMLElement).dataset.bar));

beforeEach(async () => {
  const drumId = await partChartId(GP_BASS, 'drums');
  state.charts = [
    {
      ...fixtureChart(4, walking([[48, 52, 55, 59]])),
      id: GP_BASS,
      title: 'Come Together',
      artist: 'The Beatles',
      source: 'gp',
    },
    {
      ...fixtureDrumChart(
        4,
        [0, 1, 2, 3].flatMap((bar) => [
          { bar, beat: 0, midi: 36 },
          { bar, beat: 2, midi: 38 },
        ]),
      ),
      id: drumId,
      title: 'Come Together',
      artist: 'The Beatles',
    },
  ];
  localStorage.clear();
  localStorage.setItem('music-theory-lab:fifths-window-open', 'false');
  window.history.replaceState(null, '', `#/biblioteca/${KEY}/gp/bass`);
  vi.stubGlobal('indexedDB', new IDBFactory());
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
  vi.clearAllMocks();
});

describe('shared playback across a change of part', () => {
  it('keeps the transport running and shows the cursor on the drum part', async () => {
    render(<LibraryModule />);
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Tablatura por seção' }),
      ).toBeTruthy(),
    );
    await waitFor(() => expect(engine.preloadDrumSamples).not.toBeUndefined());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 80));
    });
    await act(async () => {
      fireEvent.click(screen.getAllByLabelText('Tocar')[0]);
    });
    await waitFor(() =>
      expect(screen.getAllByLabelText('Pausar').length).toBeGreaterThan(0),
    );
    expect(engine.scheduleDrumHit).toHaveBeenCalled();
    engine.stopBassNotes.mockClear();
    engine.stopDrumHits.mockClear();

    fireEvent.click(part('Bateria'));
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Grade da bateria por seção' }),
      ).toBeTruthy(),
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 120));
    });
    expect(engine.stopBassNotes).not.toHaveBeenCalled();
    expect(engine.stopDrumHits).not.toHaveBeenCalled();
    expect(screen.getAllByLabelText('Pausar').length).toBeGreaterThan(0);
    expect(activeBars().length).toBe(1);
  });
});
