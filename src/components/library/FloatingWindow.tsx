import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from 'react';

interface Position {
  x: number;
  y: number;
}

function readPosition(storageKey: string): Position | null {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '');
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as Position).x === 'number' &&
      typeof (parsed as Position).y === 'number'
    ) {
      return parsed as Position;
    }
  } catch {}
  return null;
}

function writePosition(storageKey: string, position: Position | null): void {
  try {
    if (position) localStorage.setItem(storageKey, JSON.stringify(position));
    else localStorage.removeItem(storageKey);
  } catch {}
}

interface Props {
  title: string;
  storageKey: string;
  anchorBottom: number;
  anchorSide: 'left' | 'right';
  onClose: () => void;
  children: ReactNode;
}

export default function FloatingWindow({
  title,
  storageKey,
  anchorBottom,
  anchorSide,
  onClose,
  children,
}: Props) {
  const windowRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<Position | null>(() =>
    readPosition(storageKey),
  );
  const positionRef = useRef(position);
  positionRef.current = position;
  const grab = useRef<{ dx: number; dy: number } | null>(null);

  const clamp = useCallback((p: Position): Position => {
    const width = windowRef.current?.offsetWidth ?? 0;
    const height = windowRef.current?.offsetHeight ?? 0;
    return {
      x: Math.min(Math.max(0, p.x), Math.max(0, window.innerWidth - width)),
      y: Math.min(Math.max(0, p.y), Math.max(0, window.innerHeight - height)),
    };
  }, []);

  useEffect(() => {
    const onResize = () => setPosition((p) => (p ? clamp(p) : p));
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [clamp]);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button')) return;
    const box = windowRef.current?.getBoundingClientRect();
    if (!box) return;
    grab.current = {
      dx: event.clientX - box.left,
      dy: event.clientY - box.top,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!grab.current) return;
    setPosition(
      clamp({
        x: event.clientX - grab.current.dx,
        y: event.clientY - grab.current.dy,
      }),
    );
  };
  const onPointerUp = () => {
    if (!grab.current) return;
    grab.current = null;
    writePosition(storageKey, positionRef.current);
  };

  return (
    <div
      ref={windowRef}
      role="dialog"
      aria-label={title}
      className="lh-dialog fixed z-[25] w-auto max-h-none"
      style={
        position
          ? { left: position.x, top: position.y }
          : { [anchorSide]: 16, bottom: anchorBottom }
      }
    >
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={() => {
          setPosition(null);
          writePosition(storageKey, null);
        }}
        title="Arraste para mover; clique duas vezes para voltar ao canto"
        className="lh-dialog-head cursor-move select-none touch-none"
      >
        <span aria-hidden className="text-text-muted text-xs leading-none">
          ⠿
        </span>
        <span className="lh-dialog-title">{title}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label={`Fechar ${title.toLowerCase()}`}
          className="w-6 h-6 text-text-muted hover:bg-accent hover:text-on-accent cursor-pointer"
        >
          ×
        </button>
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}
