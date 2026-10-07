// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import RocksmithTrackDetail from '@/components/library/RocksmithTrackDetail';
import { fixtureChart, walking } from '@/domain/bassChartFixture';
import type { BassChart } from '@/domain/bassChart';

const state = vi.hoisted(() => ({
  audio: { status: 'missing' } as { status: string; url?: string },
  synthChart: null as BassChart | null,
}));
vi.mock('@/hooks/useRocksmithAudio', () => ({
  useRocksmithAudio: () => ({
    audioState: state.audio,
    attach: vi.fn(),
    saveError: false,
  }),
}));
vi.mock('@/hooks/useBassSynth', () => ({
  useBassSynth: () => ({ playBassNote: vi.fn() }),
}));
vi.mock('@/hooks/useBassSynthPlayback', () => ({
  useBassSynthPlayback: (chart: BassChart) => {
    state.synthChart = chart;
    return {
      ready: true,
      playing: false,
      duration: 2,
      currentSeconds: 0,
      failed: false,
      play: vi.fn(),
      pause: vi.fn(),
      seek: vi.fn(),
    };
  },
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

const chart = {
  ...fixtureChart(1, walking([[48, 52, 55, 59]])),
  source: 'gp' as const,
};
beforeEach(() => {
  state.audio = { status: 'missing' };
  localStorage.clear();
  localStorage.setItem('music-theory-lab:fifths-window-open', 'false');
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

describe('Biblioteca semitone buttons', () => {
  it.each(['midi', 'gp'] as const)(
    'keeps %s tuning and requires an explicit Drop D choice for low notes',
    (source) => {
      const low = {
        ...fixtureChart(1, [
          { bar: 0, beat: 0, string: 0, fret: 0 },
          { bar: 0, beat: 1, string: 3, fret: 0 },
        ]),
        source,
      };
      render(<RocksmithTrackDetail chart={low} onRemove={vi.fn()} />);
      const lower = screen.getByRole('button', {
        name: 'Diminuir meio tom',
      }) as HTMLButtonElement;
      expect(lower.disabled).toBe(true);
      expect(state.synthChart!.tuning).toEqual([0, 0, 0, 0]);
      expect(
        screen.getByText(/Para baixar mais, selecione Drop D/),
      ).toBeTruthy();
      fireEvent.change(screen.getByLabelText('Afinação para tocar'), {
        target: { value: 'drop-d' },
      });
      expect(lower.disabled).toBe(false);
      expect(state.synthChart!.notes.map((n) => n.midi)).toEqual([28, 43]);
      fireEvent.click(lower);
      fireEvent.click(lower);
      expect(state.synthChart!.tuning).toEqual([-2, 0, 0, 0]);
      expect(
        state.synthChart!.notes.map((n) => [n.midi, n.string, n.fret]),
      ).toEqual([
        [26, 0, 0],
        [41, 2, 3],
      ]);
      expect(lower.disabled).toBe(true);
      expect(
        (
          screen.getByRole('option', {
            name: 'Original (E A D G)',
          }) as HTMLOptionElement
        ).disabled,
      ).toBe(true);
      fireEvent.click(screen.getByRole('button', { name: 'Tom original' }));
      expect(state.synthChart).toBe(low);
      expect(
        (screen.getByLabelText('Afinação para tocar') as HTMLSelectElement)
          .value,
      ).toBe('original');
    },
  );

  it.each(['midi', 'gp'] as const)(
    'transposes %s chords and synth notes in both directions, then restores the original',
    (source) => {
      render(
        <RocksmithTrackDetail
          chart={{ ...chart, source }}
          onRemove={vi.fn()}
        />,
      );
      fireEvent.click(screen.getByLabelText('Mostrar graus'));
      fireEvent.change(screen.getByLabelText('Tom para análise'), {
        target: { value: '0-major' },
      });
      expect(screen.getAllByText('Cmaj7').length).toBeGreaterThan(0);
      fireEvent.click(
        screen.getByRole('button', { name: 'Aumentar meio tom' }),
      );
      expect(state.synthChart!.notes.map((n) => n.midi)).toEqual([
        49, 53, 56, 60,
      ]);
      expect(screen.getAllByText('Dbmaj7').length).toBeGreaterThan(0);
      expect(
        (screen.getByLabelText('Tom para análise') as HTMLSelectElement).value,
      ).toBe('1-major');
      fireEvent.click(
        screen.getByRole('button', { name: 'Diminuir meio tom' }),
      );
      fireEvent.click(
        screen.getByRole('button', { name: 'Diminuir meio tom' }),
      );
      expect(state.synthChart!.notes.map((n) => n.midi)).toEqual([
        47, 51, 54, 58,
      ]);
      expect(screen.getAllByText('Bmaj7').length).toBeGreaterThan(0);
      fireEvent.click(screen.getByRole('button', { name: 'Tom original' }));
      expect(state.synthChart!.notes).toEqual(chart.notes);
      expect(screen.getAllByText('Cmaj7').length).toBeGreaterThan(0);
    },
  );

  it('disables transposition when an MP3/Ogg recording is attached, restoring the original score', () => {
    const { rerender } = render(
      <RocksmithTrackDetail chart={chart} onRemove={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Aumentar meio tom' }));
    state.audio = { status: 'ready', url: 'blob:recording' };
    rerender(<RocksmithTrackDetail chart={chart} onRemove={vi.fn()} />);
    expect(
      (
        screen.getByRole('button', {
          name: 'Aumentar meio tom',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole('button', {
          name: 'Diminuir meio tom',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(state.synthChart!.notes).toEqual(chart.notes);
    expect(
      (screen.getByLabelText('Afinação para tocar') as HTMLSelectElement)
        .disabled,
    ).toBe(true);
  });

  it('does not offer transposition for Rocksmith', () => {
    render(
      <RocksmithTrackDetail
        chart={{ ...chart, source: 'rocksmith' }}
        onRemove={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole('button', { name: 'Aumentar meio tom' }),
    ).toBeNull();
  });
});
