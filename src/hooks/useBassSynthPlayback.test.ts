// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { fixtureChart, walking } from '@/domain/bassChartFixture';
import { transposeBassChart } from '@/domain/bassTransposition';
import { useBassSynthPlayback } from '@/hooks/useBassSynthPlayback';
import type { BassChart } from '@/domain/bassChart';

const voice = vi.hoisted(() => ({
  preloadBassNotes: vi.fn(async () => {}),
  scheduleBassNote: vi.fn(),
  stopBassNotes: vi.fn(),
  now: () => Date.now() / 1000,
}));
vi.mock('@/services/playbackEngine', () => ({
  ensureAudio: async () => true,
  playbackEngine: voice,
}));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('transposed synth playback', () => {
  it('keeps a playing song at its position while scheduling the shifted notes', async () => {
    vi.useFakeTimers();
    const original: BassChart = {
      ...fixtureChart(
        2,
        walking([
          [36, 40, 43, 47],
          [38, 41, 45, 48],
        ]),
      ),
      source: 'midi' as const,
    };
    const { result, rerender } = renderHook(
      ({ chart, shift }) => useBassSynthPlayback(chart, true, shift),
      { initialProps: { chart: original, shift: 0 } },
    );
    act(() => result.current.seek(2));
    await act(async () => {
      await result.current.play();
    });
    const shifted = transposeBassChart(original, 1);
    await act(async () => {
      rerender({ chart: shifted, shift: 1 });
    });
    expect(result.current.currentSeconds).toBe(2);
    expect(result.current.playing).toBe(true);
    expect(voice.scheduleBassNote).toHaveBeenLastCalledWith(
      38,
      0.6,
      0.5,
      expect.any(Number),
      1,
    );
    act(() => result.current.pause());
    await act(async () => {
      rerender({ chart: original, shift: 0 });
    });
    expect(result.current.currentSeconds).toBe(2);
    expect(result.current.playing).toBe(false);
  });
});
