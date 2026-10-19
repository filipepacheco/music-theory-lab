import { useEffect, useLayoutEffect, useRef } from 'react';
import { parseLibraryRoute } from '@/domain/libraryRoute';

export function useListScroll(listShown: boolean) {
  const saved = useRef(0);
  const wasShown = useRef(listShown);

  useEffect(() => {
    if (!listShown) return;
    const onScroll = () => {
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
