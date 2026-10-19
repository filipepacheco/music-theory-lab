# Audio-library harmony dependency audit

Verified 2026-09-07. This is a source and reproduction handoff, not an
accuracy claim. It deliberately contains no recordings, annotation contents,
private paths, checkpoint bytes, run identifiers, or populated manifests.

## Scope and local status

The reproducible POC is `research/audio-library-poc/`. It has registered beat,
key, BTC chord, section, and source-separation stages. Their implementation
does not establish a reproducible quality winner. The
static Biblioteca export is under `public/library/`; it is a public build asset,
not authenticated or private storage. Its four entries and per-track derived
JSON are a viewing sample, not an evaluation corpus or authority for choosing
model runs.

`SectionAnalysisResult` is consumed by the POC sync script and Biblioteca, so
it is now exported alongside the other public Pydantic contracts. The committed
schema baseline is 28 files: validation and serialization modes for 14 top-
level contracts, including private chord frame evidence.

The ignored local workspace has a checkpoint manifest, a corpus manifest, and
five model files. Both manifests are correctly ignored. The checkpoint manifest
has candidate, source URL, target-filename, and expected-hash fields, but its
schema has no field for checkpoint terms or licence source; record those in this
dependency handoff or a private sidecar when a checkpoint is selected. Its
private identities and byte hashes were intentionally not copied here. A future
evaluation manifest must bind original and annotation hashes, excerpt bounds,
offsets, selected successful envelopes, artifact hashes and versions, and
development/holdout assignment.

## Pinned BTC source

| Item | Recorded value | Evidence and implementation boundary |
| --- | --- | --- |
| Source | `https://github.com/ptnghia-j/ChordMini` | Local vendor README records source and pinned commit; it contains reviewed BTC and ChordNet inference subsets. |
| Revision | `aa6e3a8d7b017f082fd2aaff9329d5c26af49c03` | `src/audio_library_poc/vendor/chordmini/README.md`; only the BTC subset is vendored. |
| Code licence | MIT | Local verbatim `vendor/chordmini/LICENSE`; verified at the pinned revision: `https://github.com/ptnghia-j/ChordMini/blob/aa6e3a8d7b017f082fd2aaff9329d5c26af49c03/LICENSE`. |
| Local entry point | `run_chordmini_btc_inference` | `_chordmini_btc_runtime.py`; the stage is `chord.chordmini_btc` in `stage_dispatch.py`. |
| Checkpoint | not pinned in committed sources | `btc_model_best.pth` is named by the upstream README, but no committed URL, terms, byte hash, or local file identity is a public dependency record. Require all four before deserializing it. |

## Pinned ChordNet source

ChordNet is selected at the same ChordMini revision as BTC:
`aa6e3a8d7b017f082fd2aaff9329d5c26af49c03`. This prevents a candidate
comparison from mixing source revisions. It is a source pin only; it does not
pin or grant rights to a checkpoint.

| Item | Recorded value |
| --- | --- |
| Official CLI | `src/evaluation/test.py --model_type ChordNet --checkpoint <path> --config config/ChordMini.yaml --audio_dir <file-or-directory> --save_dir <directory>` |
| Load contract | `load_model` calls `torch.load(..., weights_only=False)`, accepts `model_state_dict`, then `model`, then the checkpoint itself, strips a leading `module.`, and extracts normalization from nested `normalization.mean/std` or top-level `mean/std`. It defaults missing normalization to `0.0/1.0`. |
| Model construction | `load_model` infers ChordNet frequency/classes, groups, layers, and heads from state-dict shapes; checkpoint `config` then overrides every inferred architecture value, and explicit CLI overrides apply last for the supported model parameters. The YAML's 12 groups, five layers, eight heads, and 0.2 dropout are defaults, not a checkpoint guarantee. |
| Output contract | `ChordNet.forward` returns `(logits, features)` without targets; its `predict(..., per_frame=True)` returns frame class indices. The configured vocabulary has 170 classes. A strict state-dict load falls back to `strict=False` upstream, so the adapter must record and reject or explicitly surface such incompatibility rather than silently accepting it. |
| Feature extraction | `librosa.load(..., sr=22050)`, CQT with 144 bins, 24 bins/octave, hop 2048 and `fmin=C1`; the upstream path uses `log(abs(CQT) + 1e-6).T` and derives frame duration from hop/sample rate. |
| Windowing and smoothing | `seq_len=108`; zero-pad only the last feature window; ChordNet overlap is 0.5 when explicitly enabled. The shared prediction path applies ChordNet model-logit temporal smoothing by default before decoding or score aggregation. `smooth_predictions` is a separate optional majority filter on final categorical indices. Record both settings, kernel size, Gaussian choice, and aggregation mode. |
| Runtime dependencies | `torch`, `numpy`, `librosa`, and the selected-revision ChordMini model/common/config/checkpoint utilities. The reviewed local subset now includes `chord_net.py` and `base_transformer.py`; it does not include a checkpoint, training code, or upstream evaluation harness. |
| Checkpoint | Upstream names `checkpoints/2e1d_model_best.pth`; its URL, bytes, SHA-256, redistribution terms, and any dataset restrictions remain unpinned. |
| Code licence | MIT at the selected revision. |

