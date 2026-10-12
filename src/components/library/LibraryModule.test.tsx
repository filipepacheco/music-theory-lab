// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import LibraryModule from '@/components/library/LibraryModule';
import { fixtureChart } from '@/domain/bassChartFixture';
import { summarizeChart, type ChartSummary } from '@/domain/chartSummary';
import type { BassChart } from '@/domain/bassChart';

const state = vi.hoisted(() => ({
  summaries: [] as ChartSummary[],
  tracks: [] as Array<{
    source_sha256: string;
    title: string;
    artist: string;
    duration_seconds: number;
  }>,
  open: vi.fn(),
  importFile: vi.fn(),
}));

vi.mock('@/hooks/useRocksmithCharts', () => ({
  useRocksmithCharts: () => ({
    summaries: state.summaries,
    openId: null,
    openChart: null,
    open: state.open,
    importStatus: { state: 'idle' },
    importFile: state.importFile,
    remove: vi.fn(),
    syncStatus: 'synced',
    synchronize: vi.fn(),
  }),
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
  return screen.getByText(title).closest('button') as HTMLElement;
}

beforeEach(() => {
  state.summaries = [];
  state.tracks = [];
  state.open.mockReset().mockResolvedValue(undefined);
  state.importFile.mockReset();
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
    expect(state.open).toHaveBeenCalledWith('gp1');
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
    await waitFor(() => expect(state.open).toHaveBeenCalledWith('m2'));
    expect(screen.queryByText(/entrou na música/)).toBeNull();
  });
});
