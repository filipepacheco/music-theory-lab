// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  waitFor,
} from '@testing-library/react';
import { createElement } from 'react';
import LibraryPlayer from '@/components/library/LibraryPlayer';
import { fixtureChart, walking } from '@/domain/bassChartFixture';
import { summarizeChart } from '@/domain/chartSummary';
import { fixtureDrumChart } from '@/domain/drumChartFixture';
import { fixtureGuitarChart } from '@/domain/guitarChartFixture';
import { partChartId } from '@/services/chartId';
import { useSongPartsPlayback } from '@/hooks/useSongPartsPlayback';

const engine = vi.hoisted(() => ({
  preloadBassNotes: vi.fn(async () => {}),
  preloadDrumSamples: vi.fn(async () => {}),
  scheduleBassNote: vi.fn(),
  scheduleDrumHit: vi.fn(),
  scheduleGuitarNote: vi.fn(),
  stopGuitarNotes: vi.fn(),
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
  it('routes Space through the Library player to all parts of the open song', async () => {
    const { bass, summaries } = await songOf('same');
    const { result } = renderHook(() =>
      useSongPartsPlayback(bass.id, 'bass', summaries),
    );
    act(() => result.current.reportRecording(bass.id, false));
    await waitFor(() => expect(result.current.active).toBe(true));
    const player = render(
      createElement(LibraryPlayer, {
        audio: result.current.audio,
      }),
    );
    await act(async () => {
      fireEvent.keyDown(document.body, { key: ' ', code: 'Space' });
    });
    expect(result.current.audio.playing).toBe(true);
    expect(engine.scheduleBassNote).toHaveBeenCalled();
    expect(engine.scheduleDrumHit).toHaveBeenCalled();
    player.rerender(
      createElement(LibraryPlayer, {
        audio: result.current.audio,
      }),
    );
    act(() => {
      fireEvent.keyDown(document.body, { key: ' ', code: 'Space' });
    });
    expect(result.current.audio.playing).toBe(false);
    expect(engine.stopBassNotes).toHaveBeenCalled();
    expect(engine.stopDrumHits).toHaveBeenCalled();
  });

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

  async function playingPair(extra: ReturnType<typeof summarizeChart>[] = []) {
    const song = await songOf('same');
    const all = [...song.summaries, ...extra];
    const hook = renderHook(
      (p: { id: string; part: 'bass' | 'drums' }) =>
        useSongPartsPlayback(p.id, p.part, all),
      { initialProps: { id: song.bass.id, part: 'bass' as 'bass' | 'drums' } },
    );
    act(() => {
      hook.result.current.reportRecording(song.bass.id, false);
    });
    await waitFor(() => expect(hook.result.current.active).toBe(true));
    await act(async () => {
      await hook.result.current.audio.play();
    });
    expect(hook.result.current.audio.playing).toBe(true);
    return { ...song, hook };
  }

  it('keeps playing across a change of part: the new part reports only after its storage answers', async () => {
    const { drums, hook } = await playingPair();
    hook.rerender({ id: drums.id, part: 'drums' });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });
    act(() => {
      hook.result.current.reportRecording(drums.id, false);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });
    expect(hook.result.current.active).toBe(true);
    expect(hook.result.current.audio.playing).toBe(true);
    expect(hook.result.current.audio.currentSeconds).toBeGreaterThan(0);
    expect(engine.stopBassNotes).not.toHaveBeenCalled();
    expect(engine.stopDrumHits).not.toHaveBeenCalled();
    act(() => hook.result.current.audio.pause());
  });

  it('stops cleanly when the new part turns out to have a linked recording', async () => {
    const { drums, hook } = await playingPair();
    hook.rerender({ id: drums.id, part: 'drums' });
    act(() => {
      hook.result.current.reportRecording(drums.id, true);
    });
    expect(hook.result.current.active).toBe(false);
    expect(hook.result.current.audio.playing).toBe(false);
    expect(engine.stopBassNotes).toHaveBeenCalled();
  });

  it('is inactive at once for a part of another song, before the new pair resolves', async () => {
    const { hook } = await playingPair();
    hook.rerender({ id: 'e'.repeat(64), part: 'bass' });
    expect(hook.result.current.active).toBe(false);
  });

  it('resets the mutes on a new song and keeps them on a change of part', async () => {
    const otherId = 'f'.repeat(64);
    const otherBass = {
      ...fixtureChart(2, walking([[36, 40, 43, 47]])),
      id: otherId,
    };
    const otherDrums = {
      ...fixtureDrumChart(2, [{ bar: 0, beat: 0, midi: 36 }]),
      id: await partChartId(otherId, 'drums'),
    };
    library.charts.set(otherBass.id, otherBass);
    library.charts.set(otherDrums.id, otherDrums);
    const { drums, hook } = await playingPair([
      summarizeChart(otherBass),
      summarizeChart(otherDrums),
    ]);
    act(() => hook.result.current.toggleMute('drums'));
    expect(hook.result.current.mutes.drums).toBe(true);
    hook.rerender({ id: drums.id, part: 'drums' });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(hook.result.current.mutes.drums).toBe(true);

    hook.rerender({ id: otherId, part: 'bass' });
    await waitFor(() => expect(hook.result.current.mutes.drums).toBe(false));
  });
});

