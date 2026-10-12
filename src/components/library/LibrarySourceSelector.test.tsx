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
import { rocksmithLibrary } from '@/services/rocksmithLibrary';
import type { BassChart } from '@/domain/bassChart';

const state = vi.hoisted(() => ({
  charts: [] as unknown[],
  tracks: [] as Array<{
    source_sha256: string;
    title: string;
    artist: string;
    duration_seconds: number;
  }>,
  fileByChart: {} as Record<string, string>,
}));

// The clock of the two parts imports the audio engine, which needs a browser.
vi.mock('@/hooks/useSongPartsPlayback', () => ({
  useSongPartsPlayback: () => ({
    active: false,
    audio: {
      ready: false,
      playing: false,
      duration: 0,
      currentSeconds: 0,
      play: async () => {},
      pause: () => {},
      seek: () => {},
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
    const charts = state.charts as BassChart[];
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
  fetchLibraryIndex: async () => ({ tracks: state.tracks }),
}));
vi.mock('@/components/library/LibraryTrackDetail', () => ({
  default: ({ track }: { track: { source_sha256: string } }) => (
    <div data-testid="analysis">{track.source_sha256}</div>
  ),
}));
// The recording is looked up by chart id: each source has its own.
vi.mock('@/hooks/useRocksmithAudio', () => ({
  useRocksmithAudio: (chartId: string) => ({
    audioState: state.fileByChart[chartId]
      ? {
          status: 'ready',
          url: 'blob:x',
          origin: 'local',
          fileName: state.fileByChart[chartId],
          playable: true,
        }
      : { status: 'missing' },
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
    ready: true,
    playing: false,
    duration: 2,
    currentSeconds: 0,
    play: vi.fn(),
    pause: vi.fn(),
    seek: vi.fn(),
  }),
}));

const KEY = encodeURIComponent('come together|the beatles');

function chartOf(
  id: string,
  source: 'gp' | 'midi' | 'rocksmith',
  title = 'Come Together',
  artist = 'The Beatles',
): BassChart {
  return {
    ...fixtureChart(source === 'midi' ? 6 : 4, walking([[48, 52, 55, 59]])),
    id,
    title,
    artist,
    source,
  };
}

const pickers = () => screen.getAllByLabelText(/^Compassos por linha em/);
const lines = () => (pickers()[0] as HTMLSelectElement).value;
const choice = (name: string) =>
  within(screen.getByRole('group', { name: 'Fonte' })).getByText(name);
const pressed = (name: string) =>
  choice(name).closest('button')!.getAttribute('aria-pressed');

beforeEach(() => {
  state.charts = [
    chartOf('midi1', 'midi'),
    chartOf('rs1', 'rocksmith'),
    chartOf('gp1', 'gp'),
  ];
  state.tracks = [];
  state.fileByChart = {};
  localStorage.clear();
  localStorage.setItem('music-theory-lab:fifths-window-open', 'false');
  window.history.replaceState(null, '', '#/biblioteca');
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

function openSong(title = 'Come Together') {
  fireEvent.click(screen.getByText(title).closest('tr') as HTMLElement);
}

describe('source selector of the song screen', () => {
  it('lists each source of the song and marks the open one', async () => {
    window.history.replaceState(null, '', `#/biblioteca/${KEY}/gp/bass`);
    render(<LibraryModule />);
    await waitFor(() => screen.getByRole('group', { name: 'Fonte' }));
    const group = within(screen.getByRole('group', { name: 'Fonte' }));
    expect(group.getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Guitar Pro',
      'Rocksmith',
      'MIDI',
    ]);
    expect(pressed('Guitar Pro')).toBe('true');
    expect(pressed('MIDI')).toBe('false');
  });

  it('shows the chart of the chosen source and changes the address', async () => {
    window.history.replaceState(null, '', `#/biblioteca/${KEY}/gp/bass`);
    render(<LibraryModule />);
    await waitFor(() => screen.getByRole('group', { name: 'Fonte' }));
    expect(screen.getByText('Compassos').nextElementSibling?.textContent).toBe(
      '4',
    );
    fireEvent.click(choice('MIDI'));
    expect(window.location.hash).toBe(`#/biblioteca/${KEY}/midi/bass`);
    await waitFor(() => expect(pressed('MIDI')).toBe('true'));
    expect(pressed('Guitar Pro')).toBe('false');
    // The MIDI chart has 6 bars; the Guitar Pro chart has 4.
    expect(screen.getByText('Compassos').nextElementSibling?.textContent).toBe(
      '6',
    );
  });

  it('keeps the line lengths of each source apart', async () => {
    // The line lengths are chart settings, which need a stored chart id.
    vi.stubGlobal('indexedDB', new IDBFactory());
    state.charts = [
      chartOf('a'.repeat(64), 'midi'),
      chartOf('b'.repeat(64), 'rocksmith'),
      chartOf('c'.repeat(64), 'gp'),
    ];
    window.history.replaceState(null, '', `#/biblioteca/${KEY}/gp/bass`);
    render(<LibraryModule />);
    await waitFor(() => pickers());
    const automatic = lines();
    fireEvent.change(pickers()[0], { target: { value: '2' } });
    expect(lines()).toBe('2');
    await waitFor(async () =>
      expect(await rocksmithLibrary.listSettings()).toHaveLength(1),
    );

    fireEvent.click(choice('MIDI'));
    await waitFor(() => expect(pressed('MIDI')).toBe('true'));
    expect(lines()).toBe(automatic);
    fireEvent.change(pickers()[0], { target: { value: '4' } });
    expect(lines()).toBe('4');
    await waitFor(async () =>
      expect(await rocksmithLibrary.listSettings()).toHaveLength(2),
    );

    fireEvent.click(choice('Guitar Pro'));
    await waitFor(() => expect(pressed('Guitar Pro')).toBe('true'));
    await waitFor(() => expect(lines()).toBe('2'));
    fireEvent.click(choice('MIDI'));
    await waitFor(() => expect(pressed('MIDI')).toBe('true'));
    await waitFor(() => expect(lines()).toBe('4'));
  });

  it('keeps the linked recording of each source apart', async () => {
    state.fileByChart = { gp1: 'gp-take.mp3' };
    window.history.replaceState(null, '', `#/biblioteca/${KEY}/gp/bass`);
    render(<LibraryModule />);
    await waitFor(() => screen.getByText('Áudio local: gp-take.mp3'));
    fireEvent.click(choice('MIDI'));
    await waitFor(() => expect(pressed('MIDI')).toBe('true'));
    expect(screen.queryByText('Áudio local: gp-take.mp3')).toBeNull();
    expect(screen.getByText(/Este arquivo não trouxe áudio/)).toBeTruthy();
  });

  it('opens the source that the device used last', async () => {
    window.history.replaceState(null, '', `#/biblioteca/${KEY}/midi/bass`);
    const first = render(<LibraryModule />);
    await waitFor(() => expect(pressed('MIDI')).toBe('true'));
    first.unmount();
    window.history.replaceState(null, '', '#/biblioteca');
    render(<LibraryModule />);
    openSong();
    await waitFor(() => expect(pressed('MIDI')).toBe('true'));
    expect(window.location.hash).toBe(`#/biblioteca/${KEY}/midi/bass`);
  });

  it('links the title of a row to the source used last', async () => {
    window.history.replaceState(null, '', `#/biblioteca/${KEY}/midi/bass`);
    const first = render(<LibraryModule />);
    await waitFor(() => expect(pressed('MIDI')).toBe('true'));
    first.unmount();
    window.history.replaceState(null, '', '#/biblioteca');
    render(<LibraryModule />);
    const link = (await screen.findByText('Come Together')).closest('a');
    expect(link?.getAttribute('href')).toBe(`#/biblioteca/${KEY}/midi/bass`);
  });

  it('opens Guitar Pro, then Rocksmith, then MIDI without a last source', async () => {
    const first = render(<LibraryModule />);
    openSong();
    await waitFor(() => expect(pressed('Guitar Pro')).toBe('true'));
    expect(window.location.hash).toBe(`#/biblioteca/${KEY}/gp/bass`);
    first.unmount();
    localStorage.clear();

    state.charts = [chartOf('midi1', 'midi'), chartOf('rs1', 'rocksmith')];
    window.history.replaceState(null, '', '#/biblioteca');
    render(<LibraryModule />);
    openSong();
    await waitFor(() => expect(pressed('Rocksmith')).toBe('true'));
  });

  it('lists the analysed track and shows the analysis on a choice of it', async () => {
    state.tracks = [
      {
        source_sha256: 'sha-1',
        title: 'Come Together',
        artist: 'The Beatles',
        duration_seconds: 100,
      },
    ];
    window.history.replaceState(null, '', `#/biblioteca/${KEY}/gp/bass`);
    render(<LibraryModule />);
    await waitFor(() => choice('Análise'));
    fireEvent.click(choice('Análise'));
    await waitFor(() => screen.getByTestId('analysis'));
    expect(screen.getByTestId('analysis').textContent).toBe('sha-1');
    expect(window.location.hash).toBe(`#/biblioteca/${KEY}/analise/analise`);
  });

  it('shows no choice for a song with one source', async () => {
    state.charts = [chartOf('rs9', 'rocksmith', 'Solo Song', 'Alone')];
    window.history.replaceState(
      null,
      '',
      `#/biblioteca/${encodeURIComponent('solo song|alone')}/rocksmith/bass`,
    );
    render(<LibraryModule />);
    await waitFor(() => pickers());
    expect(screen.queryByRole('group', { name: 'Fonte' })).toBeNull();
  });
});
