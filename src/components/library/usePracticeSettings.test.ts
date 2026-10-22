// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChartSettings } from '@/domain/chartSettings';

const stored = new Map<string, ChartSettings>();
let delay = Promise.resolve();

vi.mock('@/services/rocksmithLibrary', () => ({
  rocksmithLibrary: {
    getSettings: async (chartId: string) => {
      await delay;
      return stored.get(chartId) ?? null;
    },
    saveSettings: async (settings: ChartSettings) => {
      await delay;
      stored.set(settings.chartId, settings);
    },
  },
}));
vi.mock('@/services/chartSettingsSync', () => ({
  syncChartSettings: () => Promise.resolve(),
}));

const { usePracticeSettings } =
  await import('@/components/library/usePracticeSettings');

const chartId = 'c'.repeat(64);

beforeEach(() => {
  stored.clear();
  delay = Promise.resolve();
});

describe('saved practice settings of a chart', () => {
  it('keeps the saved key while the settings reload', async () => {
    const { result, rerender } = renderHook(
      ({ key }) => usePracticeSettings(chartId, key),
      { initialProps: { key: 0 } },
    );
    await act(() =>
      result.current.setTransposition({ semitones: 3, tuning: 'original' }),
    );
    let release = () => {};
    delay = new Promise((resolve) => (release = resolve));
    rerender({ key: 1 });
    expect(result.current.transposition.semitones).toBe(3);
    await act(async () => release());
    expect(result.current.transposition.semitones).toBe(3);
  });

  it('keeps an octave and a transposition saved at the same time', async () => {
    const { result } = renderHook(() => usePracticeSettings(chartId, 0));
    await waitFor(() => expect(stored.size).toBe(0));
    await act(async () => {
      await Promise.all([
        result.current.setOctave([2], 1),
        result.current.setTransposition({ semitones: 2, tuning: 'standard' }),
      ]);
    });
    expect(stored.get(chartId)?.barOctaves).toEqual({ 2: 1 });
    expect(stored.get(chartId)?.transposition).toEqual({
      semitones: 2,
      tuning: 'standard',
    });
    expect(result.current.octaves).toEqual({ 2: 1 });
    expect(result.current.transposition.semitones).toBe(2);
  });
});
