import { useEffect, useState } from 'react';
import { rocksmithLibrary } from '@/services/rocksmithLibrary';

const NONE: ReadonlySet<string> = new Set();

export function useLinkedRecordings(listShown: boolean): ReadonlySet<string> {
  const [ids, setIds] = useState<ReadonlySet<string>>(NONE);

  useEffect(() => {
    if (!listShown) return;
    let cancelled = false;
    void (async () => {
      try {
        const found = await rocksmithLibrary.listAudioIds();
        if (!cancelled) setIds(new Set(found));
      } catch {
        if (!cancelled) setIds(NONE);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [listShown]);

  return ids;
}
