// @vitest-environment happy-dom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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
import { exporter, importer } from '@coderline/alphatab';
import LibraryModule from '@/components/library/LibraryModule';
import { summarizeChart } from '@/domain/chartSummary';
import type { Chart } from '@/domain/drumChart';
import { groupLibrarySongs } from '@/domain/librarySong';
import { importGpChart } from '@/services/gp/importGpChart';

const state = vi.hoisted(() => ({ charts: [] as unknown[] }));

vi.mock('@/hooks/useSongPartsPlayback', () => ({
  useSongPartsPlayback: () => ({
    active: false,
    audio: {
      ready: false,
      playing: false,
      duration: 0,
      currentSeconds: 0,
      play: vi.fn(),
      pause: vi.fn(),
      seek: vi.fn(),
    },
    mutes: { bass: false, drums: false },
    controls: [],
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

const SIX = 'E4 B3 G3 D3 A2 E2';
const TEX = String.raw`\title "Banda" \artist "Grupo" \tempo 120
\track "Baixo" \instrument 34 \tuning (G2 D2 A1 E1) :4 0.4.4 2.4 3.4 0.3 | 2.3.4 3.3 0.2 2.2
\track "Bateria" \instrument percussion :4 (36 42) 42 (38{ac} 42) 38{g} | 37 46 44 49{hac}
\track "Guitarra 1 - Rhythm" \instrument 25 \tuning (${SIX}) :4 3.6 5.5 7.4 0.3 | 0.2 0.1 3.2 5.1
\track "Guitarra 2 - Lead" \instrument 27 \tuning (${SIX}) :4 12.1 15.1 12.2 10.2 | 0.1 0.1 0.1 0.1
\track "Voz" \instrument 53 \lyrics "Hel-lo wor-ld a-ma-zing day" :4 c4 d4 e4 f4 | g4 a4 b4 c5`;

let charts: Chart[] = [];

beforeAll(async () => {
  const score = importer.ScoreLoader.loadAlphaTex(TEX);
  const bytes = new exporter.Gp7Exporter().export(score).slice();
  const file = {
    name: 'Banda.gp',
    arrayBuffer: async () => bytes.slice().buffer,
  } as Blob & { name: string };
  charts = (await importGpChart(file)).charts;
});

const partGroup = () => screen.getByRole('group', { name: 'Parte' });
const partNames = () =>
  screen.getByRole('combobox', { name: 'Nome da parte: guitarra' });

beforeEach(() => {
  state.charts = charts;
  localStorage.clear();
  localStorage.setItem('music-theory-lab:fifths-window-open', 'false');
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

function address(part: string): string {
  const [song] = groupLibrarySongs(charts.map((c) => summarizeChart(c)), []);
  return `#/biblioteca/${encodeURIComponent(song.key)}/gp/${part}`;
}

describe('part picker of a Guitar Pro file with all four parts', () => {
  it('gives five charts, and shows a button for each part and a select with the two guitar part names', async () => {
    expect(
      charts.map((chart) => ('part' in chart ? chart.part : 'bass')),
    ).toEqual(['bass', 'drums', 'guitar', 'guitar', 'vocals']);
    window.history.replaceState(null, '', address('bass'));
    render(<LibraryModule />);
    await waitFor(() => expect(partGroup()).toBeTruthy());

    expect(
      within(partGroup())
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Baixo', 'Bateria', 'Guitarra', 'Vocais']);

    fireEvent.click(within(partGroup()).getByText('Guitarra'));
    await waitFor(() => expect(partNames()).toBeTruthy());
    expect(
      [...partNames().querySelectorAll('option')].map((o) => o.textContent),
    ).toEqual(['Guitarra 1 - Rhythm', 'Guitarra 2 - Lead']);
  });

  it('opens the vocal chart with its melody on the pitch lane', async () => {
    window.history.replaceState(null, '', address('bass'));
    render(<LibraryModule />);
    await waitFor(() => expect(partGroup()).toBeTruthy());

    fireEvent.click(within(partGroup()).getByText('Vocais'));
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Melodia por seção' }),
      ).toBeTruthy(),
    );
    expect(window.location.hash).toMatch(/\/gp\/vocals-4$/);
    expect(
      screen.queryByRole('combobox', { name: /Nome da parte/ }),
    ).toBeNull();
    expect(document.querySelectorAll('[data-lyric]').length).toBeGreaterThan(0);
  });
});
