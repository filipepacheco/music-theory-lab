import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { GrooveChart } from '@/components/structure/GrooveChart';

const steps = (on: number[]) =>
  Array.from({ length: 8 }, (_, step) => on.includes(step));

it('ends a last eighth note at its beat when the next beat has a rest', () => {
  const markup = renderToStaticMarkup(
    createElement(GrooveChart, {
      groove: {
        subdivision: '8n',
        measureCount: 1,
        bumbo: steps([]),
        caixa: steps([]),
        chimbal: steps([1]),
      },
      color: 'currentColor',
    }),
  );
  // An eighth on the 'and' of 1, then a quarter rest on beats 2, 3 and 4.
  expect(markup).not.toContain('data-dot');
  expect(markup).toContain('data-flag');
  expect(markup.match(/data-rest/g)).toHaveLength(3);
});

it('beams a triplet beat as eighths under a 3', () => {
  const triplet = (on: number[]) =>
    Array.from({ length: 12 }, (_, step) => on.includes(step));
  const markup = renderToStaticMarkup(
    createElement(GrooveChart, {
      groove: {
        subdivision: '8t',
        measureCount: 1,
        bumbo: triplet([]),
        caixa: triplet([]),
        chimbal: triplet([0, 1, 2]),
      },
      color: 'currentColor',
    }),
  );
  expect(markup.match(/data-tuplet/g)).toHaveLength(1);
  expect(markup).toMatch(/data-tuplet[^>]*>3</);
  expect(markup.match(/data-beam/g)).toHaveLength(2);
  expect(markup.match(/data-rest/g)).toHaveLength(3);
});

it('draws the crash on a ledger line and the ride with a cross head', () => {
  const markup = renderToStaticMarkup(
    createElement(GrooveChart, {
      groove: {
        subdivision: '8n',
        measureCount: 1,
        bumbo: steps([]),
        caixa: steps([]),
        chimbal: steps([]),
        ride: steps([2]),
        crash: steps([0]),
      },
      color: 'currentColor',
    }),
  );
  expect(markup).toContain('data-piece="crash"');
  expect(markup).toContain('data-piece="ride"');
  expect(markup.match(/data-ledger/g)).toHaveLength(1);
  expect(markup).not.toContain('<ellipse');
});

it('draws the toms with filled heads between the snare lines', () => {
  const markup = renderToStaticMarkup(
    createElement(GrooveChart, {
      groove: {
        subdivision: '8n',
        measureCount: 1,
        bumbo: steps([]),
        caixa: steps([]),
        chimbal: steps([]),
        tomAgudo: steps([0]),
        tomMedio: steps([1]),
        surdo: steps([2]),
      },
      color: 'currentColor',
    }),
  );
  for (const piece of ['tomAgudo', 'tomMedio', 'surdo']) {
    expect(markup).toContain(`data-piece="${piece}"`);
  }
  expect(markup.match(/<ellipse/g)).toHaveLength(3);
});

it('draws a hit that fills a triplet beat as a plain quarter', () => {
  const triplet = (on: number[]) =>
    Array.from({ length: 12 }, (_, step) => on.includes(step));
  const markup = renderToStaticMarkup(
    createElement(GrooveChart, {
      groove: {
        subdivision: '8t',
        measureCount: 1,
        bumbo: triplet([0]),
        caixa: triplet([]),
        chimbal: triplet([]),
      },
      color: 'currentColor',
    }),
  );
  expect(markup).not.toContain('data-dot');
  expect(markup).not.toContain('data-tuplet');
  expect(markup).not.toContain('data-flag');
});

it('writes a triplet fill in the last beat of a sixteenth-note groove', () => {
  const sixteenths = (on: number[]) =>
    Array.from({ length: 16 }, (_, step) => on.includes(step));
  const markup = renderToStaticMarkup(
    createElement(GrooveChart, {
      groove: {
        subdivision: '16n',
        measureCount: 1,
        bumbo: sixteenths([0, 8]),
        caixa: sixteenths([4]),
        chimbal: sixteenths([0, 2, 4, 6, 8, 10]),
        beats: {
          3: {
            subdivision: '8t',
            hits: {
              caixa: [true, true, false],
              tomAgudo: [false, false, true],
            },
          },
        },
      },
      color: 'currentColor',
    }),
  );
  expect(markup.match(/data-tuplet/g)).toHaveLength(1);
  expect(markup).toContain('data-piece="tomAgudo"');
  expect(markup).not.toContain('data-rest');
});
