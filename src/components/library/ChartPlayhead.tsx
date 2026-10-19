import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import {
  barIndexAt,
  type BassChartBar,
  type ChartBars,
} from '@/domain/bassChart';
import type { LibraryAudio } from '@/components/library/useLibraryAudio';

type Line = { element: SVGLineElement; start: number; width: number };
const ClockContext = createContext<Map<number, Line> | null>(null);

export function PlayheadAnimation({
  chart,
  audio,
  children,
}: {
  chart: ChartBars;
  audio: LibraryAudio;
  children: ReactNode;
}) {
  const lines = useMemo(() => new Map<number, Line>(), [chart]);
  const readPosition = audio.readPosition;
  const active = useRef<Line | null>(null);
  const draw = () => {
    if (!readPosition) return;
    const position = readPosition();
    const index =
      !audio.playing && audio.currentSeconds === 0
        ? -1
        : barIndexAt(chart, position);
    const line = lines.get(index) ?? null;
    if (active.current !== line) {
      if (active.current) {
        active.current.element.style.display = 'none';
        active.current.element.removeAttribute('data-playhead');
      }
      active.current = line;
    }
    if (!line) return;
    const bar = chart.bars[index];
    const fraction = Math.max(
      0,
      Math.min(1, (position - bar.startTime) / (bar.endTime - bar.startTime)),
    );
    const x = String(line.start + fraction * line.width);
    line.element.style.display = '';
    line.element.setAttribute('data-playhead', '');
    line.element.setAttribute('x1', x);
    line.element.setAttribute('x2', x);
  };
  const drawRef = useRef(draw);
  drawRef.current = draw;
  useEffect(() => {
    if (!readPosition) return;
    let frame = 0;
    const tick = () => {
      drawRef.current();
      if (audio.playing) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [readPosition, audio.playing, lines]);
  useEffect(() => {
    if (!audio.playing) drawRef.current();
  }, [audio.playing, audio.currentSeconds]);
  return (
    <ClockContext.Provider value={readPosition ? lines : null}>
      {children}
    </ClockContext.Provider>
  );
}

export default function ChartPlayhead({
  bar,
  progress,
  start,
  width,
  height,
}: {
  bar: BassChartBar;
  progress: number | null;
  start: number;
  width: number;
  height: number;
}) {
  const lines = useContext(ClockContext);
  const ref = useRef<SVGLineElement>(null);
  useEffect(() => {
    if (!lines || !ref.current) return;
    const entry = { element: ref.current, start, width };
    lines.set(bar.index, entry);
    return () => {
      if (lines.get(bar.index) === entry) lines.delete(bar.index);
    };
  }, [lines, bar.index, start, width]);
  if (!lines && progress === null) return null;
  const x = lines ? start : start + (progress ?? 0) * width;
  return (
    <line
      ref={ref}
      data-playhead={lines ? undefined : ''}
      x1={x}
      x2={x}
      y1={2}
      y2={height - 2}
      style={lines ? { display: 'none' } : undefined}
      stroke="var(--color-accent)"
      strokeWidth={1.5}
    />
  );
}
