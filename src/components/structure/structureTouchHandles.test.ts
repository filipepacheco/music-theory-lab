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

it('blocks pan only on bar and section handles, leaving section content scrollable', async () => {
  const { useAppStore } = await import('@/store/useAppStore');
  const { default: StructureSections } =
    await import('@/components/structure/StructureSections');
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
  const markup = renderToStaticMarkup(createElement(StructureSections));
  const handles = markup.match(/<[^>]+role="button"[^>]*>/g) ?? [];
  expect(handles).toHaveLength(2);
  for (const handle of handles) expect(handle).toContain('touch-action:none');
  expect(markup.match(/touch-action:none/g)).toHaveLength(2);
});
