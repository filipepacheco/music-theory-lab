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
