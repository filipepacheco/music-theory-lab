// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { createElement } from 'react';
import { DndContext } from '@dnd-kit/core';
import { afterEach, expect, it, vi } from 'vitest';
import { useStructureDragSensors } from '@/hooks/useStructureDragSensors';
import { DraggableBar } from '@/components/structure/DraggableBar';
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: {
    div: ({
      layout,
      initial,
      animate,
      exit,
      transition,
      ...props
    }: Record<string, unknown>) => createElement('div', props),
  },
}));
vi.mock('@/components/structure/BarEditorPopover', () => ({
  default: () => null,
}));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
it('holding the remove button never activates touch drag and still removes the bar', async () => {
  vi.useFakeTimers();
  const start = vi.fn();
  const remove = vi.fn();
  function Surface() {
    const sensors = useStructureDragSensors();
    return (
      <DndContext sensors={sensors} onDragStart={start}>
        <DraggableBar
          bar={{ id: 'bar', index: 0, timeSignature: '4/4' }}
          onRemove={remove}
        />
      </DndContext>
    );
  }
  const { getByRole } = render(<Surface />);
  const button = getByRole('button', { name: 'Remover compasso 1' });
  fireEvent.touchStart(button, {
    touches: [{ identifier: 0, clientX: 10, clientY: 10 }],
  });
  await act(async () => {
    vi.advanceTimersByTime(250);
  });
  expect(start).not.toHaveBeenCalled();
  fireEvent.click(button);
  expect(remove).toHaveBeenCalledOnce();
});
