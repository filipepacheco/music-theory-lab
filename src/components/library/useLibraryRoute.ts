import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  formatLibraryRoute,
  isLibraryHash,
  LIBRARY_HASH,
  parseLibraryRoute,
  type LibraryRoute,
} from '@/domain/libraryRoute';

/**
 * The screen of the Biblioteca, kept in the hash of the address. A new
 * screen is a new history entry, so the browser Back button returns to the
 * one before.
 */
export function useLibraryRoute() {
  const [hash, setHash] = useState(() => window.location.hash);

  useEffect(() => {
    if (!isLibraryHash(window.location.hash)) {
      window.history.replaceState(null, '', LIBRARY_HASH);
      setHash(LIBRARY_HASH);
    }
    const onChange = () => setHash(window.location.hash);
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
