"""Generate a synthetic chord progression as a WAV file.

Produces a known-ground-truth audio sample so we can sanity-check chord
recognition output before bringing in real music. Each chord is a stack of
sine waves at the chord's note frequencies, with a light attack envelope.

The generated progression is C - Am - F - G - C (I - vi - IV - V - I in C major),
2 seconds per chord.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import soundfile as sf


SAMPLE_RATE = 44100
CHORD_SECONDS = 2.0
A4_HZ = 440.0


def midi_to_hz(midi: int) -> float:
    return A4_HZ * (2.0 ** ((midi - 69) / 12.0))


def chord_tone(midi_notes: list[int], seconds: float) -> np.ndarray:
    n_samples = int(seconds * SAMPLE_RATE)
    t = np.arange(n_samples) / SAMPLE_RATE
    signal = np.zeros(n_samples, dtype=np.float32)
    for midi in midi_notes:
        signal += np.sin(2 * np.pi * midi_to_hz(midi) * t).astype(np.float32)
    signal /= max(len(midi_notes), 1)

    # Simple attack/release envelope (10ms attack, 50ms release)
    env = np.ones(n_samples, dtype=np.float32)
    attack = int(0.01 * SAMPLE_RATE)
    release = int(0.05 * SAMPLE_RATE)
    env[:attack] = np.linspace(0, 1, attack)
    env[-release:] = np.linspace(1, 0, release)
    return signal * env


# MIDI note numbers (C4 = 60)
PROGRESSION = [
    ("C",  [60, 64, 67]),  # C major: C E G
    ("Am", [57, 60, 64]),  # A minor: A C E
    ("F",  [53, 57, 60]),  # F major: F A C
    ("G",  [55, 59, 62]),  # G major: G B D
    ("C",  [60, 64, 67]),  # C major
]


def main() -> None:
    chunks = [chord_tone(notes, CHORD_SECONDS) for _, notes in PROGRESSION]
    audio = np.concatenate(chunks)

    out_path = Path(__file__).parent / "samples" / "synth_progression.wav"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(out_path, audio, SAMPLE_RATE)

    print(f"Wrote {out_path} ({len(audio) / SAMPLE_RATE:.1f}s)")
    print("Ground truth:")
    for i, (label, _) in enumerate(PROGRESSION):
        start = i * CHORD_SECONDS
        end = start + CHORD_SECONDS
        print(f"  {start:5.2f}  {end:5.2f}  {label}")


if __name__ == "__main__":
    main()
