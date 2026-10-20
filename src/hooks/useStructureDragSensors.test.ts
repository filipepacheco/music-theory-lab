import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PointerSensor, TouchSensor } from '@dnd-kit/core';
import { useStructureDragSensors } from '@/hooks/useStructureDragSensors';

function readSensors() {
  let sensors: ReturnType<typeof useStructureDragSensors> = [];
  function Probe() {
    sensors = useStructureDragSensors();
    return null;
  }
  renderToStaticMarkup(createElement(Probe));
  return sensors;
}

describe('structure drag input', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  it('offers a short touch press with movement tolerance alongside pointer input', () => {
    const sensors = readSensors();
    expect(sensors).toHaveLength(2);
    expect(
      sensors.find(({ sensor }) => sensor === TouchSensor)?.options,
    ).toEqual({ activationConstraint: { delay: 200, tolerance: 5 } });
    expect(
      sensors.some(
        ({ sensor }) =>
          sensor.prototype instanceof PointerSensor || sensor === PointerSensor,
      ),
    ).toBe(true);
  });

  it('keeps mouse dragging after 5 pixels and defers touch pointers to the press sensor', () => {
    const descriptor = readSensors()[0];
    const activate = descriptor.sensor.activators[0].handler;
    const pointerEvent = (pointerType: string) =>
      ({
        nativeEvent: { pointerType, isPrimary: true, button: 0 },
      }) as unknown as Parameters<typeof activate>[0];
    const context = {} as Parameters<typeof activate>[2];
    expect(activate(pointerEvent('mouse'), descriptor.options, context)).toBe(
      true,
    );
    expect(activate(pointerEvent('touch'), descriptor.options, context)).toBe(
      false,
    );

    vi.useFakeTimers();
    const document = Object.assign(new EventTarget(), {
      getSelection: () => null,
    });
    vi.stubGlobal('document', document);
    vi.stubGlobal('window', new EventTarget());
    const onStart = vi.fn();
    const onMove = vi.fn();
    const onEnd = vi.fn();
    const props = {
      event: { target: document, clientX: 0, clientY: 0 },
      options: descriptor.options,
      onStart,
      onMove,
      onEnd,
      onPending: vi.fn(),
      onAbort: vi.fn(),
      onCancel: vi.fn(),
    } as unknown as ConstructorParameters<typeof PointerSensor>[0];
    new descriptor.sensor(props);
    const move = (clientX: number) =>
      document.dispatchEvent(
        Object.assign(new Event('pointermove', { cancelable: true }), {
          clientX,
          clientY: 0,
        }),
      );
    move(4);
    expect(onStart).not.toHaveBeenCalled();
    move(6);
    expect(onStart).toHaveBeenCalledWith({ x: 0, y: 0 });
    move(20);
    expect(onMove).toHaveBeenCalledWith({ x: 20, y: 0 });
    document.dispatchEvent(new Event('pointerup'));
    expect(onEnd).toHaveBeenCalledOnce();
    vi.runAllTimers();
  });
});
