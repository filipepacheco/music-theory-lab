import { useEffect, useState, type RefObject } from 'react';
import Frame from '@/components/shared/Frame';

interface Sample {
  frames: number;
  cursorUpdates: number;
  frameGap: number;
  cursorGap: number;
}

export default function PlaybackDiagnostics({
  chartRef,
  playing,
}: {
  chartRef: RefObject<HTMLDivElement | null>;
  playing: boolean;
}) {
  const [sample, setSample] = useState<Sample | null>(null);
  useEffect(() => {
    const chart = chartRef.current;
    if (!playing || !chart) return;
    let frame = 0;
    let started = performance.now();
    let lastFrame = started;
    let lastCursor: number | null = null;
    let frames = 0;
    let updates = 0;
    let frameGap = 0;
    let cursorGap = 0;
    const observer = new MutationObserver((mutations) => {
      if (
        !mutations.some(
          (mutation) =>
            mutation.target instanceof Element &&
            mutation.target.matches('[data-playhead]'),
        )
      )
        return;
      const now = performance.now();
      if (lastCursor !== null)
        cursorGap = Math.max(cursorGap, now - lastCursor);
      lastCursor = now;
      updates += 1;
    });
    observer.observe(chart, {
      subtree: true,
      attributes: true,
      attributeFilter: ['x1'],
    });
    const tick = (now: number) => {
      frameGap = Math.max(frameGap, now - lastFrame);
      lastFrame = now;
      frames += 1;
      if (now - started >= 1000) {
        const seconds = (now - started) / 1000;
        setSample({
          frames: Math.round(frames / seconds),
          cursorUpdates: Math.round(updates / seconds),
          frameGap: Math.round(frameGap),
          cursorGap: Math.round(
            Math.max(cursorGap, lastCursor === null ? 0 : now - lastCursor),
          ),
        });
        started = now;
        frames = 0;
        updates = 0;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [chartRef, playing]);

  return (
    <Frame
      title="Diagnóstico da reprodução"
      className="fixed top-20 right-3 z-50 bg-bg-card p-3 text-meta shadow-window pointer-events-none"
      aria-live="off"
    >
      <p>{playing ? 'Medindo' : 'Pausado'} · visual-1</p>
      {sample && (
        <>
          <p>Quadros/s: {sample.frames}</p>
          <p>Cursor/s: {sample.cursorUpdates}</p>
          <p>Pior quadro: {sample.frameGap} ms</p>
          <p>Pior cursor: {sample.cursorGap} ms</p>
        </>
      )}
    </Frame>
  );
}
