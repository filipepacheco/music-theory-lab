# Audio library: trustworthy harmony baseline — agent handoff

Prepared 2026-09-07 against `b780874` after merged PRs #19 and #21–26.
Status: ready for implementation. This document plans work; it does not claim
that the experiments or fixes below have been performed.

## Objective and scope

Make the existing beat/key/chord POC reproducible and honestly measurable,
verify the BTC integration, compare ChordNet, and select a provisional harmony
configuration using evidence. Deliver working code and a decision report even
if no candidate meets the quality target. Model accuracy is an experiment,
not a result the implementation agent can promise.

This is the next milestone in `audio-library-architecture.md`, covering its
Phase 3 and closing relevant documentation/contract gaps. Preserve the broader
roadmap: melody next, then rhythmic fingerprints and passage similarity, full
POC acceptance, private storage/API, durable jobs, and authenticated browsing.

In scope: POC documentation, evaluation contracts/tools, BTC parity fixes,
one ChordNet adapter, confidence/abstention, reproducible local comparisons,
section schema export, and tests. Keep the existing Biblioteca as an inspection
surface. Only make consumer changes required by an intentional contract change.

Out of scope: new catalogue features, section-detector tuning, uploads, cloud
deployment, authentication implementation, model training, paid APIs, melody,
rhythm, and similarity. No automatic publication of private outputs into
`public/library`, no audio copying, and no changes to shared song/transcription
storage. Do not create a new public endpoint to support this milestone.

## Starting evidence

| Area | Verified starting point |
| --- | --- |
| Harness | Hashing, metadata, immutable stage identities, artifact publication, cache/retry/recovery, checkpoint tooling |
| Separation | Real BS-RoFormer and Demucs runtimes; six recorded comparison runs on three recordings |
| Analysis | Beat This!, ChordMini BTC, HPCP key, chord-root-profile key, beat-aligned chords and Roman numerals |
| Viewer | Four-track static Biblioteca, sections, chart, optional audio playback |
| CI | Web tests/build and Windows POC checks passed on PR #26 |
| Quality | Existing three-track mean raw-label majmin score is 0.417; this is not the accepted/UI-output metric |
| Unfinished | ChordNet, calibrated confidence, trustworthy acceptance decision, melody and similarity |

Primary local evidence:

- `research/audio-library-poc/reports/phase3_evaluation.md` (ignored/private):
  raw majmin scores 0.253 / 0.659 / 0.340. Check annotation validity before
  drawing new conclusions. Its Here Comes the Sun reference reads A minor;
  investigate rather than changing it to agree with predictions.
- `research/audio-library-poc/reports/bakeoff.md` (ignored/private): timings
  and reconstruction error. These do not select the musically best separator.
- `git show ebdb34d`: guitar+other stem-input experiment regressed BTC results.
  Preserve this negative result; do not repeat it without a distinct hypothesis.
- `public/library/index.json`: four processed tracks. Section output requests
  seven segments; Here Comes the Sun has seven A labels. This is an experimental
  form display, not validated verse/chorus recognition.
- `research/audio-library-poc/README.md` and architecture Phase 2 still contain
  stale claims that separator adapters are stubs.

Some evidence exists only in the original machine's ignored workspace. An agent
in another checkout must inventory availability first; missing private data is
not permission to invent measurements or fetch replacement recordings.

## Execution rules

Read `AGENTS.md`, `CONTEXT.md`, root and nearest `CLAUDE.md`, the discovery
brief, and this plan. Record HEAD and working-tree status. Preserve unrelated
and untracked files, including generated CLAUDE.md files. Use small reviewable
changes; no bulk formatting, cleanup of historical runs, pushes, merges, or
deployments as an incidental part of implementation.

Target is Windows, Python 3.12, RTX 2060 6 GB; use the existing uv lock and
environment. Keep heavy imports behind runtime boundaries. Run GPU work
sequentially. Preserve originals, old reports, annotations, and accepted runs;
new behavior gets new implementation/config/schema identity as appropriate.

Proceed through the phases without asking for routine implementation approval.
If recordings or trustworthy annotations are unavailable, complete independent
code/tests and explicitly mark the empirical decision pending. Ask only for
the concrete missing data or judgment when it is needed. Insufficient evidence
must never become a passing gate.

## Phase 0 — Documentation discovery and state reconciliation

### Work

1. Inventory actual registered stages, public schemas, tests, private corpus,
   checkpoint manifests, and existing reports. Map architecture phases to
   implemented / measured / accepted / pending. Update README and architecture
   status, preserving the product decisions and original acceptance targets.
