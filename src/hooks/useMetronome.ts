import { useEffect, useRef, useCallback } from "react";
import * as Tone from "tone";
import { useAppStore } from "@/store/useAppStore";

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

type BeatCallback = (beat: number, time: number) => void;

export function useMetronome() {
  const bpm = useAppStore((s) => s.bpm);
  const isMetronomeOn = useAppStore((s) => s.isMetronomeOn);
  const setBpm = useAppStore((s) => s.setBpm);
  const setIsMetronomeOn = useAppStore((s) => s.setIsMetronomeOn);
  const setCurrentBeat = useAppStore((s) => s.setCurrentBeat);

  const loopRef = useRef<Tone.Loop | null>(null);
  const beatRef = useRef(0);
  const onBeatRef = useRef<BeatCallback | null>(null);

  // Keep Transport BPM in sync
  useEffect(() => {
    Tone.getTransport().bpm.value = bpm;
  }, [bpm]);

  const start = useCallback(async () => {
    try {
      await Tone.start();
    } catch {
      // ignore
    }

    const transport = Tone.getTransport();
    transport.bpm.value = useAppStore.getState().bpm;

    // Clean up any existing loop
    if (loopRef.current) {
      loopRef.current.dispose();
    }

    beatRef.current = 0;

    loopRef.current = new Tone.Loop((time) => {
      const beat = beatRef.current % 4;

      // Play click at precise audio time
      if (beat === 0) {
        clickHigh.triggerAttackRelease("C5", "32n", time);
      } else {
        clickLow.triggerAttackRelease("C4", "32n", time);
      }

      // Fire audio callback directly in the loop for precise timing
      onBeatRef.current?.(beat, time);

      // Update UI on the main thread (visual only)
      Tone.getDraw().schedule(() => {
        setCurrentBeat(beat);
      }, time);

      beatRef.current++;
    }, "4n");

    loopRef.current.start(0);
    transport.start();
    setIsMetronomeOn(true);
  }, [setIsMetronomeOn, setCurrentBeat]);

  const stop = useCallback(() => {
    const transport = Tone.getTransport();
    transport.stop();
    transport.position = 0;

    if (loopRef.current) {
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

  // Register a callback for measure boundaries (beat 0)
  const onBeat = useCallback((cb: BeatCallback | null) => {
    onBeatRef.current = cb;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (loopRef.current) {
        loopRef.current.dispose();
      }
    };
  }, []);

  return { start, stop, toggle, setBpm, bpm, isMetronomeOn, onBeat };
}
