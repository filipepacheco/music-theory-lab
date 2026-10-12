import { useEffect, useLayoutEffect, useRef } from 'react';
import { parseLibraryRoute } from '@/domain/libraryRoute';

/**
 * Keep the scroll position of the list screen. The position is saved while
 * the list shows, and set again when the list shows after a song screen.
 */
export function useListScroll(listShown: boolean) {
  const saved = useRef(0);
  const wasShown = useRef(listShown);

  useEffect(() => {
    if (!listShown) return;
    const onScroll = () => {
      // The address changes before the list unmounts and the page shrinks, so
      // a scroll that follows a song address is a clamp, not the musician.
      if (parseLibraryRoute(window.location.hash).screen !== 'list') return;
      saved.current = window.scrollY;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [listShown]);

  useLayoutEffect(() => {
    if (listShown && !wasShown.current) {
      window.scrollTo({ top: saved.current });
    }
    wasShown.current = listShown;
  }, [listShown]);
}