2. Read the upstream inference implementation at the pinned BTC revision
   `aa6e3a8d7b017f082fd2aaff9329d5c26af49c03`, then select and record the
   revision for ChordNet. Verify preprocessing, config construction, checkpoint
   normalization, vocabulary ordering, model outputs, overlap aggregation,
   smoothing, frame timing, and checkpoint terms before implementing calls.
3. Write `research/audio-library-harmony-dependencies.md`: exact revision,
   code licence, separate checkpoint terms/source/hash, API/CLI entry point,
   output shape, dependencies, and unresolved facts for each candidate.
   Reuse locally pinned assets where possible. No installation or checkpoint
   download is needed just to inspect this plan.
4. Add `SectionAnalysisResult` to the schema exporter and regenerate both
   schema modes. Expected baseline is 20 files; adding this contract makes 22.
   Later evaluation contracts may legitimately increase that count.

### References and allowed APIs

- Local stage pattern: `src/audio_library_poc/chordmini_btc_stage.py`,
  `ChordMiniBtcStageExecutor.execute(*, specification, identity, cache_key,
  attempt, staging_directory) -> StageOutput` (all POC paths below are relative
  to `research/audio-library-poc/`). Copy its typed failure, lazy runtime,
  staged descriptor, and result validation conventions, after auditing them.
- Local assets/contracts: `asset_resolution.py`, `metadata.hash_file`,
  `chord_analysis.py`, `section_analysis.py`, `schemas.py`, `stage_dispatch.py`.
