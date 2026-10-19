// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import {
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
import { rocksmithLibrary } from '@/services/rocksmithLibrary';

const state = vi.hoisted(() => ({
  charts: [] as unknown[],
  remove: vi.fn(),
  shared: {
    active: false,
    playing: false,
    currentSeconds: 0,
    play: vi.fn(),
    pause: vi.fn(),
    seek: vi.fn(),
  },
}));

vi.mock('@/hooks/useSongPartsPlayback', () => ({
  useSongPartsPlayback: () => ({
    active: state.shared.active,
    audio: {
      ready: state.shared.active,
      playing: state.shared.playing,
      duration: 8,
      currentSeconds: state.shared.currentSeconds,
      play: state.shared.play,
      pause: state.shared.pause,
      seek: state.shared.seek,
    },
    mutes: { bass: false, drums: false },
    toggleMute: () => {},
    reportBass: () => {},
    reportRecording: () => {},
  }),
}));

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
      remove: state.remove,
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
  useBassSynthPlayback: () => ({
    ready: true,
    playing: false,
    duration: 2,
    currentSeconds: 0,
    failed: false,
    play: vi.fn(),
    pause: vi.fn(),
    seek: vi.fn(),
  }),
}));
vi.mock('@/components/library/useLibraryAudio', () => ({
  useLibraryAudio: () => ({
    ready: false,
    playing: false,
    duration: 0,
    currentSeconds: 0,
    play: vi.fn(),
    pause: vi.fn(),
    seek: vi.fn(),
  }),
}));

const KEY = encodeURIComponent('come together|the beatles');
const GP_BASS = 'c'.repeat(64);
const GP_DRUMS = 'd'.repeat(64);
const MIDI_BASS = 'a'.repeat(64);

function bassOf(id: string, source: 'gp' | 'midi'): Chart {
  return {
    ...fixtureChart(4, walking([[48, 52, 55, 59]])),
    id,
    title: 'Come Together',
    artist: 'The Beatles',
    source,
  };
}

const drums: Chart = {
  ...fixtureDrumChart(
    4,
    [0, 1, 2, 3].flatMap((bar) => [
      { bar, beat: 0, midi: 36 },
      { bar, beat: 2, midi: 38 },
    ]),
  ),
  id: GP_DRUMS,
  title: 'Come Together',
  artist: 'The Beatles',
};

const partGroup = () => screen.queryByRole('group', { name: 'Parte' });
const part = (name: string) =>
  within(partGroup() as HTMLElement)
    .getByText(name)
    .closest('button') as HTMLButtonElement;
const source = (name: string) =>
  within(screen.getByRole('group', { name: 'Fonte' }))
    .getByText(name)
    .closest('button') as HTMLButtonElement;
const tab = () =>
  screen.queryByRole('heading', { name: 'Tablatura por seção' });
const grid = () =>
  screen.queryByRole('heading', { name: 'Grade da bateria por seção' });
const lineLength = () =>
  screen.getAllByLabelText(/^Compassos por linha em/)[0] as HTMLSelectElement;

beforeEach(() => {
  state.charts = [bassOf(MIDI_BASS, 'midi'), bassOf(GP_BASS, 'gp'), drums];
  state.remove.mockReset();
  state.shared.active = false;
  state.shared.playing = false;
  state.shared.currentSeconds = 0;
  state.shared.play.mockReset();
  state.shared.pause.mockReset();
  state.shared.seek.mockReset();
  localStorage.clear();
  localStorage.setItem('music-theory-lab:fifths-window-open', 'false');
  window.history.replaceState(null, '', '#/biblioteca');
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
});

