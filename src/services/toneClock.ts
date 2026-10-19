import * as Tone from 'tone';
import { createTransport, type ClockAdapter } from '@/services/transport';
import { useAppStore } from '@/store/useAppStore';

// High click (beat 1) and low click (beats 2-4), created on first use.
let clicks: { high: Tone.MembraneSynth; low: Tone.MembraneSynth } | null =
  null;

function clickSynths() {
  if (!clicks) {
    clicks = {
      high: new Tone.MembraneSynth({
        pitchDecay: 0.01,
        octaves: 6,
        envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.05 },
        volume: -10,
      }).toDestination(),
      low: new Tone.MembraneSynth({
        pitchDecay: 0.01,
        octaves: 4,
        envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.04 },
        volume: -14,
      }).toDestination(),
    };
  }
  return clicks;
}

/** The clock adapter over the shared Tone transport. */
export const toneClock: ClockAdapter = {
  resume: () => Tone.start(),
  start: () => {
    Tone.getTransport().start();
  },
  stop: () => {
    const transport = Tone.getTransport();
    transport.stop();
    transport.position = 0;
  },
  setBpm: (bpm) => {
    Tone.getTransport().bpm.value = bpm;
  },
  getBpm: () => Tone.getTransport().bpm.value,
  repeatQuarter: (cb) => {
    const loop = new Tone.Loop(cb, '4n');
    loop.start(0);
    return () => {
      loop.dispose();
    };
  },
  repeat: (cb, seconds) => {
    const loop = new Tone.Loop(cb, seconds);
    loop.start(0);
    return () => {
      loop.dispose();
    };
  },
  eighthSeconds: () => Tone.Time('8n').toSeconds(),
  draw: (cb, time) => {
    Tone.getDraw().schedule(cb, time);
  },
  click: (accent, time) => {
    const { high, low } = clickSynths();
    if (accent) high.triggerAttackRelease('C5', '32n', time);
    else low.triggerAttackRelease('C4', '32n', time);
  },
};

/** The app-wide transport over the Tone clock. */
export const transport = createTransport(toneClock, {
  onClickChange: (on) => useAppStore.getState().setIsMetronomeOn(on),
  onBeatDraw: (beat) => useAppStore.getState().setCurrentBeat(beat),
});