- [ChordMini official README](https://github.com/ptnghia-j/ChordMini#test-generate-lab-for-one-audio-file):
  documents `src/evaluation/test.py` with model type ChordNet, checkpoint
  `checkpoints/2e1d_model_best.pth`, config `config/ChordMini.yaml`, `--audio_dir`
  and `--save_dir`. Its smoothing/overlap options are the reference; this is
  not proof that the local wrapper reproduces them. Freeze a revision before use.
- [mir_eval chord API](https://mir-eval.readthedocs.io/latest/api/chord.html):
  `evaluate(ref_intervals, ref_labels, est_intervals, est_labels, **kwargs)`
  supplies standard raw-label metrics. Follow documented interval/label
  semantics; product abstention metrics need their own explicit definitions.
- Existing vendoring inventory: `src/audio_library_poc/vendor/chordmini/README.md`.
  It explicitly excludes upstream evaluation and preprocessing helpers.

### Verify / guard

Schema reproducibility passes; stage list matches executable code; every new
external call has a pinned source reference. Do not copy an inferred API or
assume checkpoint terms from a code licence. Document UI/public-storage drift
without treating static assets as authenticated private storage. Verify hardware
claims from official documentation if retaining them; do not repeat unverified
precision/acceleration statements from stale notes.

## Phase 1 — Audit annotations and freeze an evaluation manifest

### Work

1. Reuse `key_evaluation.load_reference_key` and
   `chord_evaluation.load_reference_lab` as entry-point patterns. Inspect the
   real source annotations, including key syntax, modes, durations, silence,
   gaps, overlaps, and version/mastering alignment. Separate parser defects,
   questionable annotations, and model errors.
2. Add a strict versioned evaluation manifest with explicit original recording
   hashes, annotation hashes/source/version, excerpt bounds, evaluation split,
   and exact selected run/cache/artifact identities per candidate/config.
   Keep a fictional committed example and private populated copy.
3. Support explicit, documented annotation/audio offsets when independently
   justified. Preserve raw annotations and record corrections as versioned
   overlays with reasons. Quarantine unresolved references from accuracy totals.
4. Replace report-time directory sweeping as the authority for selection.
   Verify selected successful envelopes and artifact size/hash/schema before
   scoring. Reject ambiguous duplicate runs, source mismatches, stale artifacts,
   and missing selections with readable diagnostics.
5. Freeze development versus holdout assignments before tuning. Split by
   recording, not adjacent excerpts. Four tracks are a pilot; all have already
   been inspected, so do not claim a pristine blind test or a ten-track gate.

### References

`scripts/phase3_evaluation_report.py:54` (`AnnotationEntry`), `:59`
(`load_annotations`), `:85` (`collect_results`); `models.py`, `cache.py`,
`orchestrator.py` for identity and artifact semantics; `tests/test_key_evaluation.py`
and `tests/test_chord_evaluation.py` for fixture patterns. Recheck line numbers.

### Verify / guard

Tests cover multiword/key syntax found in the source, invalid intervals,
offsets, ambiguous/missing selections, tampered artifacts, and repeat runs.
One manifest produces the same scored inputs regardless of directory order or
unrelated additional runs. Do not optimize annotation shifts against prediction
accuracy, silently repair labels, or duplicate a recording in aggregate scores.

## Phase 2 — Measure raw predictions and accepted product output separately

### Work

1. Preserve existing raw `candidate_label` metrics as a historical diagnostic.
   Here “raw” means candidate vocabulary after current segment smoothing:
   `build_segments` can replace short segments with the previous label. Label
   this processing explicitly and retain pre-smoothing evidence separately.
   Add a separately named evaluator for normalized major/minor/unknown/no-chord
   output, the values consumed by Biblioteca. Audit vocabulary normalization
   against upstream token definitions, particularly `X`, `N`, extensions, and
   unsupported chords. Do not assume `X` means silence.
2. Define denominators in code and reports. On valid, major/minor reference
   duration, report correct accepted duration, accepted harmonic duration,
   accepted-label precision, coverage, and overall agreement. Count abstention
   as uncovered, not correct. Score no-chord references separately; report false
   no-chord on harmonic audio and unknown/no-chord durations separately.
   Document exclusions and major/minor reductions for richer reference chords.
3. Produce per-recording/excerpt scores, duration-weighted corpus scores, and
   macro averages clearly labelled. Preserve 0.417 as the old macro raw metric,
   not a directly comparable product gate. Add key top-1/top-3 and score margins;
   similarity/profile scores are not calibrated probabilities.
4. Add machine-readable JSON plus Markdown reports containing manifest/config/
   annotation hashes, selected identities, versions, sample sizes and warnings.
   Use recording-level bootstrap intervals with an explicit small-sample warning.

### References

`chord_evaluation.py:51` (`load_reference_lab`), `:63`
(`chord_result_to_estimate`), `:83` (`evaluate`); `chord_analysis.py`
(`ChordSegment`, `summarize_coverage`); `key_analysis.py`, `key_evaluation.py`;
`scripts/phase3_evaluation_report.py` and mir_eval docs from Phase 0.

### Verify / guard

Use hand-computable timed fixtures: perfect result, right root/wrong quality,
all unknown, all no-chord, mixed coverage, unsupported reference, and unequal
track lengths. No divide-by-zero, hidden exclusions, raw/accepted confusion,
or model confidence presented as measured accuracy. Export/version any new
public evaluation contracts using the existing schema pattern.

## Phase 3 — Verify BTC parity and add ChordNet

### Work

1. Compare the pinned upstream BTC path with our runtime on the same cached
   audio/checkpoint/config. Audit CQT scaling, normalization, vocabulary indices,
   frame/chunk alignment, padding, overlap and smoothing before blaming the model.
   Record intentional differences. Fix demonstrated adapter defects and preserve
   the original baseline under its existing identity.
   Check the rounded `ModelConfig.frame_duration` against hop/sample-rate timing,
   clip segment tails to the source bounds, and test short and padded final
   windows. Treat these as audit targets, not assumed explanations of poor scores.
2. Implement proposed stage kind `chord.chordmini_chordnet` behind the existing
   execution and `ChordAnalysisResult` boundaries. Copy the verified upstream
   model/preprocessing pattern; share only confirmed common behavior. Prefer a
   small reviewed vendor subset with licence/provenance over installing upstream's
   complete training environment.
3. Verify actual checkpoint bytes against recorded hashes before deserialization
   in the touched chord paths. Record effective config, code/checkpoint versions,
   and reject incompatible checkpoint/config pairs. Fetch-time verification alone
   does not prove the bytes being loaded are still the pinned artifact.
4. Retain pre-abstention class scores or sufficient frame-level evidence for
   both candidates as versioned, hashed private stage artifacts. Record overlap,
   smoothing and precision settings needed to reproduce them. Bump implementation
   and schema versions where behavior/contracts change; preserve old readers or
   explicitly invalidate only affected derived cache entries.
   The shared effective-settings contract currently requires `seq_len` and
   `hop_length`; verify they describe ChordNet honestly before reusing it.

### References

`_chordmini_btc_runtime.py:40` (`run_chordmini_btc_inference`), its `_run_inference`
helper, `chordmini_btc_stage.py`, `asset_resolution.py`, `execution.py`,
`stage_dispatch.py`, `vendor/chordmini/README.md`; pinned upstream sources
recorded in Phase 0. No ChordNet Python signature is assumed in this plan.

### Verify / guard

Tests cover registry dispatch, invalid config, checkpoint missing/hash mismatch
before heavy imports/deserialization, malformed model output, label mapping,
tail/chunk alignment and result provenance. Verify one real excerpt for parity
with stated numeric tolerances, then full-track execution on RTX 2060. Capture
end-to-end elapsed time separately from inference time and peak VRAM. Never
time asynchronous CUDA submission as completed inference: synchronize around
measurements where needed and record effective device/precision. Never
substitute synthetic-tone success for recording accuracy or silently fall back
to another candidate/device.

## Phase 4 — Bounded calibration and candidate decision

### Work

1. Freeze an explicit experiment matrix: preserved BTC baseline, verified/fixed
   BTC, ChordNet; full mix as primary input. Reuse HPCP and chord-root key baselines.
   Document a small development-only threshold/smoothing grid before running it.
   No model training or unbounded parameter search.
2. Define confidence from the documented model outputs and calibrate acceptance
   on development data only. Emit unknown when evidence is insufficient; retain
   the raw hypothesis and score. Select and freeze settings before holdout scoring.
3. Report accepted precision versus coverage and confidence-bin reliability.
   Evaluate relative-root invariance on pitch-shifted excerpts with transformation
   provenance; synthetic fixtures test math, transformed recordings test robustness.
4. Report beat F-measure only where trusted beat annotations exist. Otherwise
   mark beat quality unmeasured and flag its effect on aligned charts. Do not
   fabricate beat/key references to complete a table.
5. Write `research/audio-library-harmony-decision.md` with sanitized aggregate
   findings and exact reproduction commands. Keep detailed private evidence in
   ignored versioned reports. Classify chords/key/beat independently as go,
   conditional, no-go, or unmeasured; recommend one provisional configuration
   only if evidence supports it. Record what additional corpus is required.

### References

Architecture sections “Provisional gates”, “Phase 3”, “Phase 6”; Phase 1 frozen
manifest, Phase 2 metrics, Phase 3 raw-score artifacts; `beat_aligned_chords.py`.

### Verify / guard

Original targets remain chord agreement >=0.80, accepted precision >=0.90 at
coverage >=0.75, key top-1 8/10 and top-3 9/10, beat F-measure >=0.90. Report
pilot results against targets without claiming a ten-track acceptance from four
recordings. No lowering targets to obtain a pass, per-track cherry-picking,
post-holdout tuning, or “winner” selected solely by reconstruction error.

## Phase 5 — Final verification and handoff

1. Verify calls against the pinned source table, review identity/version changes,
   and search for stale stub claims, ambiguous raw/accepted metrics, unverified
   checkpoint loads, inferred confidence, and accidental private publication.
2. Run meaningful focused tests during each phase, then the full existing checks
   below once the implementation is stable. Confirm the dev-only environment
   remains importable/testable without CUDA extras; CI must stay green.
3. If consumer code changed, manually exercise Biblioteca at tablet width and
   ensure old result documents, missing audio, unknowns and no-chord still render.
4. Deliver changed-file list, test results, exact run commands, measured gates,
   unresolved evidence, and a continuation checkpoint. Link private artifacts
   locally only; never include their contents or recordings in a public PR.

From `research/audio-library-poc/` in PowerShell:

```powershell
.venv\Scripts\python.exe -m pytest
.venv\Scripts\ruff.exe check .
.venv\Scripts\ruff.exe format --check .
```

From the repository root:

```powershell
npm test
npm run build
git diff --check
git status --short
```

Schema byte reproduction is covered by `tests/test_schemas.py`. Do not replace
the working inference environment with a dev-only sync just to test dependency
isolation; use CI or a separate temporary environment when necessary.

Suggested review slices: (1) docs + section schema, (2) trusted evaluation
manifest/metrics, (3) BTC parity fixes, (4) ChordNet adapter, (5) calibration and
decision evidence. Each slice must stand on its own tests and documented scope.

## Copy-ready prompt for the implementing agent

> Implement `design-plans/audio-library-quality-handoff.md` phase by phase in
> this repository. Start by reading the repo instructions and auditing the current
> checkout; PRs #19 and #21–26 already shipped real analysis and a Biblioteca
> viewer, so do not rebuild them. Complete the evaluation integrity work, verify
> BTC against pinned upstream inference, add ChordNet, and run the bounded local
> comparison when the private assets are available. Preserve historical outputs
> and unrelated work. Keep raw-model metrics separate from normalized product
> metrics; report honestly if quality gates fail. Do not publish audio/results,
> deploy, or expand into uploads/cloud/melody/similarity. Finish with passing
> software checks, a reproducible decision report, and explicit empirical gaps.