describe('part selector of the song screen', () => {
  it('lists the parts of the open source and marks the open one', async () => {
    window.history.replaceState(null, '', `#/biblioteca/${KEY}/gp/bass`);
    render(<LibraryModule />);
    await waitFor(() => expect(tab()).toBeTruthy());
    expect(
      within(partGroup() as HTMLElement)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Baixo', 'Bateria']);
    expect(part('Baixo').getAttribute('aria-pressed')).toBe('true');
    expect(part('Bateria').getAttribute('aria-pressed')).toBe('false');
    expect(grid()).toBeNull();
  });

  it('shows the chosen part and changes the address', async () => {
    window.history.replaceState(null, '', `#/biblioteca/${KEY}/gp/bass`);
    render(<LibraryModule />);
    await waitFor(() => expect(tab()).toBeTruthy());

    fireEvent.click(part('Bateria'));
    expect(window.location.hash).toBe(`#/biblioteca/${KEY}/gp/drums`);
    await waitFor(() => expect(grid()).toBeTruthy());
    expect(tab()).toBeNull();
    expect(part('Bateria').getAttribute('aria-pressed')).toBe('true');
    expect(part('Baixo').getAttribute('aria-pressed')).toBe('false');
    expect(document.querySelectorAll('button[data-bar]')).toHaveLength(4);
    expect(
      [...document.querySelectorAll('[role="listitem"]')].map(
        (item) => item.textContent,
      ),
    ).toEqual(['Caixa', 'Bumbo']);
    expect(screen.getByText(/Bateria importada de test\.gp/)).toBeTruthy();
    expect(screen.queryByText(/visualização da bateria/)).toBeNull();
    for (const text of [/Afinação/, /Mostrar graus/, /Transpor/, /Braço/]) {
      expect(screen.queryByText(text)).toBeNull();
    }

    fireEvent.click(part('Baixo'));
    expect(window.location.hash).toBe(`#/biblioteca/${KEY}/gp/bass`);
    await waitFor(() => expect(tab()).toBeTruthy());
    expect(grid()).toBeNull();
    expect(screen.getByText('Afinação')).toBeTruthy();
  });

  it('opens the drum part from a saved address', async () => {
    window.history.replaceState(null, '', `#/biblioteca/${KEY}/gp/drums`);
    render(<LibraryModule />);
    await waitFor(() => expect(grid()).toBeTruthy());
    expect(part('Bateria').getAttribute('aria-pressed')).toBe('true');
  });

  it('shows no part choice for a source with one part, and keeps the bass on a change of source', async () => {
    window.history.replaceState(null, '', `#/biblioteca/${KEY}/gp/drums`);
    render(<LibraryModule />);
    await waitFor(() => expect(grid()).toBeTruthy());
    fireEvent.click(source('MIDI'));
    expect(window.location.hash).toBe(`#/biblioteca/${KEY}/midi/bass`);
    await waitFor(() => expect(tab()).toBeTruthy());
    expect(partGroup()).toBeNull();
    fireEvent.click(source('Guitar Pro'));
    await waitFor(() => expect(partGroup()).toBeTruthy());
    expect(window.location.hash).toBe(`#/biblioteca/${KEY}/gp/bass`);
  });

  it('keeps the line lengths of the drum part in the settings of the drum chart', async () => {
    window.history.replaceState(null, '', `#/biblioteca/${KEY}/gp/drums`);
    render(<LibraryModule />);
    await waitFor(() => expect(grid()).toBeTruthy());
    expect(
      screen.getByLabelText('Compassos por linha de todas as seções'),
    ).toBeTruthy();
    expect(lineLength().value).toBe('');
    fireEvent.change(lineLength(), { target: { value: '2' } });
    await waitFor(async () =>
      expect(
        (await rocksmithLibrary.listSettings()).map((item) => item.chartId),
      ).toEqual([GP_DRUMS]),
    );

    fireEvent.click(part('Baixo'));
    await waitFor(() => expect(tab()).toBeTruthy());
    expect(lineLength().value).toBe('');
    fireEvent.change(lineLength(), { target: { value: '4' } });
    await waitFor(async () =>
      expect(
        (await rocksmithLibrary.listSettings())
          .map((item) => item.chartId)
          .sort(),
      ).toEqual([GP_BASS, GP_DRUMS]),
    );

    fireEvent.click(part('Bateria'));
    await waitFor(() => expect(grid()).toBeTruthy());
    await waitFor(() => expect(lineLength().value).toBe('2'));
    fireEvent.click(part('Baixo'));
    await waitFor(() => expect(tab()).toBeTruthy());
    await waitFor(() => expect(lineLength().value).toBe('4'));
  });

  it('removes a song with only a drum chart from the song screen', async () => {
    state.charts = [drums];
    window.history.replaceState(null, '', `#/biblioteca/${KEY}/gp/drums`);
    render(<LibraryModule />);
    await waitFor(() => expect(grid()).toBeTruthy());
    expect(partGroup()).toBeNull();
    expect(screen.queryByRole('group', { name: 'Fonte' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Remover' }));
    await waitFor(() => expect(state.remove).toHaveBeenCalledWith(GP_DRUMS));
    expect(window.location.hash).toBe('#/biblioteca');
  });

  it('keeps the shared playback going on a change of part and shows the cursor on the new part', async () => {
    window.history.replaceState(null, '', `#/biblioteca/${KEY}/gp/bass`);
    state.shared.active = true;
    state.shared.playing = true;
    state.shared.currentSeconds = 3;
    render(<LibraryModule />);
    await waitFor(() => expect(tab()).toBeTruthy());
    expect(screen.getAllByLabelText('Pausar').length).toBeGreaterThan(0);

    fireEvent.click(part('Bateria'));
    await waitFor(() => expect(grid()).toBeTruthy());
    const active = [...document.querySelectorAll('button[data-bar]')]
      .filter((item) => (item as HTMLElement).dataset.active === 'true')
      .map((item) => Number((item as HTMLElement).dataset.bar));
    expect(active).toEqual([1]);
    expect(screen.getAllByLabelText('Pausar').length).toBeGreaterThan(0);
    expect(state.shared.pause).not.toHaveBeenCalled();
    expect(state.shared.seek).not.toHaveBeenCalled();
    expect(state.shared.play).not.toHaveBeenCalled();
  });
});
