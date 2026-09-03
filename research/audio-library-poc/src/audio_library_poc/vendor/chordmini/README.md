# Vendored ChordMini BTC subset

Minimal subset of the BTC (Bi-directional Transformer for Chord recognition)
model from [ChordMini](https://github.com/ptnghia-j/ChordMini), pinned to
commit **`aa6e3a8d7b017f082fd2aaff9329d5c26af49c03`** (2026-08 snapshot of
`main`).

## What's vendored, what's not

Kept (in `model/`):

- `btc_model.py` — the `BTC_model` class and its `_BiDirSelfAttentionLayers`.
- `transformer_modules.py` — attention, positional bias, and output-layer
  helpers `BTC_model` imports.
- `config.py` — the shared `ModelConfig` dataclass with BTC defaults.
- `temporal_smoothing.py` — small helper `BTC_model` re-exports.
- `chords.py` — the 170-token chord vocabulary and `idx2voca_chord()`.
- `chordmini_config.yaml` — the pipeline YAML, kept for reference only;
  the runtime constructs `ModelConfig()` from Python defaults.

Not vendored:

- Training code (`src/training*`, `training_scripts/`).
- Data pipeline (`src/data/`).
- Evaluation harness (`src/evaluation/`, `src/utils/checkpoint_utils.py`,
  `src/utils/audio_io.py`, and the other `src/utils/*` helpers). Our runtime
  loads the state dict directly and drives inference in
  `_chordmini_btc_runtime.py`.
- The ChordNet checkpoint and its model class — this vendor bundle covers
  BTC only.
- The BTC checkpoint (`btc_model_best.pth`) — fetched via
  `scripts/fetch_checkpoints.py` (pinned in `workspace/checkpoints.local.yaml`
  by SHA-256) into `workspace/models/`. Not committed with this vendor.

## Import shape

The three `common/*` files were flattened from `src/models/common/` up into
this `model/` directory so `btc_model.py` uses relative imports
(`from .transformer_modules import ...`). This is the only change made to
the upstream source. No functional edits.

## Provenance

- Upstream: https://github.com/ptnghia-j/ChordMini
- Commit: `aa6e3a8d7b017f082fd2aaff9329d5c26af49c03`
- License: MIT (see `LICENSE` in this directory — verbatim copy of
  upstream `LICENSE` at the pinned commit).
- Fetched: 2026-09-03.

## Refreshing this bundle

To re-vendor from a newer upstream commit:

1. Update the pinned SHA above.
2. Re-download the same 5 Python files + `chordmini_config.yaml` +
   `LICENSE` at the new SHA.
3. Re-apply the flatten (move `common/*` up into `model/`).
4. Re-apply the three `from src.models.common.X` → `from .X` rewrites
   in `btc_model.py`.
5. If the checkpoint moved, update `workspace/checkpoints.local.yaml`
   and re-fetch.
