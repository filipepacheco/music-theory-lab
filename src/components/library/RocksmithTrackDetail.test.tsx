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
  it('switches GP fingering without changing pitches, and restores the choice after transposition', () => {
    const gp = {
      ...fixtureChart(1, [
        { bar: 0, beat: 0, string: 0, fret: 0 },
        { bar: 0, beat: 1, string: 2, fret: 2 },
      ]),
      source: 'gp' as const,
      originalFingering: [
        { string: 0, fret: 0 },
        { string: 1, fret: 7 },
      ],
    };
    render(<RocksmithTrackDetail chart={gp} onRemove={vi.fn()} />);
    const picker = screen.getByLabelText('Digitação') as HTMLSelectElement;
    expect(picker.value).toBe('original');
    expect(
      screen.getByText(/Cordas e casas seguem a digitação original do GP/),
    ).toBeTruthy();
    expect(state.synthChart!.notes[1]).toMatchObject({
      midi: 40,
      string: 1,
      fret: 7,
    });
    fireEvent.change(picker, { target: { value: 'suggested' } });
    expect(
      screen.getByText(/Cordas e casas são uma sugestão automática/),
    ).toBeTruthy();
    expect(state.synthChart!.notes[1]).toMatchObject({
      midi: 40,
      string: 2,
      fret: 2,
    });
    fireEvent.change(picker, { target: { value: 'original' } });
    fireEvent.click(screen.getByRole('button', { name: 'Diminuir meio tom' }));
    expect(picker.disabled).toBe(true);
    expect(picker.value).toBe('suggested');
    expect(state.synthChart!.notes.map((n) => n.midi)).toEqual([39, 51]);
    fireEvent.click(screen.getByRole('button', { name: 'Tom original' }));
    expect(picker.disabled).toBe(false);
    expect(picker.value).toBe('original');
    expect(state.synthChart!.notes[1]).toMatchObject({
      midi: 40,
      string: 1,
      fret: 7,
    });
    fireEvent.change(screen.getByLabelText('Afinação para tocar'), {
      target: { value: 'drop-d' },
    });
    expect(picker.disabled).toBe(true);
    expect(picker.value).toBe('suggested');
    fireEvent.change(screen.getByLabelText('Afinação para tocar'), {
      target: { value: 'original' },
    });
    expect(picker.value).toBe('original');
    expect(state.synthChart!.notes.map((n) => n.midi)).toEqual(
      gp.notes.map((n) => n.midi),
    );
  });

  it('explains how to recover original fingering for older GP imports', () => {
    render(<RocksmithTrackDetail chart={chart} onRemove={vi.fn()} />);
    expect(
      (screen.getByLabelText('Digitação') as HTMLSelectElement).disabled,
    ).toBe(true);
    expect(screen.getByText(/Reimporte o arquivo para recuperar/)).toBeTruthy();
  });

  it('does not offer an original tab choice for MIDI imports', () => {
    render(
      <RocksmithTrackDetail
        chart={{ ...chart, source: 'midi' }}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText('Digitação')).toBeNull();
  });

  it('offers E Standard and Drop D for imports with a different tuning', () => {
    render(
      <RocksmithTrackDetail
        chart={{ ...chart, tuning: [-2, -2, -2, -2] }}
        onRemove={vi.fn()}
      />,
    );
    const tuning = screen.getByLabelText('Afinação para tocar');
    fireEvent.change(tuning, { target: { value: 'standard' } });
    expect(state.synthChart!.tuning).toEqual([0, 0, 0, 0]);
    expect(state.synthChart!.notes.map((n) => n.midi)).toEqual(
      chart.notes.map((n) => n.midi),
    );
    fireEvent.change(tuning, { target: { value: 'drop-d' } });
    expect(state.synthChart!.tuning).toEqual([-2, 0, 0, 0]);
  });
  it('limits transposition and tuning choices when the full line cannot fit', () => {
    const wide = {
      ...fixtureChart(1, [
        { bar: 0, beat: 0, string: 0, fret: 0 },
        { bar: 0, beat: 1, string: 3, fret: 24 },
      ]),
      source: 'gp' as const,
    };
    render(<RocksmithTrackDetail chart={wide} onRemove={vi.fn()} />);
    const lower = screen.getByRole('button', {
      name: 'Diminuir meio tom',
    }) as HTMLButtonElement;
    const raise = screen.getByRole('button', {
      name: 'Aumentar meio tom',
    }) as HTMLButtonElement;
    expect(lower.disabled).toBe(true);
    expect(raise.disabled).toBe(true);
    expect(
      screen.getByText(
        /A transposição foi limitada para preservar os intervalos/,
      ),
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Afinação para tocar'), {
      target: { value: 'drop-d' },
    });
    expect(lower.disabled).toBe(false);
    fireEvent.click(lower);
    expect(state.synthChart!.notes.map((n) => n.midi)).toEqual([27, 66]);
    expect(
      (
        screen.getByRole('option', {
          name: 'E Standard (E A D G)',
        }) as HTMLOptionElement
      ).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Tom original' }));
    expect(state.synthChart).toBe(wide);
  });
  it.each(['midi', 'gp'] as const)(
    'lowers %s in E Standard and independently switches to Drop D and back',
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
      expect(lower.disabled).toBe(false);
      expect(state.synthChart!.tuning).toEqual([0, 0, 0, 0]);
      fireEvent.click(lower);
      fireEvent.click(lower);
      expect(state.synthChart!.notes.map((n) => n.midi)).toEqual([38, 53]);
      expect(state.synthChart!.tuning).toEqual([0, 0, 0, 0]);
      expect(screen.getByText(/Linha inteira 1 oitava acima/)).toBeTruthy();
      fireEvent.change(screen.getByLabelText('Afinação para tocar'), {
        target: { value: 'drop-d' },
      });
      expect(lower.disabled).toBe(false);
      expect(state.synthChart!.tuning).toEqual([-2, 0, 0, 0]);
      expect(
        state.synthChart!.notes.map((n) => [n.midi, n.string, n.fret]),
      ).toEqual([
        [26, 0, 0],
        [41, 2, 3],
      ]);
      expect(lower.disabled).toBe(false);
      expect(screen.queryByText(/Linha inteira 1 oitava acima/)).toBeNull();
      expect(
        (
          screen.getByRole('option', {
            name: 'E Standard (E A D G)',
          }) as HTMLOptionElement
        ).disabled,
      ).toBe(false);
      fireEvent.change(screen.getByLabelText('Afinação para tocar'), {
        target: { value: 'original' },
      });
      expect(state.synthChart!.tuning).toEqual([0, 0, 0, 0]);
      expect(state.synthChart!.notes.map((n) => n.midi)).toEqual([38, 53]);
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
