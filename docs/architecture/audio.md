# Audio and playback

## Playback engine (`src/services/playbackEngine.ts`)

The engine owns the Tone.js effects, the sampler cache, the fallback synths, the voicing, and the lifecycle cleanup. `useSynth` only supplies the active preset and exposes React callbacks.

| Item            | Behaviour                                                                                                            |
| --------------- | -------------------------------------------------------------------------------------------------------------------- |
| Effects chain   | Limiter (-6 dB) -> Reverb -> Destination, global.                                                                    |
| `playNote()`    | One note.                                                                                                            |
| `playChord()`   | Simultaneous notes. Creates a fresh `PolySynth` for each call, to avoid polyphony issues, and disposes it after 2 s. |
| `playScale()`   | Sequential notes.                                                                                                    |
| `ensureAudio()` | Calls `Tone.start()`. The browser allows it only on a user gesture.                                                  |
| Chord voicing   | Notes ascend by octave, so low-register chords do not sound muddy.                                                   |

## Tone presets (`src/constants/tonePresets`)

| Type            | Behaviour                                                                |
| --------------- | ------------------------------------------------------------------------ |
| `SynthPreset`   | Oscillator-based, ready at once.                                         |
| `SamplerPreset` | Real audio samples, loaded async, with a synth fallback while they load. |

Samplers are cached globally and loaded eagerly at module init. Never dispose a cached sampler.

## Metronome and progression playback

- `useMetronome` runs a `Tone.Loop` on the audio thread for exact quarter-note timing.
- It fires `onBeat` callbacks. `ProgressionExamples` registers with `onBeat(callback)`.
- `ProgressionExamples` tracks the beat position, maps it to progression steps, and schedules ahead for steps with a negative `offsetEighths`.
- The store fields `currentEighth` and `playingProgression` drive the `BeatTimeline` view.
- `useSynth` supports scheduled playback through `Tone.Transport`.

**Critical pattern:** an audio callback must not set React state directly. Schedule each UI update with `Tone.getDraw().schedule()`.

## Drum samples

`public/drum-samples/` holds the Virtuosity Drums one-shots (CC0, FLAC; see its `README.md`). The groove player of Estrutura loads three of them at module init. A drum chart without a linked recording plays through `useDrumSamplePlayback` -> `drumSampleTransport` (hit schedule from `domain/drumPlaybackSchedule.ts`); its buffers load on first play, are cached, and are never disposed. A hit with no loaded sample is skipped.

When a song has the bass chart and the drum chart of one file (`partChartId(bassId, 'drums')`), and neither has a linked recording, `useSongPartsPlayback` (held by `LibraryModule`, above the part, so a change of part keeps playing) runs both on one clock through `songPartsTransport`. The rules (which parts sound, given the mutes, the recording, the same-file test) are in `domain/songPartsPlayback.ts`. A mute is read at each scheduling and stops only its part. Parts of different files play alone.

The shared bass/drum transport queues 500 ms ahead on its audio clock so short main-thread stalls do not drop paired notes. This queue is separate from Tone's 50 ms look-ahead for interactive instruments. Pause, seek, and mute stop already queued sources. The real-iPad playback check still determines whether this headroom is sufficient; a deterministic transport regression covers repeated 400 ms timer stalls.
