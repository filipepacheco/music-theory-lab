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
import LibraryModule from '@/components/library/LibraryModule';
import { useAppStore } from '@/store/useAppStore';
import { withGroupOverride } from '@/domain/chartSettings';
import { tuningOf } from '@/domain/libraryListView';
import { fixtureChart } from '@/domain/bassChartFixture';
import { summarizeChart, type ChartSummary } from '@/domain/chartSummary';
import type { ChartSettings } from '@/domain/chartSettings';
import type { BassChart } from '@/domain/bassChart';
import type { Chart } from '@/domain/drumChart';
import { fixtureDrumChart } from '@/domain/drumChartFixture';
import { exporter, importer } from '@coderline/alphatab';
import { importGpChart } from '@/services/gp/importGpChart';

const state = vi.hoisted(() => ({
  summaries: [] as ChartSummary[],
  charts: [] as Chart[],
  tracks: [] as Array<{
    source_sha256: string;
    title: string;
    artist: string;
    duration_seconds: number;
  }>,
  open: vi.fn(),
  importFile: vi.fn(),
  audioIds: [] as string[],
  settings: new Map<string, ChartSettings>(),
  failSave: false,
}));
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

vi.mock('@/services/rocksmithLibrary', () => ({
  rocksmithLibrary: {
    listAudioIds: async () => state.audioIds,
    listSettings: async () => [...state.settings.values()],
    getSettings: async (id: string) => state.settings.get(id) ?? null,
    saveSettings: async (item: ChartSettings) => {
      if (state.failSave) throw new Error('refused');
      state.settings.set(item.chartId, item);
    },
  },
}));
vi.mock('@/services/chartSettingsSync', () => ({
  syncChartSettings: async () => undefined,
}));

