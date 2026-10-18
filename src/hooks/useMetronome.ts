import { useEffect, useRef, useCallback } from 'react';
import * as Tone from 'tone';
import { useAppStore } from '@/store/useAppStore';

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

const scheduledMetronomes = new Set<Tone.Loop>();

export function stopScheduledMetronomes() {
  for (const loop of scheduledMetronomes) {
    loop.dispose();
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
  const beatRef = useRef(0);
  const listenersRef = useRef<Set<BeatCallback>>(new Set());

  useEffect(() => {
    Tone.getTransport().bpm.value = bpm;
  }, [bpm]);

  const start = useCallback(async () => {
    try {
      await Tone.start();
    } catch {}

    const transport = Tone.getTransport();
    transport.bpm.value = useAppStore.getState().bpm;

    if (loopRef.current) {
      loopRef.current.dispose();
    }

    beatRef.current = 0;

    loopRef.current = new Tone.Loop((time) => {
      const beat = beatRef.current % 4;

      if (beat === 0) {
        clickHigh.triggerAttackRelease('C5', '32n', time);
      } else {
        clickLow.triggerAttackRelease('C4', '32n', time);
      }

      listenersRef.current.forEach((cb) => cb(beat, time));

      Tone.getDraw().schedule(() => {
        setCurrentBeat(beat);
      }, time);

      beatRef.current++;
    }, '4n');

    scheduledMetronomes.add(loopRef.current);
    loopRef.current.start(0);
    transport.start();
    setIsMetronomeOn(true);
  }, [setIsMetronomeOn, setCurrentBeat]);

  const stop = useCallback(() => {
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

  const onBeat = useCallback((cb: BeatCallback) => {
    listenersRef.current.add(cb);
    return () => {
      listenersRef.current.delete(cb);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (loopRef.current) {
        scheduledMetronomes.delete(loopRef.current);
        loopRef.current.dispose();
      }
    };
  }, []);

  return { start, stop, toggle, setBpm, bpm, isMetronomeOn, onBeat };
}
