// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StateCreator } from 'zustand';

const runtime = vi.hoisted(() => ({
  effects: [] as (() => void | (() => void))[],
  cleanups: [] as (() => void)[],
  draw: [] as (() => void)[],
  loops: [] as { tick: (time: number) => void; dispose: () => void }[],
  stateWrites: 0,
  context: { state: 'suspended', lookAhead: 0.1 },
  transport: { bpm: { value: 90 }, position: 0, start: vi.fn(), stop: vi.fn() },
  unlock: vi.fn(),
}));

// The hook host and Tone clock are the external boundaries; app services and
// the Zustand store stay real so lifecycle tests exercise the complete path.
vi.mock('react', () => ({
  useRef: (current: unknown) => ({ current }),
  useCallback: (callback: unknown) => callback,
  useDebugValue: () => {},
  useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) =>
    snapshot(),
  useState: (value: unknown) => [
    value,
    () => {
      runtime.stateWrites++;
    },
  ],
  useEffect: (effect: () => void | (() => void)) => {
    runtime.effects.push(effect);
  },
}));

vi.mock('zustand', async () => {
  const { createStore } = await import('zustand/vanilla');
  return {
    create: <T>(initialize: StateCreator<T>) => {
      const store = createStore(initialize);
      return Object.assign(
        (select: (state: T) => unknown) => select(store.getState()),
        store,
      );
    },
  };
});

vi.mock('tone', () => {
  class Voice {
    wet = { value: 0 };
    loaded = true;
    constructor(options?: { onload?: () => void }) {
      queueMicrotask(() => options?.onload?.());
    }
    connect() {
      return this;
    }
    toDestination() {
      return this;
    }
    dispose() {}
    triggerAttackRelease() {}
    triggerRelease() {}
    releaseAll() {}
    start() {}
    stop() {}
  }
  class Loop {
    constructor(public tick: (time: number) => void) {
      runtime.loops.push(this);
    }
    start() {}
    dispose() {}
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
    Sampler: Voice,
    Loop,
    start: runtime.unlock,
    getContext: () => runtime.context,
    getTransport: () => runtime.transport,
    getDraw: () => ({
      schedule: (callback: () => void) => runtime.draw.push(callback),
    }),
    Time: () => ({ toSeconds: () => 0.25 }),
    now: () => 0,
  };
});

function mount<T>(hook: () => T): T {
  const result = hook();
  for (const effect of runtime.effects.splice(0)) {
    const cleanup = effect();
    if (cleanup) runtime.cleanups.push(cleanup);
  }
  return result;
}

const release = vi.fn(async () => {});
const request = vi.fn(async () => ({ released: false, release }));

beforeEach(() => {
  vi.resetModules();
  runtime.effects = [];
  runtime.cleanups = [];
  runtime.draw = [];
  runtime.loops = [];
  runtime.stateWrites = 0;
  runtime.context.state = 'suspended';
  runtime.context.lookAhead = 0.1;
  runtime.unlock.mockReset().mockImplementation(async () => {
    runtime.context.state = 'running';
  });
  release.mockClear();
  request.mockClear();
  vi.stubGlobal('localStorage', { getItem: () => null });
  vi.stubGlobal('navigator', {
    wakeLock: { request },
    audioSession: { type: 'auto' },
  });
  vi.stubGlobal(
    'document',
    Object.assign(new EventTarget(), { visibilityState: 'visible' }),
  );
});

afterEach(() => {
  for (const cleanup of runtime.cleanups.reverse()) cleanup();
  vi.unstubAllGlobals();
});