The reference implementation is not a stable library API. A future adapter must
vendor a small reviewed subset, preserve its licence and notice, and reproduce
the upstream CLI result on identical cached audio, checkpoint, and effective
settings before competing in the evaluation. The existing BTC adapter is not a
drop-in implementation. The preserved BTC baseline has its own historical
identity; verified BTC and ChordNet use `log(abs(CQT) + 1e-6).T` and record
their effective preprocessing explicitly.

The vendored BTC adapter presently builds CQT features with the local model
defaults, loads `model_state_dict` plus checkpoint normalization, and emits
segments from its own overlap aggregation. It requires parity verification on
the same private audio/checkpoint/config before its output is compared with the
upstream command. The local product mapping keeps `N` as explicit no-chord and
keeps `X` as unknown; this preserves the two upstream tokens distinctly and
does not claim that `X` represents silence.

## External source record

- ChordMini official repository and test commands:
  <https://github.com/ptnghia-j/ChordMini>
- Selected-revision ChordNet CLI:
  <https://github.com/ptnghia-j/ChordMini/blob/aa6e3a8d7b017f082fd2aaff9329d5c26af49c03/src/evaluation/test.py>
- Selected-revision ChordNet model:
  <https://github.com/ptnghia-j/ChordMini/blob/aa6e3a8d7b017f082fd2aaff9329d5c26af49c03/src/models/chord_net.py>
- Selected-revision ChordNet checkpoint loader:
  <https://github.com/ptnghia-j/ChordMini/blob/aa6e3a8d7b017f082fd2aaff9329d5c26af49c03/src/models/common/checkpoint_loading.py>
- Selected-revision checkpoint extraction and normalization:
  <https://github.com/ptnghia-j/ChordMini/blob/aa6e3a8d7b017f082fd2aaff9329d5c26af49c03/src/utils/checkpoint_utils.py>
- Selected-revision preprocessing and window aggregation:
  <https://github.com/ptnghia-j/ChordMini/tree/aa6e3a8d7b017f082fd2aaff9329d5c26af49c03/src/evaluation/utils>
- Selected-revision MIT licence:
  <https://github.com/ptnghia-j/ChordMini/blob/aa6e3a8d7b017f082fd2aaff9329d5c26af49c03/LICENSE>
- Original BTC repository named by ChordMini:
  <https://github.com/jayg996/BTC-ISMIR19>
- `mir_eval` chord API, the raw-metric reference only:
  <https://mir-eval.readthedocs.io/latest/api/chord.html>
- NVIDIA's CUDA GPU table lists GeForce RTX 2060 as compute capability 7.5:
  <https://developer.nvidia.com/cuda/gpus>

Code licences do not grant checkpoint, dataset, recording, or annotation rights.
The ChordMini repository itself says its labelled audio and annotations are not
included because access is restricted. Record checkpoint source/terms separately
from code licence, then retain its SHA-256 in the private manifest and verify
the on-disk bytes immediately before `torch.load`.

## Environment evidence and blockers

Observed locally: Python 3.12.3, `ffprobe` on PATH, and `nvidia-smi` reporting
NVIDIA GeForce RTX 2060, 6144 MiB, driver 591.86, and compute capability 7.5.
That is hardware inventory only. Outside the restricted sandbox, the direct
probe succeeded with torch `2.6.0+cu124`, CUDA `12.4`, CUDA availability `True`,
device capability `(7, 5)`, and `torch.cuda.is_bf16_supported()` `True`. It
still establishes neither precision parity, peak VRAM, nor model timing; record
those with each candidate run.

No committed corpus, reference annotation, populated evaluation manifest, or
selected successful-stage envelope exists by design: those would expose private
recording or annotation references. The ignored local manifests and artifacts
must be used only by the reproduction workflow. Their private status blocks
neither the Phase 1 manifest/evaluator implementation nor its synthetic tests;
it does prevent a public document from claiming measured gates or a candidate
decision without a separately reviewed sanitized aggregate report.

## File ownership and dependency order

| Phase | Primary files | Depends on |
| --- | --- | --- |
| 1: manifest and annotation audit | new `evaluation_manifest.py`, `chord_evaluation.py`, `key_evaluation.py`, new tests and fictional example | private local evidence only at run time; no UI changes |
| 2: product metrics | new evaluator/report modules, `chord_analysis.py`, `key_analysis.py`, `scripts/phase3_evaluation_report.py`, tests | frozen manifest and selected verified artifacts |
| 3: BTC parity / ChordNet | `_chordmini_btc_runtime.py`, `chordmini_btc_stage.py`, new ChordNet runtime/stage, `asset_resolution.py`, `stage_dispatch.py`, vendor NOTICE, tests | pinned upstream source and separately pinned checkpoints |
| 4: calibration/decision | experiment config, evaluator/report modules, `research/audio-library-harmony-decision.md` | Phase 1 manifest, Phase 2 metrics, Phase 3 raw-score artifacts |
| 5: consumer verification | `scripts/sync_workspace_to_public.py`, `src/components/library/*` only if a public contract changes | completed evaluation choice; never private-audio publication |

`schemas.py`, `schemas/`, `tests/test_schemas.py`, and
`tests/test_cli.py` are Phase 0 contract-export ownership. They are independent
of evaluation data and must remain byte reproducible.
