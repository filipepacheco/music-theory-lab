import { describe, expect, it } from 'vitest';
import { createEighthPlaybackEvents } from './playbackSchedule';

describe('playback schedule', () => {
  it('emits a step at the start of each eighth-based duration', () => {
    const events = createEighthPlaybackEvents(
      [
        { degree: 0, label: 'I', beats: 2 },
        { degree: 4, label: 'V', beats: 1 },
      ],
      0,
      10,
      0.5,
    );

    expect(events.filter((event) => event.type === 'step')).toEqual([
      { type: 'step', stepIndex: 0, scheduleTime: 10 },
    ]);
  });

  it('schedules a negative offset on the look-ahead tick', () => {
    const events = createEighthPlaybackEvents(
      [
        { degree: 0, label: 'I', beats: 1 },
        { degree: 4, label: 'V', beats: 1, offsetEighths: -1 },
      ],
      0,
      20,
      0.5,
    );

    expect(events).toContainEqual({
      type: 'step',
      stepIndex: 1,
      scheduleTime: 20.5,
    });
  });
});
