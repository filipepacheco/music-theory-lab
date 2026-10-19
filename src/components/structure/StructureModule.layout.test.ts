// @vitest-environment happy-dom
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';

vi.mock('tone', () => {
  class AudioNode {
    toDestination() {
      return this;
    }
    connect() {
      return this;
    }
    load() {
      return Promise.resolve(this);
    }
  }
  return {
    MembraneSynth: AudioNode,
    NoiseSynth: AudioNode,
    Filter: AudioNode,
    Limiter: AudioNode,
    Reverb: AudioNode,
    Sampler: AudioNode,
    Player: AudioNode,
  };
});

beforeAll(() => {
  vi.stubGlobal('localStorage', { getItem: () => null });
});

afterAll(() => vi.unstubAllGlobals());

it('keeps drag handles inside the arrangement below adaptive recording controls', async () => {
  const { useAppStore } = await import('@/store/useAppStore');
  const { default: StructureModule } =
    await import('@/components/structure/StructureModule');
  Object.assign(useAppStore.getInitialState(), {
    structureBars: [{ id: 'bar', index: 0, timeSignature: '4/4' }],
    structureSections: [
      {
        id: 'intro',
        name: 'Intro',
        color: '#123456',
        barIds: ['bar'],
      },
    ],
  });
  const markup = renderToStaticMarkup(createElement(StructureModule));
  const root = document.createElement('div');
  root.innerHTML = markup;
  expect(root.querySelector('.structure-controls')).not.toBeNull();
  expect(root.querySelector('.structure-controls')?.textContent).toContain(
    'Compasso',
  );
  expect(
    root.querySelector('.structure-controls input[aria-label="Nome da seção"]'),
  ).not.toBeNull();
  const handles = markup.match(/<[^>]+role="button"[^>]*>/g) ?? [];
  expect(handles).toHaveLength(2);
  for (const handle of handles) expect(handle).toContain('touch-action:none');
  expect(markup.match(/touch-action:none/g)).toHaveLength(2);
});