describe('useSongPartsPlayback with a guitar chart', () => {
  async function songWithGuitar(partName = 'Guitarra 1 - Rhythm') {
    const { bass, drums, summaries } = await songOf('same');
    const guitar = {
      ...fixtureGuitarChart(
        2,
        [
          { bar: 0, beat: 0, string: 2, fret: 2 },
          { bar: 0, beat: 1, string: 3, fret: 2 },
        ],
        { partName, trackIndex: 2 },
      ),
      id: await partChartId(BASS_ID, 'guitar', 2),
    };
    library.charts.set(guitar.id, guitar);
    return {
      bass,
      drums,
      guitar,
      all: [...summaries, summarizeChart(guitar)],
    };
  }

  it('plays the guitar with the bass and the drums on one clock', async () => {
    const { bass, guitar, all } = await songWithGuitar();
    const { result } = renderHook(() =>
      useSongPartsPlayback(bass.id, 'bass', all),
    );
    act(() => result.current.reportRecording(bass.id, false));
    await waitFor(() => expect(result.current.active).toBe(true));
    await act(async () => {
      await result.current.audio.play();
    });
    expect(engine.scheduleGuitarNote).toHaveBeenCalled();
    const [key, midi, , , guitarWhen] = engine.scheduleGuitarNote.mock
      .calls[0] as unknown[];
    expect(key).toBe(guitar.id);
    expect(midi).toBe(guitar.notes[0].midi);
    const bassWhen = engine.scheduleBassNote.mock.calls[0][3] as number;
    expect(Math.abs((guitarWhen as number) - bassWhen)).toBeLessThan(0.001);
    act(() => result.current.audio.pause());
  });

  it('pairs a guitar chart that is the open part with the bass and the drums', async () => {
    const { guitar, all } = await songWithGuitar();
    const { result } = renderHook(() =>
      useSongPartsPlayback(guitar.id, 'guitar', all),
    );
    act(() => result.current.reportRecording(guitar.id, false));
    await waitFor(() => expect(result.current.active).toBe(true));
    await act(async () => {
      await result.current.audio.play();
    });
    expect(engine.scheduleBassNote).toHaveBeenCalled();
    expect(engine.scheduleDrumHit).toHaveBeenCalled();
    expect(engine.scheduleGuitarNote).toHaveBeenCalled();
    act(() => result.current.audio.pause());
  });

  it('has a mute for the guitar named with its part name', async () => {
    const { bass, guitar, all } = await songWithGuitar('Guitarra 2 - Lead');
    const { result } = renderHook(() =>
      useSongPartsPlayback(bass.id, 'bass', all),
    );
    await waitFor(() => expect(result.current.controls).toHaveLength(3));
    expect(result.current.controls).toContainEqual({
      key: guitar.id,
      label: 'Guitarra 2 - Lead',
    });
  });

  it('silences only the guitar with its mute', async () => {
    const { bass, guitar, all } = await songWithGuitar();
    const { result } = renderHook(() =>
      useSongPartsPlayback(bass.id, 'bass', all),
    );
    act(() => result.current.reportRecording(bass.id, false));
    await waitFor(() => expect(result.current.active).toBe(true));
    act(() => result.current.toggleMute(guitar.id));
    await act(async () => {
      await result.current.audio.play();
    });
    expect(engine.scheduleGuitarNote).not.toHaveBeenCalled();
    expect(engine.scheduleBassNote).toHaveBeenCalled();
    expect(engine.scheduleDrumHit).toHaveBeenCalled();
    act(() => result.current.audio.pause());
  });

  it('stops only the ringing guitar notes when the guitar is muted while playing', async () => {
    const { bass, guitar, all } = await songWithGuitar();
    const { result } = renderHook(() =>
      useSongPartsPlayback(bass.id, 'bass', all),
    );
    act(() => result.current.reportRecording(bass.id, false));
    await waitFor(() => expect(result.current.active).toBe(true));
    await act(async () => {
      await result.current.audio.play();
    });
    engine.stopBassNotes.mockClear();
    engine.stopDrumHits.mockClear();
    act(() => result.current.toggleMute(guitar.id));
    expect(engine.stopGuitarNotes).toHaveBeenCalledWith(guitar.id);
    expect(engine.stopBassNotes).not.toHaveBeenCalled();
    expect(engine.stopDrumHits).not.toHaveBeenCalled();
    act(() => result.current.audio.pause());
  });
});
