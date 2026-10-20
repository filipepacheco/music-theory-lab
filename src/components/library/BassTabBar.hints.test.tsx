// @vitest-environment happy-dom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import BassTabBar from '@/components/library/BassTabBar';
import type { BarAnalysis } from '@/domain/bassAnalysis';

afterEach(cleanup);

it.each([
  ['estimated', 'sem nota no tempo 1: raiz estimada'],
  ['tied', 'raiz ligada do compasso anterior'],
] as const)(
  'keeps %s root evidence readable while seeking',
  (rootSource, text) => {
    const analysis: BarAnalysis = {
      bar: 1,
      root: 0,
      rootSource,
      notes: [
        {
          index: 0,
          midi: 41,
          interval: 5,
          role: 'chordTone',
          category: 'tension',
        },
      ],
      evidence: {
        intervals: [0],
        third: null,
        fifth: null,
        seventh: null,
        chordType: null,
      },
      counts: {
        root: 1,
        third: 0,
        fifth: 0,
        seventh: 0,
        tension: 0,
        ornament: 0,
      },
      motion: { repeats: 0, steps: 0, leaps: 0 },
    };
    const seek = vi.fn();
    const props = {
      bar: { index: 1, startTime: 2, endTime: 4, beatCount: 4 },
      notes: [
        {
          index: 0,
          note: {
            time: 2,
            endTime: 3,
            string: 0,
            fret: 13,
            midi: 41,
            sustain: 1,
            bar: 1,
            beatInBar: 0,
            slideToFret: null,
            techniques: [],
          },
        },
      ],
      activeNotes: [],
      playhead: null,
      onSeek: seek,
      analysis,
      segment: null,
      avoidNotes: new Set([0]),
      noteNames: ['C'],
      repeatOf: 0,
      octave: 1,
    };
    const view = render(<BassTabBar {...props} />);
    fireEvent.click(view.getByRole('button'));
    const disclosure = view.getByText(
      /sem nota no tempo 1: raiz estimada|raiz ligada do compasso anterior/,
    );
    expect(disclosure.textContent).toContain(text);
    expect(disclosure.textContent).toContain('sem 3ª');
    expect(disclosure.textContent).toContain('igual ao compasso 1');
    expect(disclosure.textContent).toContain('1 oitava acima');
    expect(disclosure.textContent).toContain(
      'O baixo não tocou a 3ª: pode ser maior ou menor',
    );
    expect(disclosure.textContent).toContain(
      'Nota evitada: forma b9 com uma nota do acorde',
    );
    expect(seek).toHaveBeenCalledWith(2);
    fireEvent.click(view.getByRole('button'));
    expect(seek).toHaveBeenCalledWith(2);
    view.rerender(<BassTabBar {...props} selected />);
    expect(disclosure.isConnected).toBe(true);
    expect(disclosure.textContent).toContain(text);
    view.unmount();
    const withoutSeek = render(<BassTabBar {...props} onSeek={null} />);
    fireEvent.click(withoutSeek.getByRole('button'));
    expect(
      withoutSeek.getByText(
        /sem nota no tempo 1: raiz estimada|raiz ligada do compasso anterior/,
      ).textContent,
    ).toContain(text);
  },
);
