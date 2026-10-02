import { useEffect, useState, type ReactNode, type RefObject } from 'react';

const STORAGE_KEY = 'music-theory-lab:bass-dock-collapsed';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(collapsed));
  } catch {
    // Blocked storage: the dock just opens expanded next time.
  }
}

interface Props {
  dockRef: RefObject<HTMLDivElement | null>;
  /** Reports the dock's height so the page can leave room under it. */
  onHeightChange: (height: number) => void;
  title: ReactNode;
  status: string;
  playing: boolean;
  canPlay: boolean;
  onTogglePlay: () => void;
  /** Extra header buttons, e.g. the circle of fifths toggle. */
  actions: ReactNode;
  neck: ReactNode;
}

/**
 * The fretboard panel, fixed to the bottom of the screen above the mobile
 * navigation, with play/pause and what is sounding now. It can be
 * collapsed to its header.
 */
export default function PlaybackDock({
  dockRef,
  onHeightChange,
  title,
  status,
  playing,
  canPlay,
  onTogglePlay,
  actions,
  neck,
}: Props) {
  const [collapsed, setCollapsed] = useState(readCollapsed);

  useEffect(() => {
    const element = dockRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() =>
      onHeightChange(element.getBoundingClientRect().height),
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
      onHeightChange(0);
    };
  }, [dockRef, onHeightChange]);

  return (
    <div
      ref={dockRef}
      role="region"
      aria-label="Braço do baixo"
      className="fixed inset-x-0 bottom-20 sm:bottom-0 z-20 border-t border-border-default bg-bg-secondary/95 backdrop-blur-sm shadow-[0_-4px_16px_rgba(0,0,0,0.25)]"
    >
      <div className="mx-auto max-w-screen-2xl px-3 sm:px-6 py-2 flex flex-col gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={onTogglePlay}
            disabled={!canPlay}
            aria-label={playing ? 'Pausar' : 'Tocar'}
            className="w-8 h-8 shrink-0 rounded-full bg-accent text-white flex items-center justify-center cursor-pointer disabled:opacity-40 disabled:cursor-default"
          >
            {playing ? (
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
                <rect x="2" y="1" width="3" height="10" fill="currentColor" />
                <rect x="7" y="1" width="3" height="10" fill="currentColor" />
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
                <path d="M3 1L11 6L3 11Z" fill="currentColor" />
              </svg>
            )}
          </button>
          <div className="min-w-0 flex-1">
            <div className="font-heading text-xs text-text-primary truncate">
              {title}
            </div>
            <div className="text-[11px] text-text-muted truncate">{status}</div>
          </div>
          {actions}
          <button
            type="button"
            onClick={() => {
              setCollapsed(!collapsed);
              writeCollapsed(!collapsed);
            }}
            aria-expanded={!collapsed}
            className="shrink-0 px-2 py-1 rounded-control border border-border-default text-[11px] text-text-muted hover:text-text-primary cursor-pointer"
          >
            {collapsed ? 'Mostrar braço' : 'Recolher braço'}
          </button>
        </div>
        {!collapsed && neck}
      </div>
    </div>
  );
}
