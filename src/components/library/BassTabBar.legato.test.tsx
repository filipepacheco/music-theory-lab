// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import BassTabBar, {
  legatoArcs,
  type IndexedNote,
} from '@/components/library/BassTabBar';
import type { BassChartNote, BassTechnique } from '@/domain/bassChart';

afterEach(cleanup);

function indexed(
  index: number,
  beatInBar: number,
  fret: number,
  techniques: BassTechnique[] = [],
  string = 1,
): IndexedNote {
  const note: BassChartNote = {
    time: beatInBar / 2,
    endTime: beatInBar / 2 + 0.25,
    string,
    fret,
    midi: 33 + fret,
    sustain: 0.25,
    bar: 0,
    beatInBar,
    slideToFret: null,
    techniques,
  };
  return { note, index };
}

it('draws a slur from the note before each hammer-on and pull-off on its string', () => {
  const notes = [
    indexed(0, 0, 5),
    indexed(1, 0.5, 3, [], 0),
    indexed(2, 1, 7, ['hammerOn']),
    indexed(3, 1.5, 5, ['pullOff']),
  ];
  const arcs = legatoArcs(notes, 34);
  expect(arcs.map((arc) => [arc.index, arc.technique])).toEqual([
    [2, 'hammerOn'],
    [3, 'pullOff'],
  ]);
  // The hammer-on starts over the 5 on its own string, not the 3 on another.
  expect(arcs[0].d).toMatch(/^M 11\.3 /);
});

it('starts the slur at the left edge when the first note is in the bar before', () => {
  const [arc] = legatoArcs([indexed(0, 0, 7, ['hammerOn'])], 34);
  expect(arc.d).toMatch(/^M 0 /);
});

it('draws the slurs and says them in the bar label', () => {
  const { container } = render(
    <BassTabBar
      bar={{ index: 0, startTime: 0, endTime: 2, beatCount: 4 }}
      notes={[indexed(0, 0, 5), indexed(1, 1, 7, ['hammerOn'])]}
      activeNotes={[]}
      playhead={null}
      onSeek={null}
      analysis={null}
      segment={null}
      avoidNotes={null}
      noteNames={[]}
    />,
  );
  expect(
    container.querySelectorAll('[data-legato-arc="hammerOn"]'),
  ).toHaveLength(1);
  expect(container.querySelector('svg')?.getAttribute('aria-label')).toBe(
    'Compasso 1: 5 hammer-on 7',
  );
});
