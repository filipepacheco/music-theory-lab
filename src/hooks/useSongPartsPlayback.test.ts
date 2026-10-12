// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { fixtureChart, walking } from '@/domain/bassChartFixture';
import { summarizeChart } from '@/domain/chartSummary';
import { fixtureDrumChart } from '@/domain/drumChartFixture';
import { partChartId } from '@/services/chartId';
import { useSongPartsPlayback } from '@/hooks/useSongPartsPlayback';

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

const library = vi.hoisted(() => ({
  charts: new Map<string, unknown>(),
  audio: new Set<string>(),
}));
vi.mock('@/services/rocksmithLibrary', () => ({
  rocksmithLibrary: {
    getChart: async (id: string) => library.charts.get(id) ?? null,
    getAudio: async (id: string) =>
      library.audio.has(id) ? { fileName: 'x.mp3', blob: new Blob() } : null,
  },
}));

const BASS_ID = 'b'.repeat(64);

async function songOf(drumFileOf: 'same' | 'other') {
  const bass = {
    ...fixtureChart(
      2,
      walking([
        [36, 40, 43, 47],
        [38, 41, 45, 48],
      ]),
    ),
    id: BASS_ID,
  };
  const drumId =
    drumFileOf === 'same'
      ? await partChartId(BASS_ID, 'drums')
      : await partChartId('c'.repeat(64), 'drums');
  const drums = {
    ...fixtureDrumChart(2, [
      { bar: 0, beat: 0, midi: 36 },
      { bar: 0, beat: 2, midi: 38 },
    ]),
    id: drumId,
  };
  library.charts.set(bass.id, bass);
  library.charts.set(drums.id, drums);
  return {
    bass,
    drums,
    summaries: [summarizeChart(bass), summarizeChart(drums)],
  };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
  library.charts.clear();
  library.audio.clear();
});

describe('useSongPartsPlayback', () => {
  it('pairs the bass chart with the drum chart of its file and plays both on one clock', async () => {
    const { bass, summaries } = await songOf('same');
    const { result } = renderHook(() =>
      useSongPartsPlayback(bass.id, 'bass', summaries),
    );
    act(() => {
      result.current.reportRecording(bass.id, false);
    });
    await waitFor(() => expect(result.current.active).toBe(true));
    await act(async () => {
      await result.current.audio.play();
    });
    expect(result.current.audio.playing).toBe(true);
    expect(engine.scheduleBassNote).toHaveBeenCalled();
    expect(engine.scheduleDrumHit).toHaveBeenCalled();
    const bassWhen = engine.scheduleBassNote.mock.calls[0][3] as number;
    const drumWhen = engine.scheduleDrumHit.mock.calls[0][1] as number;
    // Both first events sit at chart time 0: the same moment on the clock.
    expect(Math.abs(bassWhen - drumWhen)).toBeLessThan(0.001);
    act(() => result.current.audio.pause());
  });

  it('keeps the pair when the drum part is the open one', async () => {
    const { drums, summaries } = await songOf('same');
    const { result } = renderHook(() =>
      useSongPartsPlayback(drums.id, 'drums', summaries),
    );
    act(() => {
      result.current.reportRecording(drums.id, false);
    });
    await waitFor(() => expect(result.current.active).toBe(true));
  });

  it('does not pair a drum chart of another file: only the open part plays', async () => {
    const { bass, summaries } = await songOf('other');
    const { result } = renderHook(() =>
      useSongPartsPlayback(bass.id, 'bass', summaries),
    );
    act(() => {
      result.current.reportRecording(bass.id, false);
    });
    // Let the pair lookup and the chart loads settle.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(result.current.active).toBe(false);
    await act(async () => {
      await result.current.audio.play();
    });
    expect(engine.scheduleBassNote).not.toHaveBeenCalled();
    expect(engine.scheduleDrumHit).not.toHaveBeenCalled();
  });

  it('turns the shared clock off with a recording linked to the open part', async () => {
    const { bass, summaries } = await songOf('same');
    const { result } = renderHook(() =>
      useSongPartsPlayback(bass.id, 'bass', summaries),
    );
    act(() => {
      result.current.reportRecording(bass.id, true);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(result.current.active).toBe(false);
  });

  it('turns the shared clock off with a recording linked to the other part', async () => {
    const { bass, drums, summaries } = await songOf('same');
    library.audio.add(drums.id);
    const { result } = renderHook(() =>
      useSongPartsPlayback(bass.id, 'bass', summaries),
    );
    act(() => {
      result.current.reportRecording(bass.id, false);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(result.current.active).toBe(false);
    await act(async () => {
      await result.current.audio.play();
    });
    expect(engine.scheduleDrumHit).not.toHaveBeenCalled();
  });
});
