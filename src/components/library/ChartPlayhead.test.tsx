// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import ChartPlayhead, {
  PlayheadAnimation,
} from '@/components/library/ChartPlayhead';
import type { LibraryAudio } from '@/components/library/useLibraryAudio';

const bars = [0, 1].map((index) => ({
  index,
  startTime: index * 2,
  endTime: index * 2 + 2,
  beatCount: 4,
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('moves only the SVG cursor on animation frames without rendering the song', () => {
  let frame = () => {};
  const cancel = vi.fn();
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => {
    frame = callback;
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', cancel);
  let position = 0;
  let renders = 0;
  const audio: LibraryAudio = {
    ready: true,
    playing: true,
    currentSeconds: 0,
    duration: 4,
    readPosition: () => position,
    play: async () => {},
    pause: () => {},
    seek: () => {},
  };
  function Song() {
    renders += 1;
    return (
      <PlayheadAnimation chart={{ bars, sections: [] }} audio={audio}>
        <svg>
          {bars.map((bar) => (
            <ChartPlayhead
              key={bar.index}
              bar={bar}
              progress={null}
              start={8}
              width={100}
              height={40}
            />
          ))}
        </svg>
      </PlayheadAnimation>
    );
  }
  const view = render(<Song />);
  position = 1;
  frame();
  const first = view.container.querySelector('[data-playhead]')!;
  expect(first.getAttribute('x1')).toBe('58');
  position = 1.5;
  frame();
  expect(first.getAttribute('x1')).toBe('83');
  position = 2.5;
  frame();
  expect(first.hasAttribute('data-playhead')).toBe(false);
  expect(
    view.container.querySelector('[data-playhead]')?.getAttribute('x1'),
  ).toBe('33');
  expect(renders).toBe(1);
  view.unmount();
  expect(cancel).toHaveBeenCalled();
});
