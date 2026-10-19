/**
 * The transport: the one module that owns the shared clock.
 *
 * It is the only code that starts, stops, or sets the tempo of the clock.
 * It holds one list of beat listeners for the whole app, plays the
 * metronome click, and records which player owns the clock now. A new
 * player takes the clock from the old one, and the old one is told to stop.
 *
 * The transport talks to the clock through a `ClockAdapter`: the Tone
 * adapter (`toneClock.ts`) runs in the app, and tests use a fake one.
 */

export interface ClockAdapter {
  /** Unlock the audio context (needs a user gesture in the browser). */
  resume(): Promise<void>;
  /** Start the clock. */
  start(): void;
  /** Stop the clock and rewind it to the start. */
  stop(): void;
  setBpm(bpm: number): void;
  getBpm(): number;
  /** Call `cb` on each quarter note at audio time; returns a cancel function. */
  repeatQuarter(cb: (time: number) => void): () => void;
  /** Call `cb` every `seconds` from the start of the clock; returns a cancel function. */
  repeat(cb: (time: number) => void, seconds: number): () => void;
  /** Length of one eighth note at the current tempo, in seconds. */
  eighthSeconds(): number;
  /** Run a UI update on the draw scheduler, in step with the audio time. */
  draw(cb: () => void, time: number): void;
  /** Play the metronome click; `accent` marks beat 1. */
  click(accent: boolean, time: number): void;
}

export type ClockOwnerKind = 'metronome' | 'progression' | 'groove';

export interface ClockOwner {
  kind: ClockOwnerKind;
  id: string;
}

export type BeatListener = (beat: number, time: number) => void;

export interface TransportEvents {
  /** The metronome click turned on or off. */
  onClickChange?: (on: boolean) => void;
  /** The bar beat (0-3) for the UI; called on the draw scheduler, -1 on stop. */
  onBeatDraw?: (beat: number) => void;
}

export interface TakeClockOptions {
  /** Called when another player takes the clock; the player stops itself. */
  onRelease: () => void;
  /** Turn the metronome click on while this player owns the clock. */
  click?: boolean;
}

export interface Transport {
  owner(): ClockOwner | null;
  isClickOn(): boolean;
  isRunning(): boolean;
  onBeat(listener: BeatListener): () => void;
  setTempo(bpm: number): void;
  /** Call `cb` every `seconds` while the clock runs; the clock stop cancels it. */
  repeat(seconds: number, cb: (time: number) => void): () => void;
  tempo(): number;
  eighthSeconds(): number;
  draw(cb: () => void, time: number): void;
  startMetronome(): Promise<void>;
  stopMetronome(): void;
  takeClock(owner: ClockOwner, options: TakeClockOptions): Promise<void>;
  releaseClock(id: string): void;
  stopAll(): void;
}

const METRONOME: ClockOwner = { kind: 'metronome', id: 'metronome' };

interface OwnerRecord {
  owner: ClockOwner;
  onRelease?: () => void;
  /** This owner turned the click on, so it turns the click off on release. */
  ownsClick: boolean;
}

export function createTransport(
  clock: ClockAdapter,
  events: TransportEvents = {},
): Transport {
  const listeners = new Set<BeatListener>();
  let current: OwnerRecord | null = null;
  let clickOn = false;
  let cancelTick: (() => void) | null = null;
  let beatCount = 0;
  let runId = 0;
  /** The tempo from before a groove took the clock; null when none did. */
  let savedTempo: number | null = null;
  const repeats = new Set<() => void>();

  const restoreTempo = () => {
    if (savedTempo === null) return;
    clock.setBpm(savedTempo);
    savedTempo = null;
  };

  const setClick = (on: boolean) => {
    if (clickOn === on) return;
    clickOn = on;
    events.onClickChange?.(on);
  };

  const tick = (time: number) => {
    const beat = beatCount % 4;
    beatCount++;
    if (clickOn) clock.click(beat === 0, time);
    for (const listener of [...listeners]) listener(beat, time);
    clock.draw(() => events.onBeatDraw?.(beat), time);
  };

  const ensureRunning = async () => {
    if (cancelTick) return;
    beatCount = 0;
    cancelTick = clock.repeatQuarter(tick);
    const id = ++runId;
    try {
      await clock.resume();
    } catch {
      // The clock still starts; the browser may block sound until a gesture.
    }
    // A stop during the await bumps runId, so a stale start does nothing.
    if (id === runId) clock.start();
  };

  const stopClock = () => {
    runId++;
    for (const cancel of [...repeats]) cancel();
    if (cancelTick) {
      cancelTick();
      cancelTick = null;
    }
    clock.stop();
    beatCount = 0;
    events.onBeatDraw?.(-1);
  };

  /** Hand the clock back to the metronome when it is on, or stop it. */
  const settle = () => {
    if (clickOn) {
      current = { owner: METRONOME, ownsClick: false };
    } else {
      current = null;
      stopClock();
    }
  };

  return {
    owner: () => (current ? { ...current.owner } : null),
    isClickOn: () => clickOn,
    isRunning: () => cancelTick !== null,

    onBeat(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    setTempo: (bpm) => clock.setBpm(bpm),

    repeat(seconds, cb) {
      const cancelClock = clock.repeat(cb, seconds);
      const cancel = () => {
        repeats.delete(cancel);
        cancelClock();
      };
      repeats.add(cancel);
      return cancel;
    },
    tempo: () => clock.getBpm(),
    eighthSeconds: () => clock.eighthSeconds(),
    draw: (cb, time) => clock.draw(cb, time),

    startMetronome() {
      setClick(true);
      if (!current) current = { owner: METRONOME, ownsClick: false };
      // A player that owns the clock keeps it; the click joins its beats.
      else current.ownsClick = false;
      return ensureRunning();
    },

    stopMetronome() {
      setClick(false);
      if (!current || current.owner.kind === 'metronome') {
        current = null;
        stopClock();
      } else {
        current.ownsClick = false;
      }
    },

    takeClock(owner, options) {
      const previous = current;
      const clickWasOn = clickOn;
      const isGroove = owner.kind === 'groove';
      if (isGroove) {
        // The groove saves the tempo once, and gives it back when it stops.
        if (savedTempo === null) savedTempo = clock.getBpm();
      } else if (previous?.owner.kind === 'groove') {
        restoreTempo();
      }
      current = {
        owner: { ...owner },
        onRelease: options.onRelease,
        ownsClick: Boolean(options.click) && !clickWasOn,
      };
      if (previous && previous.owner.kind !== 'metronome') {
        // The old player stops cleanly; its own release is now a no-op.
        if (previous.ownsClick) current.ownsClick = Boolean(options.click);
        previous.onRelease?.();
      }
      if (isGroove) setClick(false);
      else if (options.click) setClick(true);
      return ensureRunning();
    },

    releaseClock(id) {
      if (!current || current.owner.id !== id) return;
      if (current.ownsClick) setClick(false);
      if (current.owner.kind === 'groove') restoreTempo();
      settle();
    },

    stopAll() {
      const previous = current;
      current = null;
      setClick(false);
      stopClock();
      restoreTempo();
      if (previous && previous.owner.kind !== 'metronome') {
        previous.onRelease?.();
      }
    },
  };
}
