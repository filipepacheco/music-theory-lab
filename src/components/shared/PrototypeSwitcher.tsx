// PROTOTYPE support — throwaway. Floating bar for flipping between UI variants
// via ?variant=. The app has no router, so the param is read from
// window.location and written back with history.replaceState.
//
// Hidden in production builds so a stray merge cannot ship it.

import { useEffect } from 'react';

export function getVariant(keys: string[]): string {
  if (typeof window === 'undefined') return keys[0];
  const v = new URLSearchParams(window.location.search).get('variant');
  return v && keys.includes(v) ? v : keys[0];
}

export default function PrototypeSwitcher({
  variants,
  current,
  name,
  onChange,
}: {
  variants: string[];
  current: string;
  name?: string;
  onChange: (v: string) => void;
}) {
  const go = (delta: number) => {
    const i = variants.indexOf(current);
    const next = variants[(i + delta + variants.length) % variants.length];
    const url = new URL(window.location.href);
    url.searchParams.set('variant', next);
    window.history.replaceState({}, '', url);
    onChange(next);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement ||
        (el as HTMLElement | null)?.isContentEditable
      ) {
        return;
      }
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (import.meta.env.PROD) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 px-2 py-1.5 rounded-full bg-black/85 text-white shadow-lg backdrop-blur border border-white/15">
      <button
        onClick={() => go(-1)}
        className="w-7 h-7 rounded-full hover:bg-white/15 cursor-pointer"
        aria-label="Variante anterior"
      >
        {'<'}
      </button>
      <span className="px-2 text-xs font-mono whitespace-nowrap">
        PROTOTIPO {current}
        {name ? ` - ${name}` : ''}
      </span>
      <button
        onClick={() => go(1)}
        className="w-7 h-7 rounded-full hover:bg-white/15 cursor-pointer"
        aria-label="Proxima variante"
      >
        {'>'}
      </button>
    </div>
  );
}
