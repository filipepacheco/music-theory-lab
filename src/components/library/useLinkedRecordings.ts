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
    rocksmithLibrary
      .listAudioIds()
      .then((found) => {
        if (!cancelled) setIds(new Set(found));
      })
      .catch(() => {
        // IndexedDB unavailable: no recording is known.
        if (!cancelled) setIds(NONE);
      });
    return () => {
      cancelled = true;
    };
  }, [listShown]);

  return ids;
}
