import {
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';

class StructurePointerSensor extends PointerSensor {
  static activators: typeof PointerSensor.activators =
    PointerSensor.activators.map((activator) => ({
      ...activator,
      handler: (event, options) =>
        event.nativeEvent.pointerType !== 'touch' &&
        activator.handler(event, options),
    }));
}

export function useStructureDragSensors() {
  return useSensors(
    useSensor(StructurePointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 5 },
    }),
  );
}