vi.mock('@/hooks/useRocksmithCharts', () => ({
  useRocksmithCharts: () => {
    const [openId, setOpenId] = useState<string | null>(null);
    return {
      summaries: state.summaries,
      openId,
      openChart: openId
        ? (state.charts.find((chart) => chart.id === openId) ?? { id: openId })
        : null,
      open: async (id: string | null) => {
        setOpenId(id);
        await state.open(id);
      },
      importStatus: { state: 'idle' },
      importFile: state.importFile,
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
vi.mock('@/components/library/RocksmithTrackDetail', () => ({
  default: ({ chart }: { chart: { id: string } }) => (
    <div data-testid="chart">{chart.id}</div>
  ),
}));
vi.mock('@/components/library/DrumPartDetail', () => ({
  default: ({ chart }: { chart: { id: string } }) => (
    <div data-testid="drums">{chart.id}</div>
  ),
}));

function chartOf(
  id: string,
  title: string,
  artist: string,
  source: 'gp' | 'midi' | 'rocksmith',
  part: 'bass' | 'drums' = 'bass',
): ChartSummary {
  const chart: BassChart = {
    ...fixtureChart(1, [{ bar: 0, beat: 0, midi: 33 }]),
    id,
    title,
    artist,
    source,
  };
  return { ...summarizeChart(chart), part };
}

function row(title: string) {
  return screen.getByText(title).closest('tr') as HTMLElement;
}

beforeEach(() => {
  state.summaries = [];
  state.charts = [];
  state.tracks = [];
  state.open.mockReset().mockResolvedValue(undefined);
  state.importFile.mockReset();
  state.audioIds = [];
  state.settings.clear();
  state.failSave = false;
  window.history.replaceState(null, '', '#/biblioteca');
});
afterEach(cleanup);

describe('Biblioteca list', () => {
  it('shows one row with a badge for each source and each part', async () => {
    state.summaries = [
      chartOf('midi1', 'Come Together', 'The Beatles', 'midi'),
      chartOf('gp1', 'Come Together', 'The Beatles', 'gp'),
      chartOf('gpd', 'Come Together', 'The Beatles', 'gp', 'drums'),
    ];
    render(<LibraryModule />);
    const rows = screen.getAllByText('Come Together');
    expect(rows).toHaveLength(1);
    const badges = within(row('Come Together'));
    for (const label of ['GP', 'MIDI', 'Baixo', 'Bateria']) {
      expect(badges.getByText(label)).toBeTruthy();
    }
    expect(badges.queryByText('Rocksmith')).toBeNull();
    expect(badges.queryByText('Análise')).toBeNull();
  });

  it('opens the chart of the best source on a click', async () => {
    state.summaries = [
      chartOf('midi1', 'Come Together', 'The Beatles', 'midi'),
      chartOf('rs1', 'Come Together', 'The Beatles', 'rocksmith'),
      chartOf('gp1', 'Come Together', 'The Beatles', 'gp'),
    ];
    render(<LibraryModule />);
    fireEvent.click(row('Come Together'));
    await waitFor(() => expect(state.open).toHaveBeenCalledWith('gp1'));
  });

  it('opens the analysis of a song with only an analysed track', async () => {
    state.summaries = [chartOf('x', 'Other Song', 'Someone', 'gp')];
    state.tracks = [
      {
        source_sha256: 'sha-1',
        title: 'Lonely Track',
        artist: 'Nobody',
        duration_seconds: 100,
      },
      {
        source_sha256: 'sha-2',
        title: 'Second Track',
        artist: 'Nobody',
        duration_seconds: 100,
      },
    ];
    render(<LibraryModule />);
    await waitFor(() => screen.getByText('Second Track'));
    fireEvent.click(row('Second Track'));
    expect(screen.getByTestId('analysis').textContent).toBe('sha-2');
    expect(state.open).not.toHaveBeenCalled();
  });
});

describe('drum charts in the Biblioteca', () => {
  const drums: Chart = {
    ...fixtureDrumChart(1, [{ bar: 0, beat: 0, midi: 36 }]),
    title: 'Rosanna',
    artist: 'Toto',
  };

  it('a file with bass and drums gives one row of the list, with a drums badge', async () => {
    const score = importer.ScoreLoader.loadAlphaTex(
      String.raw`\title "Billie Jean" \artist "Michael Jackson" \tempo 117
\track "Baixo" \instrument 34 \tuning (G2 D2 A1 E1) 2.3.8 2.2 4.2 2.2 0.2 4.3 2.3 4.3
\track "Bateria" \instrument percussion :8 (36 42) 42 (38 42) 42 (36 42) 42 (38 42) 42`,
    );
    const bytes = new exporter.Gp7Exporter().export(score);
    const { charts } = await importGpChart({
      name: 'Billie Jean.gp',
      arrayBuffer: async () => bytes.slice().buffer,
    } as Blob & { name: string });
    expect(charts).toHaveLength(2);
    state.summaries = charts.map(summarizeChart);
    render(<LibraryModule />);
    expect(screen.getAllByRole('row')).toHaveLength(2);
    expect(screen.getAllByText('Billie Jean')).toHaveLength(1);
    const badges = within(row('Billie Jean'));
    for (const label of ['GP', 'Baixo', 'Bateria']) {
      expect(badges.getByText(label)).toBeTruthy();
    }
    fireEvent.click(row('Billie Jean'));
    await waitFor(() => expect(state.open).toHaveBeenCalledWith(charts[0].id));
  });

  it('a song with only a drum chart opens the song screen with the drum part', async () => {
    state.summaries = [summarizeChart(drums)];
    state.charts = [drums];
    render(<LibraryModule />);
    expect(within(row('Rosanna')).getByText('Bateria')).toBeTruthy();
    expect(within(row('Rosanna')).queryByText('Baixo')).toBeNull();
    fireEvent.click(row('Rosanna'));
    await waitFor(() => expect(state.open).toHaveBeenCalledWith(drums.id));
    expect((await screen.findByTestId('drums')).textContent).toBe(drums.id);
    expect(window.location.hash).toBe(
      `#/biblioteca/${encodeURIComponent('rosanna|toto')}/gp/drums`,
    );
    expect(screen.queryByText(/visualização da bateria/)).toBeNull();
    expect(screen.queryByTestId('chart')).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByText('← Voltar para a lista')).toBeTruthy();
  });

  it('shows the drum part, and no notice, for a drum chart from a saved address', async () => {
    state.summaries = [summarizeChart(drums)];
    state.charts = [drums];
    window.history.replaceState(
      null,
      '',
      `#/biblioteca/${encodeURIComponent('rosanna|toto')}/gp/drums`,
    );
    render(<LibraryModule />);
    expect((await screen.findByTestId('drums')).textContent).toBe(drums.id);
    expect(screen.queryByText(/visualização da bateria/)).toBeNull();
    expect(screen.queryByTestId('chart')).toBeNull();
  });

  it('shows the bass tab, and no notice, for the bass chart of a song with the two parts', async () => {
    state.summaries = [
      chartOf('gp1', 'Rosanna', 'Toto', 'gp'),
      summarizeChart(drums),
    ];
    state.charts = [drums];
    render(<LibraryModule />);
    fireEvent.click(row('Rosanna'));
    await waitFor(() => screen.getByTestId('chart'));
    expect(screen.getByTestId('chart').textContent).toBe('gp1');
    expect(screen.queryByText(/visualização da bateria/)).toBeNull();
    expect(screen.queryByTestId('drums')).toBeNull();
  });
});

describe('import message', () => {
  const imported = chartOf('m2', 'Come Together (bass)', 'The Beatles', 'midi');

  it('names the song when the file joins a song that exists', async () => {
    state.summaries = [chartOf('gp1', 'Come Together', 'The Beatles', 'gp')];
    state.importFile.mockResolvedValue({
      ...fixtureChart(1, [{ bar: 0, beat: 0, midi: 33 }]),
      id: imported.id,
      title: imported.title,
      artist: imported.artist,
      source: 'midi',
    });
    const { container } = render(<LibraryModule />);
    const input = container.querySelector('input[type=file]') as HTMLElement;
    fireEvent.change(input, {
      target: { files: [new File(['x'], 'a.mid')] },
    });
    await waitFor(() =>
      expect(
        screen.getByText(
          'O arquivo entrou na música existente "Come Together".',
        ),
      ).toBeTruthy(),
    );
  });

  it('says nothing when the file makes a new song', async () => {
    state.summaries = [chartOf('x', 'Another', 'Else', 'gp')];
    state.importFile.mockResolvedValue({
      ...fixtureChart(1, [{ bar: 0, beat: 0, midi: 33 }]),
      id: 'm2',
      title: 'Come Together',
      artist: 'The Beatles',
      source: 'midi',
    });
    const { container } = render(<LibraryModule />);
    fireEvent.change(
      container.querySelector('input[type=file]') as HTMLElement,
      {
        target: { files: [new File(['x'], 'a.mid')] },
      },
    );
    await waitFor(() =>
      expect(window.location.hash).toContain('come%20together'),
    );
    expect(screen.queryByText(/entrou na música/)).toBeNull();
  });
});

const KEY = encodeURIComponent('come together|the beatles');

describe('Biblioteca screens and addresses', () => {
  beforeEach(() => {
    state.summaries = [
      chartOf('midi1', 'Come Together', 'The Beatles', 'midi'),
      chartOf('gp1', 'Come Together', 'The Beatles', 'gp'),
      chartOf('x', 'Other Song', 'Someone', 'rocksmith'),
    ];
  });

  it('shows the list as a table with six columns, import, and sync', () => {
    render(<LibraryModule />);
    const headings = screen
      .getAllByRole('columnheader')
      .map((cell) => cell.textContent);
    expect(headings).toEqual([
      'Título',
      'Artista',
      'Partes',
      'Andamento',
      'Duração',
      'Importado em',
    ]);
    expect(document.querySelector('input[type=file]')).toBeTruthy();
    expect(screen.getByText(/Linhas de baixo salvas on-line/)).toBeTruthy();
    expect(screen.queryByTestId('chart')).toBeNull();
    expect(window.location.hash).toBe('#/biblioteca');
  });

  it('opens the song screen on a click, with the song key, source and part in the address', async () => {
    render(<LibraryModule />);
    fireEvent.click(row('Come Together'));
    await waitFor(() => screen.getByTestId('chart'));
    expect(window.location.hash).toBe(`#/biblioteca/${KEY}/gp/bass`);
    expect(screen.getByTestId('chart').textContent).toBe('gp1');
    expect(screen.queryByRole('columnheader')).toBeNull();
    const back = screen.getByText(/Voltar para a lista/);
    expect(back.getAttribute('href')).toBe('#/biblioteca');
  });

  it('returns to the list on the browser Back button', async () => {
    render(<LibraryModule />);
    fireEvent.click(row('Other Song'));
    await waitFor(() => screen.getByTestId('chart'));
    window.history.back();
    await waitFor(() => expect(screen.queryByTestId('chart')).toBeNull());
    expect(screen.getAllByRole('columnheader')).toHaveLength(6);
    expect(window.location.hash).toBe('#/biblioteca');
  });

  it('opens the same song, source and part from a saved address', async () => {
    window.history.replaceState(null, '', `#/biblioteca/${KEY}/midi/bass`);
    render(<LibraryModule />);
    await waitFor(() => screen.getByTestId('chart'));
    expect(screen.getByTestId('chart').textContent).toBe('midi1');
    expect(window.location.hash).toBe(`#/biblioteca/${KEY}/midi/bass`);
  });

  it('shows the list with a message for a song key that matches no song', async () => {
    window.history.replaceState(
      null,
      '',
      '#/biblioteca/nothing%7Cnobody/gp/bass',
    );
    render(<LibraryModule />);
    await waitFor(() => screen.getByRole('alert'));
    expect(screen.getByRole('alert').textContent).toMatch(/Nenhuma música/);
    expect(screen.getAllByRole('columnheader')).toHaveLength(6);
    expect(screen.queryByTestId('chart')).toBeNull();
  });

  it('opens a song with only an analysed track on the song screen', async () => {
    state.tracks = [
      {
        source_sha256: 'sha-9',
        title: 'Lonely Track',
        artist: 'Nobody',
        duration_seconds: 100,
      },
    ];
    render(<LibraryModule />);
    await waitFor(() => screen.getByText('Lonely Track'));
    fireEvent.click(row('Lonely Track'));
    await waitFor(() => screen.getByTestId('analysis'));
    expect(window.location.hash).toBe(
      `#/biblioteca/${encodeURIComponent('lonely track|nobody')}/analise/analise`,
    );
  });

  it('opens the song screen of the new chart after an import', async () => {
    state.importFile.mockResolvedValue({
      ...fixtureChart(1, [{ bar: 0, beat: 0, midi: 33 }]),
      id: 'new1',
      title: 'Brand New',
      artist: 'Band',
      source: 'gp',
    });
    const { container, rerender } = render(<LibraryModule />);
    state.importFile.mockImplementation(async () => {
      state.summaries = [
        ...state.summaries,
        chartOf('new1', 'Brand New', 'Band', 'gp'),
      ];
      return {
        ...fixtureChart(1, [{ bar: 0, beat: 0, midi: 33 }]),
        id: 'new1',
        title: 'Brand New',
        artist: 'Band',
        source: 'gp',
      };
    });
    fireEvent.change(
      container.querySelector('input[type=file]') as HTMLElement,
      { target: { files: [new File(['x'], 'a.gp')] } },
    );
    await waitFor(() => screen.getByTestId('chart'));
    rerender(<LibraryModule />);
    expect(screen.getByTestId('chart').textContent).toBe('new1');
    expect(window.location.hash).toBe(
      `#/biblioteca/${encodeURIComponent('brand new|band')}/gp/bass`,
    );
  });
});

function Shell() {
  const activeModule = useAppStore((s) => s.activeModule);
  return activeModule === 'library' ? <LibraryModule /> : <p>Outro módulo</p>;
}

describe('Biblioteca address and the other modules', () => {
  beforeEach(() => {
    state.summaries = [
      chartOf('midi1', 'Come Together', 'The Beatles', 'midi'),
      chartOf('x', 'Other Song', 'Someone', 'rocksmith'),
    ];
    useAppStore.setState({ activeModule: 'library' });
  });

  it('clears the address when the user leaves the Biblioteca on a song', async () => {
    window.history.replaceState(null, '', `#/biblioteca/${KEY}/midi/bass`);
    render(<Shell />);
    await screen.findByTestId('chart');
    act(() => useAppStore.getState().setActiveModule('scales'));
    expect(window.location.hash).toBe('');
    expect(screen.getByText('Outro módulo')).toBeTruthy();
    expect(screen.queryByTestId('chart')).toBeNull();
  });

  it('clears the address of the list too, and keeps the address of a different module', () => {
    render(<Shell />);
    expect(window.location.hash).toBe('#/biblioteca');
    act(() => useAppStore.getState().setActiveModule('scales'));
    expect(window.location.hash).toBe('');
    window.history.replaceState(null, '', '#outro');
    act(() => useAppStore.getState().setActiveModule('quiz'));
    expect(window.location.hash).toBe('#outro');
  });

  it('opens the Biblioteca when Back reaches one of its addresses from a different module', async () => {
    render(<Shell />);
    fireEvent.click(row('Other Song'));
    await screen.findByTestId('chart');
    act(() => useAppStore.getState().setActiveModule('scales'));
    expect(window.location.hash).toBe('');
    window.history.back();
    await waitFor(() =>
      expect(screen.getAllByRole('columnheader')).toHaveLength(6),
    );
    expect(useAppStore.getState().activeModule).toBe('library');
    expect(window.location.hash).toBe('#/biblioteca');
  });

  it('puts the list address back when the address leaves the Biblioteca and the module stays', async () => {
    render(<Shell />);
    window.location.hash = '#outro';
    await waitFor(() => expect(window.location.hash).toBe('#/biblioteca'));
    expect(useAppStore.getState().activeModule).toBe('library');
    expect(screen.getAllByRole('columnheader')).toHaveLength(6);
  });
});

function rowTitles() {
  return screen
    .queryAllByRole('row')
    .slice(1)
    .map((tr) => within(tr).getAllByRole('cell')[0].textContent);
}
const search = () => screen.getByLabelText('Buscar por título ou artista');

describe('Biblioteca list search, filters, and sort', () => {
  beforeEach(() => {
    state.summaries = [
      chartOf('a', 'Água de Beber', 'Tom Jobim', 'midi'),
      chartOf('b', 'Come Together', 'The Beatles', 'gp'),
      chartOf('b2', 'Come Together', 'The Beatles', 'gp', 'drums'),
      chartOf('c', 'Zebra', 'Álvaro Ótimo', 'rocksmith'),
    ];
  });

  it('finds a song of the shared library with no accents, and keeps the text and rows after a click and Back', async () => {
    render(<LibraryModule />);
    expect(rowTitles()).toHaveLength(3);
    fireEvent.change(search(), { target: { value: 'agua' } });
    expect(rowTitles()).toEqual(['Água de Beber']);
    fireEvent.click(row('Água de Beber'));
    await waitFor(() => screen.getByTestId('chart'));
    expect(screen.queryByLabelText('Buscar por título ou artista')).toBeNull();
    window.history.back();
    await waitFor(() => expect(screen.queryByTestId('chart')).toBeNull());
    expect((search() as HTMLInputElement).value).toBe('agua');
    expect(rowTitles()).toEqual(['Água de Beber']);
  });

  it('searches by artist and combines filters with the search', () => {
    render(<LibraryModule />);
    fireEvent.change(search(), { target: { value: 'ALVARO' } });
    expect(rowTitles()).toEqual(['Zebra']);
    fireEvent.change(search(), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Fonte'), {
      target: { value: 'gp' },
    });
    expect(rowTitles()).toEqual(['Come Together']);
    fireEvent.change(screen.getByLabelText('Parte'), {
      target: { value: 'drums' },
    });
    expect(rowTitles()).toEqual(['Come Together']);
    fireEvent.change(search(), { target: { value: 'jobim' } });
    expect(rowTitles()).toEqual([]);
  });

  it('shows a song that holds a drum chart under the part "drums"', () => {
    render(<LibraryModule />);
    fireEvent.change(screen.getByLabelText('Parte'), {
      target: { value: 'drums' },
    });
    expect(rowTitles()).toEqual(['Come Together']);
  });

  it('filters by the recordings of this browser', async () => {
    state.audioIds = ['c'];
    render(<LibraryModule />);
    fireEvent.change(screen.getByLabelText('Gravação vinculada'), {
      target: { value: 'linked' },
    });
    await waitFor(() => expect(rowTitles()).toEqual(['Zebra']));
  });

  it('filters by tuning', () => {
    const dropped = [-2, 0, 0, 0];
    state.summaries = state.summaries.map((item) =>
      item.id === 'c' ? { ...item, tuning: dropped } : item,
    );
    render(<LibraryModule />);
    const select = screen.getByRole('combobox', {
      name: 'Afinação',
    }) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: tuningOf(dropped) } });
    expect(rowTitles()).toEqual(['Zebra']);
    fireEvent.change(select, { target: { value: tuningOf([0, 0, 0, 0]) } });
    expect(rowTitles()).toEqual(['Água de Beber', 'Come Together']);
  });

  it('sorts by title, artist, and tempo', () => {
    const tempos: Record<string, number> = { a: 100, b: 140, b2: 140, c: 80 };
    state.summaries = state.summaries.map((item) => ({
      ...item,
      tempoBpm: tempos[item.id],
    }));
    render(<LibraryModule />);
    const sort = screen.getByLabelText('Ordenar por');
    fireEvent.change(sort, { target: { value: 'title' } });
    expect(rowTitles()).toEqual(['Água de Beber', 'Come Together', 'Zebra']);
    fireEvent.change(sort, { target: { value: 'artist' } });
    expect(rowTitles()).toEqual(['Zebra', 'Come Together', 'Água de Beber']);
    fireEvent.change(sort, { target: { value: 'tempo' } });
    expect(rowTitles()).toEqual(['Zebra', 'Água de Beber', 'Come Together']);
  });

  it('shows a message when the search has no result, and clears it', () => {
    render(<LibraryModule />);
    fireEvent.change(search(), { target: { value: 'xyzzy' } });
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByText(/Nenhuma música encontrada/)).toBeTruthy();
    fireEvent.click(screen.getByText('Limpar busca e filtros'));
    expect(rowTitles()).toHaveLength(3);
  });

  it('keeps filters and sort after a visit to a song screen', async () => {
    render(<LibraryModule />);
    fireEvent.change(screen.getByLabelText('Fonte'), {
      target: { value: 'gp' },
    });
    fireEvent.change(screen.getByLabelText('Ordenar por'), {
      target: { value: 'tempo' },
    });
    fireEvent.click(row('Come Together'));
    await waitFor(() => screen.getByTestId('chart'));
    window.history.back();
    await waitFor(() => expect(screen.queryByTestId('chart')).toBeNull());
    expect((screen.getByLabelText('Fonte') as HTMLSelectElement).value).toBe(
      'gp',
    );
    expect(
      (screen.getByLabelText('Ordenar por') as HTMLSelectElement).value,
    ).toBe('tempo');
    expect(rowTitles()).toEqual(['Come Together']);
  });

  it('restores the scroll position when the list returns', async () => {
    const scrollTo = vi.fn();
    Object.defineProperty(window, 'scrollTo', {
      value: scrollTo,
      configurable: true,
    });
    render(<LibraryModule />);
    Object.defineProperty(window, 'scrollY', {
      value: 480,
      configurable: true,
    });
    fireEvent.scroll(window);
    fireEvent.click(row('Zebra'));
    await waitFor(() => screen.getByTestId('chart'));
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
    fireEvent.scroll(window);
    window.history.back();
    await waitFor(() => expect(screen.queryByTestId('chart')).toBeNull());
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 480 });
  });
});

