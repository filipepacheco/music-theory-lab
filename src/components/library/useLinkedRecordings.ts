import { useEffect, useState } from 'react';
import { rocksmithLibrary } from '@/services/rocksmithLibrary';

const NONE: ReadonlySet<string> = new Set();

/**
 * The ids of the charts that have a recording in this browser. It reads again
 * each time the list screen shows, so a recording linked on a song screen
 * counts when the musician returns.
 */
export function useLinkedRecordings(listShown: boolean): ReadonlySet<string> {
  const [ids, setIds] = useState<ReadonlySet<string>>(NONE);

  useEffect(() => {
    if (!listShown) return;
    let cancelled = false;
    // The call can throw before it returns a promise (no `indexedDB` at all),
    // so it runs inside an async function.
    void (async () => {
      try {
        const found = await rocksmithLibrary.listAudioIds();
        if (!cancelled) setIds(new Set(found));
      } catch {
        // IndexedDB missing or refused (private window): no recording known.
        if (!cancelled) setIds(NONE);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [listShown]);

  return ids;
}
