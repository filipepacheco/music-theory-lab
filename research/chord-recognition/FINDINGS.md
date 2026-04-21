# Findings Log

Append-only log of experiments and what they taught us. Most recent first.

---

## 001 — Synthetic sine-wave progression (madmom baseline)

**Question**: Does the madmom chord recognition pipeline run end-to-end, and what does its output look like on a trivial known-ground-truth input?

**Input**: `samples/synth_progression.wav` — 10s WAV, 5 triads (C, Am, F, G, C) played as sine-wave stacks, 2 seconds each, middle octave (MIDI 53-67).

**Ground truth**:
```
 0.00   2.00  C
 2.00   4.00  Am
 4.00   6.00  F
 6.00   8.00  G
 8.00  10.00  C
```

**madmom output** (`CNNChordFeatureProcessor` → `CRFChordRecognitionProcessor`):
```
 0.000    6.000  N
 6.000    6.500  G:maj
 6.500   10.000  N
```

**Result**: Pipeline works. Recognition is essentially wrong — 4 of 5 chords missed; the one detection (G:maj at 6.0-6.5s) is at the right *time* but only holds for 0.5s.

**Interpretation**: Not a model failure in a meaningful sense. madmom was trained on real recorded music (Beatles, etc.). Pure sine-wave triads lack the features it depends on:

- **No harmonics** — real pitched sources have overtone series; sines don't. Chromagrams from pure sines look nothing like training-distribution chromagrams.
- **No bass register** — chord recognizers lean heavily on bass notes to resolve root ambiguity. These triads sit in the 170-400 Hz range with no sub-bass.
- **No dynamics or timbral change** — flat envelopes, no rhythmic or textural cues.

**Takeaway**: Synthetic audio is not a useful benchmark for this class of model. Real music is required even for smoke-testing. Deprioritize synth-based unit tests; put energy into acquiring a small diverse set of real mp3s (different genres, production styles, tempos) as the actual dev loop.

**Next**: Drop 3-5 real mp3s into `samples/`, run `analyze.py` on each, compare with known chord charts. Only then do the failure modes become informative.
