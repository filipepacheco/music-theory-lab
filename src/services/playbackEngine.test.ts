import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const audio = vi.hoisted(() => ({
  context: { state: 'suspended', lookAhead: 0.1 },
  start: vi.fn(),
  samplers: [] as { dispose: ReturnType<typeof vi.fn> }[],
}));

vi.mock('tone', () => {
  class Voice {
    wet = { value: 0 };
    loaded = true;
    dispose = vi.fn();
    triggerAttackRelease = vi.fn();
    releaseAll = vi.fn();
    triggerRelease = vi.fn();
    start = vi.fn();
    stop = vi.fn();
    connect() {
      return this;
    }
    toDestination() {
      return this;
    }
  }
  class Sampler extends Voice {
    constructor(options: { onload: () => void }) {
      super();
      audio.samplers.push(this);
      setTimeout(options.onload, 0);
    }
  }
  return {
    Limiter: Voice,
    Reverb: Voice,
    MembraneSynth: Voice,
    NoiseSynth: Voice,
    Filter: Voice,
    Player: Voice,
    PolySynth: Voice,
    Synth: Voice,
    Sampler,
    start: audio.start,
    getContext: () => audio.context,
    now: () => Date.now() / 1000,
  };
});

describe('audio unlock', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(0);
    audio.context.state = 'suspended';
    audio.context.lookAhead = 0.1;
    audio.samplers.length = 0;
    audio.start.mockReset().mockImplementation(async () => {
      audio.context.state = 'running';
    });
    vi.stubGlobal(
      'document',
      Object.assign(new EventTarget(), {
        visibilityState: 'visible',
      }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('checks the current context on every call and resumes only when needed', async () => {
    const { ensureAudio } = await import('@/services/playbackEngine');
    audio.context.state = 'running';
    expect(await ensureAudio()).toBe(true);
    expect(audio.start).not.toHaveBeenCalled();
    audio.context.state = 'suspended';
    expect(await ensureAudio()).toBe(true);
    expect(audio.context.state).toBe('running');
    expect(audio.start).toHaveBeenCalledOnce();
  });

  it('resumes again after a fake-clock interruption', async () => {
    const { ensureAudio } = await import('@/services/playbackEngine');
    expect(await ensureAudio()).toBe(true);
    setTimeout(() => {
      audio.context.state = 'interrupted';
    }, 1000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await ensureAudio()).toBe(true);
    expect(audio.context.state).toBe('running');
    expect(audio.start).toHaveBeenCalledTimes(2);
  });

  it('resumes a suspended fake context', async () => {
    const { ensureAudio } = await import('@/services/playbackEngine');
    expect(await ensureAudio()).toBe(true);
    expect(audio.context.state).toBe('running');
    expect(audio.start).toHaveBeenCalledOnce();
  });

  it('uses a 50 ms scheduling margin after unlock', async () => {
    const { ensureAudio } = await import('@/services/playbackEngine');
    await ensureAudio();
    expect(audio.context.lookAhead).toBe(0.05);
  });

  it('keeps cached samplers alive across recovery and playback cleanup', async () => {
    const { ensureAudio, playbackEngine } =
      await import('@/services/playbackEngine');
    await vi.advanceTimersByTimeAsync(0);
    await ensureAudio();
    playbackEngine.playChord([0, 4, 7], 3, '2n');
    audio.context.state = 'suspended';
    await ensureAudio();
    playbackEngine.playNote(0, 4, '8n');
    playbackEngine.playScale([0, 2, 4], 4);
    playbackEngine.stopAll();
    await vi.advanceTimersByTimeAsync(3000);
    expect(audio.samplers.length).toBeGreaterThan(0);
    for (const sampler of audio.samplers) {
      expect(sampler.dispose).not.toHaveBeenCalled();
    }
  });

  it('allows a fresh resume while an earlier attempt fails', async () => {
    const { ensureAudio } = await import('@/services/playbackEngine');
    audio.start.mockRejectedValueOnce(new Error('Blocked'));
    const first = ensureAudio();
    const second = ensureAudio();
    expect(await first).toBe(false);
    expect(await second).toBe(true);
    expect(await ensureAudio()).toBe(true);
    expect(audio.start).toHaveBeenCalledTimes(2);
  });

  it('recovers on the next tap while the page-return resume stays pending', async () => {
    const { ensureAudio, playbackEngine } =
      await import('@/services/playbackEngine');
    await ensureAudio();
    audio.context.state = 'suspended';
    audio.start.mockImplementationOnce(() => new Promise<void>(() => {}));
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(audio.start).toHaveBeenCalledTimes(2);
    expect(audio.context.state).toBe('suspended');

    playbackEngine.playNote(0, 4, '8n');
    await vi.advanceTimersByTimeAsync(0);
    expect(audio.context.state).toBe('running');
    expect(audio.start).toHaveBeenCalledTimes(3);
  });

  it('tries on return to the page and retries a blocked resume on the next tap', async () => {
    const { ensureAudio, playbackEngine } =
      await import('@/services/playbackEngine');
    await ensureAudio();
    audio.context.state = 'suspended';
    Object.assign(document, { visibilityState: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(audio.start).toHaveBeenCalledOnce();
    audio.start.mockRejectedValueOnce(new Error('User gesture required'));
    Object.assign(document, { visibilityState: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(audio.start).toHaveBeenCalledTimes(2);
    playbackEngine.playNote(0, 4, '8n');
    await vi.advanceTimersByTimeAsync(0);
    expect(audio.context.state).toBe('running');
    expect(audio.start).toHaveBeenCalledTimes(3);
  });
});
