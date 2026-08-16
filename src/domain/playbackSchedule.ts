import type { ProgressionStep } from '@/constants/progressions';

export type PlaybackEvent =
  | {
      type: 'timeline';
      cycleEighth: number;
      scheduleTime: number;
    }
  | {
      type: 'step';
      stepIndex: number;
      scheduleTime: number;
    };

export function stepEighths(steps: ProgressionStep[]): number[] {
  return steps.map((step) => Math.max(1, Math.round((step.beats ?? 4) * 2)));
}

export function findStepAtPosition(
  position: number,
  durations: number[],
): [number, number] {
  let accumulated = 0;
  for (let index = 0; index < durations.length; index++) {
    if (position < accumulated + durations[index]) {
      return [index, accumulated];
    }
    accumulated += durations[index];
  }
  return [0, 0];
}

function cyclePosition(position: number, total: number): number {
  return ((position % total) + total) % total;
}

export function createEighthPlaybackEvents(
  steps: ProgressionStep[],
  globalEighth: number,
  time: number,
  eighthDuration: number,
): PlaybackEvent[] {
  if (steps.length === 0) return [];

  const durations = stepEighths(steps);
  const totalEighths = durations.reduce((sum, duration) => sum + duration, 0);
  const events: PlaybackEvent[] = [];

  for (let sub = 0; sub < 2; sub++) {
    const currentGlobalEighth = globalEighth + sub;
    const cycleEighth = cyclePosition(currentGlobalEighth, totalEighths);
    const scheduleTime = time + sub * eighthDuration;
    events.push({ type: 'timeline', cycleEighth, scheduleTime });

    const [stepIndex, accumulated] = findStepAtPosition(cycleEighth, durations);
    const isFirstEighth = cycleEighth === accumulated;
    const offset = steps[stepIndex].offsetEighths ?? 0;

    if (offset === 0 && isFirstEighth) {
      events.push({ type: 'step', stepIndex, scheduleTime });
    } else if (offset > 0 && isFirstEighth) {
      events.push({
        type: 'step',
        stepIndex,
        scheduleTime: scheduleTime + offset * eighthDuration,
      });
    } else if (offset < 0 && isFirstEighth && currentGlobalEighth <= 0) {
      events.push({ type: 'step', stepIndex, scheduleTime });
    }

    const nextCycleEighth = (cycleEighth + 1) % totalEighths;
    const [nextStepIndex, nextAccumulated] = findStepAtPosition(
      nextCycleEighth,
      durations,
    );
    const nextOffset = steps[nextStepIndex].offsetEighths ?? 0;
    if (nextCycleEighth === nextAccumulated && nextOffset < 0) {
      const anticipationTime =
        scheduleTime + eighthDuration + nextOffset * eighthDuration;
      if (anticipationTime >= scheduleTime) {
        events.push({
          type: 'step',
          stepIndex: nextStepIndex,
          scheduleTime: anticipationTime,
        });
      }
    }
  }

  return events;
}

export function createBeatPlaybackEvents(
  steps: ProgressionStep[],
  beatCount: number,
  time: number,
  eighthDuration: number,
): PlaybackEvent[] {
  if (steps.length === 0) return [];

  const durations = steps.map((step) => Math.max(0.5, step.beats ?? 4));
  const totalBeats = durations.reduce((sum, duration) => sum + duration, 0);
  const cycleBeat = cyclePosition(beatCount, totalBeats);
  const eighthBase = (cycleBeat * 2) % (totalBeats * 2);
  const events: PlaybackEvent[] = [
    { type: 'timeline', cycleEighth: eighthBase, scheduleTime: time },
    {
      type: 'timeline',
      cycleEighth: eighthBase + 1,
      scheduleTime: time + eighthDuration,
    },
  ];

  const [stepIndex, accumulated] = findStepAtPosition(cycleBeat, durations);
  const isFirstBeat = cycleBeat === accumulated;
  const offset = steps[stepIndex].offsetEighths ?? 0;

  if (offset >= 0 && isFirstBeat) {
    events.push({
      type: 'step',
      stepIndex,
      scheduleTime: time + offset * eighthDuration,
    });
  } else if (offset < 0 && beatCount === 0 && stepIndex === 0) {
    events.push({ type: 'step', stepIndex: 0, scheduleTime: time });
  }

  const nextCycleBeat = cyclePosition(cycleBeat + 1, totalBeats);
  const [nextStepIndex, nextAccumulated] = findStepAtPosition(
    nextCycleBeat,
    durations,
  );
  const nextOffset = steps[nextStepIndex].offsetEighths ?? 0;
  if (nextCycleBeat === nextAccumulated && nextOffset < 0) {
    const scheduleTime = time + (2 + nextOffset) * eighthDuration;
    events.push({ type: 'step', stepIndex: nextStepIndex, scheduleTime });
  }

  return events;
}
