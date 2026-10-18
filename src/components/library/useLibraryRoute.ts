import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  formatLibraryRoute,
  isLibraryHash,
  LIBRARY_HASH,
  parseLibraryRoute,
  type LibraryRoute,
} from '@/domain/libraryRoute';

export function useLibraryRoute() {
  const [hash, setHash] = useState(() => window.location.hash);

  useEffect(() => {
    if (!isLibraryHash(window.location.hash)) {
      window.history.replaceState(null, '', LIBRARY_HASH);
      setHash(LIBRARY_HASH);
    }
    const onChange = () => {
      if (!isLibraryHash(window.location.hash)) {
        window.history.replaceState(null, '', LIBRARY_HASH);
      }
      setHash(window.location.hash);
    };
    window.addEventListener('hashchange', onChange);
    window.addEventListener('popstate', onChange);
    return () => {
      window.removeEventListener('hashchange', onChange);
      window.removeEventListener('popstate', onChange);
    };
  }, []);

  const route = useMemo(() => parseLibraryRoute(hash), [hash]);

  const navigate = useCallback((next: LibraryRoute) => {
    window.location.hash = formatLibraryRoute(next);
    setHash(window.location.hash);
  }, []);

  return { route, navigate };
}
