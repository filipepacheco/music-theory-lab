import { useEffect, useRef, useCallback } from 'react';
import * as Tone from 'tone';
import { useAppStore } from '@/store/useAppStore';
import { ensureAudio } from '@/services/playbackEngine';
import { playbackSession } from '@/services/playbackSession';

// High click (beat 1) and low click (beats 2-4)
const clickHigh = new Tone.MembraneSynth({
  pitchDecay: 0.01,
  octaves: 6,
  envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.05 },
  volume: -10,
}).toDestination();

const clickLow = new Tone.MembraneSynth({
  pitchDecay: 0.01,
  octaves: 4,
  envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.04 },
  volume: -14,
}).toDestination();

const scheduledMetronomes = new Map<Tone.Loop, symbol>();
let metronomeGeneration = 0;

/** Stop every metronome loop before another player takes over the Transport. */
export function stopScheduledMetronomes() {
  metronomeGeneration++;
  for (const [loop, player] of scheduledMetronomes) {
    loop.dispose();
    playbackSession.stop(player);
  }
  scheduledMetronomes.clear();
}

type BeatCallback = (beat: number, time: number) => void;

export function useMetronome() {
  const bpm = useAppStore((s) => s.bpm);
  const isMetronomeOn = useAppStore((s) => s.isMetronomeOn);
  const setBpm = useAppStore((s) => s.setBpm);
  const setIsMetronomeOn = useAppStore((s) => s.setIsMetronomeOn);
  const setCurrentBeat = useAppStore((s) => s.setCurrentBeat);

  const loopRef = useRef<Tone.Loop | null>(null);
  const sessionId = useRef(Symbol('metronome'));
  const startToken = useRef(0);
  const beatRef = useRef(0);
  const listenersRef = useRef<Set<BeatCallback>>(new Set());

  // Keep Transport BPM in sync
  useEffect(() => {
    Tone.getTransport().bpm.value = bpm;
  }, [bpm]);

  const start = useCallback(async () => {
    stopScheduledMetronomes();
    const generation = metronomeGeneration;
    const token = ++startToken.current;
    if (
      !(await ensureAudio()) ||
      generation !== metronomeGeneration ||
      token !== startToken.current
    )
      return false;

    const transport = Tone.getTransport();
    transport.bpm.value = useAppStore.getState().bpm;

    // Clean up any existing loop
    if (loopRef.current) {
      scheduledMetronomes.delete(loopRef.current);
      loopRef.current.dispose();
    }

    beatRef.current = 0;

    const loop = new Tone.Loop((time) => {
      if (!scheduledMetronomes.has(loop)) return;
      const beat = beatRef.current % 4;

      // Play click at precise audio time
      if (beat === 0) {
        clickHigh.triggerAttackRelease('C5', '32n', time);
      } else {
        clickLow.triggerAttackRelease('C4', '32n', time);
      }

      // Fire audio callbacks directly in the loop for precise timing
      listenersRef.current.forEach((cb) => cb(beat, time));

      // Update UI on the main thread (visual only)
      Tone.getDraw().schedule(() => {
        if (scheduledMetronomes.has(loop)) setCurrentBeat(beat);
      }, time);

      beatRef.current++;
    }, '4n');

    loopRef.current = loop;
    scheduledMetronomes.set(loop, sessionId.current);
    loop.start(0);
    transport.start();
    playbackSession.start(sessionId.current);
    setIsMetronomeOn(true);
    return true;
  }, [setIsMetronomeOn, setCurrentBeat]);

  const stop = useCallback(() => {
    stopScheduledMetronomes();
    const transport = Tone.getTransport();
    transport.stop();
    transport.position = 0;

    if (loopRef.current) {
      scheduledMetronomes.delete(loopRef.current);
      loopRef.current.dispose();
      loopRef.current = null;
    }

    beatRef.current = 0;
    setIsMetronomeOn(false);
    setCurrentBeat(-1);
  }, [setIsMetronomeOn, setCurrentBeat]);

  const toggle = useCallback(() => {
    if (isMetronomeOn) {
      stop();
    } else {
      start();
    }
  }, [isMetronomeOn, start, stop]);

  // Register a beat callback. Returns an unsubscribe function; the
  // metronome supports any number of concurrent listeners.
  const onBeat = useCallback((cb: BeatCallback) => {
    listenersRef.current.add(cb);
    return () => {
      listenersRef.current.delete(cb);
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      startToken.current++;
      playbackSession.stop(sessionId.current);
      if (loopRef.current) {
        scheduledMetronomes.delete(loopRef.current);
        loopRef.current.dispose();
      }
    };
  }, []);

  return { start, stop, toggle, setBpm, bpm, isMetronomeOn, onBeat };
}
