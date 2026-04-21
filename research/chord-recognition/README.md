# Chord Recognition Research

Standalone research project to investigate how well we can extract chord progressions from an mp3 using existing MIR (Music Information Retrieval) tools.

This lives in the `music-theory-lab` repo for convenience but is independent from the app — output does not feed into the React frontend. It can be split into its own repo later.

## Goal

One question: **given an mp3, how accurately can we label the chord progression, and what affects accuracy most?**

## Scope

- Chords only (no beat tracking, key detection, structure, or melody as primary targets — these may appear as byproducts of the tools we use)
- Genre-agnostic
- Python backend — no browser/edge constraints
- Output is timestamped chord labels: `[(start_sec, end_sec, label), ...]`

## Open decisions

These are the Phase 0 choices we have not made yet. The first few experiments will inform them:

- **Chord vocabulary**: start with `majmin` (major + minor triads + N for no-chord). Expand to `sevenths` or large-vocab if off-the-shelf models handle it well.
- **Evaluation metric**: `mir_eval.chord.evaluate` with which weighting? (`root`, `majmin`, `mirex`, `sevenths`, `thirds`.) Likely start with `majmin` to match vocabulary.
- **Benchmark datasets**: Isophonics (Beatles), McGill Billboard. Need to request access — in parallel with hands-on experiments.

## Candidates

Three models/pipelines to bake off, in order of setup friction:

1. **madmom** — pip-installable, CNN chord recognizer + CRF decoder, triads + some 7ths
2. **BTC** (Bi-directional Transformer for Chord recognition) — published checkpoints, larger vocabulary, stronger SOTA on standard benchmarks
3. **Chordino** (NNLS Chroma + HMM) — non-ML baseline via Sonic Annotator; shows whether deep learning actually helps

## Structure

```
research/chord-recognition/
  README.md              # this file
  requirements.txt       # Python deps
  analyze.py             # run a chord recognizer on an mp3
  samples/               # test audio files (gitignored)
  outputs/               # analysis results (gitignored)
```

## Setup

```bash
cd research/chord-recognition
python3 -m venv .venv
source .venv/bin/activate
pip install numpy cython
pip install -r requirements.txt --no-build-isolation
python patch_madmom.py
```

**Why the patch step.** madmom's last release (0.16.1, 2018) predates Python 3.10 and numpy 1.24, and uses APIs removed in both: `collections.MutableSequence` and `np.float`/`np.int`/`np.bool`/`np.object`. `patch_madmom.py` rewrites these in-place in the installed package. It's idempotent — safe to rerun.

**Why `--no-build-isolation`.** madmom's setup.py calls numpy at build time; build isolation creates a fresh env where it isn't available.

## First experiment

```bash
# smoke test with synthetic audio (known ground truth)
python synth_test_audio.py
python analyze.py samples/synth_progression.wav

# real test — drop an mp3 into samples/
python analyze.py samples/your-song.mp3
```

Output: printed list of `(start_sec, end_sec, label)` chord segments, plus the file written to `outputs/<name>.chords.txt` in mir_eval-compatible tab-separated format.

See `FINDINGS.md` for logged experiment results.

## Next after first experiment

Eyeball the output on 3-5 songs you know by ear. Note:

- Obvious wins (correct chord, correct timing)
- Obvious losses (wrong chord type, wrong root, muddled in dense sections)
- Patterns (does it fail on fast changes? extended chords? distorted guitars?)

That investigation determines whether the next move is:

- **(a)** Add BTC to the comparison (madmom is a floor, want a stronger baseline)
- **(b)** Add source separation (Demucs → run chord recognition on the harmonic stem only)
- **(c)** Jump to formal benchmark evaluation on Isophonics/McGill Billboard with `mir_eval`
- **(d)** Something unexpected the failure modes suggest
