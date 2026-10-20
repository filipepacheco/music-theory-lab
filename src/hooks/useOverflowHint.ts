import { useLayoutEffect, useState, type RefObject } from 'react';

export function useOverflowHint(ref: RefObject<HTMLElement | null>) {
  const [edges, setEdges] = useState({ before: false, after: false });
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const update = () => {
      const max = node.scrollWidth - node.clientWidth;
      setEdges({
        before: max > 1 && node.scrollLeft > 1,
        after: max > 1 && node.scrollLeft < max - 1,
      });
    };
    update();
    node.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(node);
    return () => {
      node.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      observer?.disconnect();
    };
  }, [ref]);
  return edges;
}