describe('Correct the group of a chart', () => {
  const songs = () => [
    chartOf('a1', 'Come Together', 'The Beatles', 'gp'),
    chartOf('b1', 'Come Togther', 'The Beatles', 'midi'),
  ];

  it('moves the open chart to a different song; the address and the song screen show it', async () => {
    state.summaries = songs();
    window.history.replaceState(
      null,
      '',
      `#/biblioteca/${encodeURIComponent('come togther|the beatles')}/midi/bass`,
    );
    render(<LibraryModule />);
    await screen.findByTestId('chart');
    fireEvent.change(screen.getByLabelText('Mover a cifra para a música'), {
      target: { value: 'come together|the beatles' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Mover' }));
    await waitFor(() =>
      expect(window.location.hash).toBe(
        `#/biblioteca/${encodeURIComponent('come together|the beatles')}/midi/bass`,
      ),
    );
    expect(state.settings.get('b1')?.groupOverride).toBe(
      'come together|the beatles',
    );
    expect(await screen.findByText('Guitar Pro')).toBeTruthy();
    expect(screen.getByText('MIDI')).toBeTruthy();
  });

  it('does not offer a song that already holds a chart of the same source and part', async () => {
    state.summaries = [
      chartOf('m1', 'Come Together', 'The Beatles', 'midi'),
      chartOf('g1', 'Imagine', 'John Lennon', 'gp'),
      chartOf('m2', 'Come Togther', 'The Beatles', 'midi'),
      chartOf('g2', 'Yesterday', 'The Beatles', 'gp'),
    ];
    window.history.replaceState(
      null,
      '',
      `#/biblioteca/${encodeURIComponent('come togther|the beatles')}/midi/bass`,
    );
    render(<LibraryModule />);
    await screen.findByTestId('chart');
    const options = within(screen.getByLabelText('Mover a cifra para a música'))
      .getAllByRole('option')
      .map((option) => (option as HTMLOptionElement).value);
    expect(options).toContain('imagine|john lennon');
    expect(options).toContain('yesterday|the beatles');
    expect(options).not.toContain('come together|the beatles');
  });

  it('shows a message when the correction cannot be saved', async () => {
    state.summaries = songs();
    state.failSave = true;
    window.history.replaceState(
      null,
      '',
      `#/biblioteca/${encodeURIComponent('come togther|the beatles')}/midi/bass`,
    );
    render(<LibraryModule />);
    await screen.findByTestId('chart');
    fireEvent.change(screen.getByLabelText('Mover a cifra para a música'), {
      target: { value: 'come together|the beatles' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Mover' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(
      /Não foi possível salvar a correção/,
    );
    expect(window.location.hash).toContain(
      encodeURIComponent('come togther|the beatles'),
    );
  });

  it('opens the song that holds a moved chart after a new import of its file', async () => {
    state.summaries = songs();
    state.settings.set(
      'b1',
      withGroupOverride(
        null,
        'b1',
        'come together|the beatles',
        '2026-01-01T00:00:00.000Z',
      ),
    );
    state.importFile.mockResolvedValue({
      ...fixtureChart(1, [{ bar: 0, beat: 0, midi: 33 }]),
      id: 'b1',
      title: 'Come Togther',
      artist: 'The Beatles',
      source: 'midi',
    });
    const { container } = render(<LibraryModule />);
    await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(2));
    fireEvent.change(
      container.querySelector('input[type=file]') as HTMLElement,
      { target: { files: [new File(['x'], 'b.mid')] } },
    );
    await waitFor(() =>
      expect(window.location.hash).toBe(
        `#/biblioteca/${encodeURIComponent('come together|the beatles')}/midi/bass`,
      ),
    );
    expect((await screen.findByTestId('chart')).textContent).toBe('b1');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('separates the chart, then removes the override', async () => {
    state.summaries = [
      chartOf('a1', 'Come Together', 'The Beatles', 'gp'),
      chartOf('b1', 'Come Together', 'The Beatles', 'midi'),
    ];
    window.history.replaceState(
      null,
      '',
      `#/biblioteca/${encodeURIComponent('come together|the beatles')}/midi/bass`,
    );
    render(<LibraryModule />);
    await screen.findByTestId('chart');
    fireEvent.click(screen.getByRole('button', { name: 'Separar da música' }));
    await waitFor(() =>
      expect(window.location.hash).toContain(
        encodeURIComponent('separate:b1|'),
      ),
    );
    expect(state.settings.get('b1')?.groupOverride).toBe('separate');
    fireEvent.click(
      await screen.findByRole('button', { name: 'Remover correção' }),
    );
    await waitFor(() =>
      expect(window.location.hash).toBe(
        `#/biblioteca/${encodeURIComponent('come together|the beatles')}/midi/bass`,
      ),
    );
    expect(state.settings.get('b1')?.groupOverride).toBeNull();
  });
});
