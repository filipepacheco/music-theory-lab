import { useEffect, useRef } from 'react';
import { useAppStore } from '@/store/useAppStore';

const DEBOUNCE_MS = 100;

export function useStructureRecorder() {
  const addBar = useAppStore((s) => s.addBar);
  const lastTap = useRef(0);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.repeat) return;
      if (e.key !== ' ') return;

      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      e.preventDefault();
      const now = Date.now();
      if (now - lastTap.current < DEBOUNCE_MS) return;
      lastTap.current = now;
      addBar();
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [addBar]);
}
