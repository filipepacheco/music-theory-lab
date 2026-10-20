// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useOverflowHint } from '@/hooks/useOverflowHint';
afterEach(() => vi.unstubAllGlobals());
it('tracks offscreen tabs, scroll position and resize without hints when tabs fit', () => {
  let resize = () => {};
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  const node = document.createElement('nav');
  let width = 200;
  Object.defineProperties(node, {
    clientWidth: { get: () => width },
    scrollWidth: { value: 400 },
  });
  const ref = { current: node };
  const { result } = renderHook(() => useOverflowHint(ref));
  expect(result.current).toEqual({ before: false, after: true });
  act(() => {
    node.scrollLeft = 200;
    node.dispatchEvent(new Event('scroll'));
  });
  expect(result.current).toEqual({ before: true, after: false });
  act(() => {
    width = 400;
    resize();
  });
  expect(result.current).toEqual({ before: false, after: false });
});