describe('player playback sessions', () => {
  it('keeps piano note keys and key-up behavior alongside the Space shortcut', async () => {
    const { useKeyboardPiano } = await import('@/hooks/useKeyboardPiano');
    const { usePlaybackShortcut } = await import('@/hooks/usePlaybackShortcut');
    const { playbackEngine } = await import('@/services/playbackEngine');
    const note = vi.spyOn(playbackEngine, 'playNote');
    const toggle = vi.fn();
    mount(useKeyboardPiano);
    mount(() => usePlaybackShortcut(toggle));
    try {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
      expect(note).toHaveBeenCalledOnce();
      expect(note).toHaveBeenCalledWith(0, 3, '8n', expect.any(String));
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'a' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
      expect(note).toHaveBeenCalledTimes(2);
      expect(toggle).not.toHaveBeenCalled();
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: ' ',
          code: 'Space',
          cancelable: true,
        }),
      );
      expect(toggle).toHaveBeenCalledOnce();
      expect(note).toHaveBeenCalledTimes(2);
    } finally {
      note.mockRestore();
    }
  });

  it('starts and stops the open step player and screen lock on successive Space presses', async () => {
    const { useStepPlayer } = await import('@/hooks/useStepPlayer');
    const { usePlaybackShortcut } = await import('@/hooks/usePlaybackShortcut');
    const { useAppStore } = await import('@/store/useAppStore');
    const player = mount(() =>
      useStepPlayer({
        id: 'keyboard-song',
        steps: [{ degree: 0, label: 'I' }],
        mode: 'major',
        presetId: 'piano',
        bpm: 90,
      }),
    );
    mount(() =>
      usePlaybackShortcut(() => {
        if (useAppStore.getState().playingProgression) player.stop();
        else void player.play();
      }),
    );
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: ' ',
        code: 'Space',
        cancelable: true,
      }),
    );
    await vi.waitFor(() => expect(request).toHaveBeenCalledWith('screen'));
    expect(useAppStore.getState().playingProgression?.id).toBe('keyboard-song');
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: ' ',
        code: 'Space',
        cancelable: true,
      }),
    );
    expect(useAppStore.getState().playingProgression).toBeNull();
    expect(release).toHaveBeenCalledOnce();
    expect(runtime.transport.stop).toHaveBeenCalled();
  });

  it('plays, pauses, and cleans up Library audio without optional browser media APIs', async () => {
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('MediaMetadata', undefined);
    let element!: FakeAudio;
    class FakeAudio extends EventTarget {
      preload = '';
      paused = true;
      constructor(public src: string) {
        super();
        element = this;
      }
      play = vi.fn(async () => {
        this.paused = false;
        this.dispatchEvent(new Event('play'));
        this.dispatchEvent(new Event('playing'));
      });
      pause = vi.fn(() => {
        this.paused = true;
        this.dispatchEvent(new Event('pause'));
      });
    }
    vi.stubGlobal('Audio', FakeAudio);
    const { useLibraryAudio } =
      await import('@/components/library/useLibraryAudio');
    const player = mount(() => useLibraryAudio('/song.mp3', 'Asa Branca'));

    expect(element.src).toBe('/song.mp3');
    await expect(player.play()).resolves.toBeUndefined();
    expect(element.play).toHaveBeenCalledOnce();
    expect(element.paused).toBe(false);
    expect(() => player.pause()).not.toThrow();
    expect(element.pause).toHaveBeenCalledOnce();
    expect(element.paused).toBe(true);

    await player.play();
    expect(element.play).toHaveBeenCalledTimes(2);
    expect(element.paused).toBe(false);
    for (const cleanup of runtime.cleanups.splice(0)) cleanup();
    expect(element.pause).toHaveBeenCalledTimes(2);
    expect(element.paused).toBe(true);
    expect(element.src).toBe('');
    const writes = runtime.stateWrites;
    for (const event of [
      'loadedmetadata',
      'timeupdate',
      'play',
      'playing',
      'pause',
      'ended',
      'error',
    ]) {
      element.dispatchEvent(new Event(event));
    }
    expect(runtime.stateWrites).toBe(writes);
    await player.play();
    player.pause();
    expect(element.play).toHaveBeenCalledTimes(2);
    expect(element.pause).toHaveBeenCalledTimes(2);
    expect(request).not.toHaveBeenCalled();
  });

  it.each(['stop', 'unmount'] as const)(
    'does not start or take a lock when %s cancels an audio unlock',
    async (cancel) => {
      let resume = () => {};
      runtime.unlock.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resume = () => {
              runtime.context.state = 'running';
              resolve();
            };
          }),
      );
      const { useMetronome } = await import('@/hooks/useMetronome');
      const player = mount(useMetronome);
      const starting = player.start();
      if (cancel === 'stop') player.stop();
      else for (const cleanup of runtime.cleanups.splice(0)) cleanup();
      resume();
      await starting;
      expect(request).not.toHaveBeenCalled();
      expect(runtime.loops).toHaveLength(0);
    },
  );

  it('keeps audio callbacks off UI state and discards queued draws after stop', async () => {
    const { useMetronome } = await import('@/hooks/useMetronome');
    const { useAppStore } = await import('@/store/useAppStore');
    const player = mount(useMetronome);
    await player.start();
    const stateChanged = vi.fn();
    const unsubscribe = useAppStore.subscribe(() => stateChanged());
    runtime.loops[0].tick(0);
    expect(stateChanged).not.toHaveBeenCalled();
    expect(runtime.stateWrites).toBe(0);
    expect(runtime.draw).toHaveLength(1);
    runtime.draw.shift()!();
    expect(useAppStore.getState().currentBeat).toBe(0);
    runtime.loops[0].tick(1);
    player.stop();
    stateChanged.mockClear();
    runtime.draw.shift()!();
    expect(stateChanged).not.toHaveBeenCalled();
    expect(useAppStore.getState().currentBeat).toBe(-1);
    unsubscribe();
  });

  it('starts the step player for progressions and transcribed songs even with another metronome mounted', async () => {
    const { useMetronome } = await import('@/hooks/useMetronome');
    const { useStepPlayer } = await import('@/hooks/useStepPlayer');
    const { useAppStore } = await import('@/store/useAppStore');
    const metronome = mount(useMetronome);
    await metronome.start();
    const onStepChange = vi.fn();
    const player = mount(() =>
      useStepPlayer({
        id: 'song',
        steps: [{ degree: 0, label: 'I' }],
        mode: 'major',
        presetId: 'piano',
        bpm: 90,
        onStepChange,
      }),
    );
    await player.play();
    runtime.loops[runtime.loops.length - 1].tick(0);
    expect(onStepChange).not.toHaveBeenCalled();
    for (const draw of runtime.draw.splice(0)) draw();
    expect(onStepChange).toHaveBeenCalledWith(0);
    runtime.loops[runtime.loops.length - 1].tick(1);
    player.stop();
    onStepChange.mockClear();
    for (const draw of runtime.draw.splice(0)) draw();
    expect(onStepChange).not.toHaveBeenCalled();
    expect(useAppStore.getState().currentEighth).toBe(-1);
    expect(useAppStore.getState().playingProgression).toBeNull();
    expect(release.mock.calls.length).toBe(request.mock.calls.length);
  });

  it('connects the Library title and media controls to audio events and cleans up on close', async () => {
    const actions = new Map<string, (() => void) | null>();
    const mediaSession = {
      metadata: null as { title: string } | null,
      setActionHandler: (action: string, handler: (() => void) | null) =>
        actions.set(action, handler),
    };
    Object.assign(navigator, { mediaSession });
    vi.stubGlobal(
      'MediaMetadata',
      class {
        constructor(public data: { title: string }) {}
        get title() {
          return this.data.title;
        }
      },
    );
    let element!: FakeAudio;
    class FakeAudio extends EventTarget {
      preload = '';
      src = '';
      paused = true;
      constructor() {
        super();
        element = this;
      }
      async play() {
        this.paused = false;
        this.dispatchEvent(new Event('play'));
        this.dispatchEvent(new Event('playing'));
      }
      pause() {
        this.paused = true;
        this.dispatchEvent(new Event('pause'));
      }
    }
    vi.stubGlobal('Audio', FakeAudio);
    const { useLibraryAudio } =
      await import('@/components/library/useLibraryAudio');
    mount(() => useLibraryAudio('/song.mp3', 'Asa Branca'));
    expect(mediaSession.metadata?.title).toBe('Asa Branca');
    actions.get('play')?.();
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    expect(element.paused).toBe(false);
    expect(request).toHaveBeenCalledOnce();
    actions.get('pause')?.();
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    expect(element.paused).toBe(true);
    expect(release).toHaveBeenCalledOnce();
    await element.play();
    element.dispatchEvent(new Event('ended'));
    expect(release).toHaveBeenCalledTimes(2);
    await element.play();
    for (const cleanup of runtime.cleanups.splice(0)) cleanup();
    expect(release).toHaveBeenCalledTimes(3);
    expect(mediaSession.metadata).toBeNull();
    expect(actions.get('play')).toBeNull();
    expect(actions.get('pause')).toBeNull();
  });

  it('releases the metronome on groove takeover and the groove on stop', async () => {
    const { useMetronome } = await import('@/hooks/useMetronome');
    const { useGroovePlayer } = await import('@/hooks/useGroovePlayer');
    const { useAppStore } = await import('@/store/useAppStore');
    const groove = {
      subdivision: '4n' as const,
      bumbo: [true, false, false, false],
      caixa: [],
      chimbal: [],
    };
    useAppStore.setState({
      focusedSectionId: 'verse',
      structureSections: [
        { id: 'verse', name: 'Verso', color: 'blue', barIds: [], groove },
      ],
    });
    const metronome = mount(useMetronome);
    await metronome.start();
    const player = mount(useGroovePlayer);
    await player.play(groove, 90);
    await Promise.resolve();
    expect(request).toHaveBeenCalledTimes(2);
    expect(release).toHaveBeenCalledTimes(1);
    const writes = runtime.stateWrites;
    runtime.loops[runtime.loops.length - 1].tick(0);
    expect(runtime.stateWrites).toBe(writes);
    for (const draw of runtime.draw.splice(0)) draw();
    expect(runtime.stateWrites).toBe(writes + 1);
    player.stop();
    expect(release).toHaveBeenCalledTimes(2);
  });

  it('starts after an interruption through ticket 02 unlock and takes the screen lock', async () => {
    const { useMetronome } = await import('@/hooks/useMetronome');
    const player = mount(useMetronome);
    await player.start();
    expect(request).toHaveBeenCalledWith('screen');
    player.stop();
    expect(release).toHaveBeenCalledOnce();
    runtime.context.state = 'interrupted';
    runtime.context.lookAhead = 0.1;
    await player.start();
    expect(runtime.context.state).toBe('running');
    expect(runtime.context.lookAhead).toBe(0.05);
    expect(runtime.unlock).toHaveBeenCalledTimes(2);
    expect(request).toHaveBeenCalledTimes(2);
    player.stop();
    expect(release).toHaveBeenCalledTimes(2);
  });
});
