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
  } catch {}
}

interface Props {
  dockRef: RefObject<HTMLDivElement | null>;
  label: string;
  onHeightChange: (height: number) => void;
  title: ReactNode;
  status: string;
  detail?: ReactNode;
  controls?: ReactNode;
  playing: boolean;
  canPlay: boolean;
  onTogglePlay: () => void;
  actions: ReactNode;
  panel: ReactNode;
  showLabel: string;
  hideLabel: string;
}

export default function PlaybackDock({
  dockRef,
  label,
  onHeightChange,
  title,
  status,
  detail,
  controls,
  playing,
  canPlay,
  onTogglePlay,
  actions,
  panel,
  showLabel,
  hideLabel,
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
      aria-label={label}
      className="fixed inset-x-0 bottom-20 sm:bottom-0 z-20 border-t border-border-strong bg-bg-secondary"
    >
      <div className="mx-auto max-w-screen-2xl px-3 sm:px-6 py-2 flex flex-col gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={onTogglePlay}
            disabled={!canPlay}
            aria-label={playing ? 'Pausar' : 'Tocar'}
            className={`w-8 h-8 shrink-0 text-on-accent flex items-center justify-center cursor-pointer disabled:opacity-40 disabled:cursor-default ${
              playing ? 'bg-live' : 'bg-accent'
            }`}
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
            <div className="text-small text-text-muted truncate">{status}</div>
          </div>
          {actions}
          <button
            type="button"
            onClick={() => {
              setCollapsed(!collapsed);
              writeCollapsed(!collapsed);
            }}
            aria-expanded={!collapsed}
            className="shrink-0 px-2 py-1 border border-border-strong text-small text-text-secondary hover:bg-accent hover:text-on-accent cursor-pointer"
          >
            {collapsed ? showLabel : hideLabel}
          </button>
        </div>
        {detail && (
          <p
            data-dock-detail
            className="border-l-2 border-text-primary pl-2 text-small text-text-secondary"
          >
            {detail}
          </p>
        )}
        {controls}
        {!collapsed && panel}
      </div>
    </div>
  );
}
