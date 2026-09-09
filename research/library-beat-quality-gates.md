# Fatal beat-quality gates for Library section inference

## Decision

Introduce a separate, immutable `BeatInputQualityDecision` between
`BeatAnalysisResult` and structural section inference. For policy
`beat-input-validity@1.0.0`, set `beat_input_valid=false` only when the beat
grid is structurally unusable:

1. the result violates its timing or provenance contract;
2. the analyzer reports a typed fatal condition;
3. fewer than 16 beats or fewer than 12 seconds of beat-supported active audio
   remain; or
4. less than 80% of active audio is supported by the beat grid, or one
   continuous active-audio hole exceeds both 8 seconds and 8 median beat
   intervals.

These numeric values are conservative **product hypotheses**, not values claimed
by the literature. They are suitable for a versioned `1.0.0-provisional`
policy and must not become the production default until the calibration gate in
[Calibration](#calibration) passes.

Do **not** make missing downbeats, a wide tempo range, high inter-beat-interval
variation, an unusual median tempo, leading/trailing silence, or a warning's
free-form text fatal on their own. Those facts remain warnings and provenance.
The already-decided 36-run perturbation test remains the downstream authority on
whether a formally valid beat grid is stable enough to publish inferred
sections.

## Why this boundary

Beat This! deliberately avoids a Dynamic Bayesian Network because fixed tempo,
meter and periodicity constraints fail on tempo changes, unsupported meters,
expressive timing and concatenated material. The paper also says the model can
emit wrongly non-periodic beats on difficult material, while some non-periodic
annotations are musically correct. Consequently, regularity alone cannot tell
valid expressive timing from tracker failure
([Foscarin, Schlüter and Widmer, sections 1 and 4.3](https://arxiv.org/abs/2407.21658)).

The same paper reports high event F1 but weaker continuity scores and explicitly
states that beat tracking is not solved, including for rock and electronic
music. Beat event plausibility is therefore insufficient evidence for a
structure stage that depends on a useful grid across the track
([paper, sections 4.3 and 5](https://arxiv.org/abs/2407.21658)).

The official Beat This! interface returns separate beat and downbeat arrays and
also exposes framewise logits through `Audio2Frames`; `final0` is the default
model and DBN postprocessing is optional
([official repository: inference and models](https://github.com/CPJKU/beat_this#inference)).
Our current adapter persists only beat events, downbeat flags, median tempo,
source facts and free-form warning strings. It does not yet retain confidence
or active-audio coverage, so it cannot implement a trustworthy fatal gate from
the current contract alone.

Reference-based evaluation remains a calibration tool, not a runtime gate.
`mir_eval` defines event F-measure with a 70 ms window and continuity metrics
with 17.5% phase and period tolerances; it also supports alternate metrical
levels because half/double-time ambiguity is inherent
([official `mir_eval.beat` documentation](https://mir-eval.readthedocs.io/latest/api/beat.html),
[implementation](https://github.com/mir-evaluation/mir_eval/blob/main/mir_eval/beat.py)).
Runtime audio has no reference beat annotations, so these scores cannot be
manufactured from self-consistency measurements.

## Required contract

Keep `BeatAnalysisResult.schema_version` about the analyzer output. Add a second
artifact with the following conceptual shape:

```text
BeatInputQualityDecision
  schema_version
  source_sha256
  beat_result_identity
    result_sha256
    analyzer_candidate
    analyzer_implementation_version
    model_identifier
    model_sha256
  policy
    gate_id = "beat-input-validity"
    gate_version
    calibration_id
    config_sha256
    implementation_revision
  beat_input_valid
  fatal_reason_codes[]
  warning_codes[]
  measurements
    beat_count
    downbeat_count
    median_inter_beat_seconds
    active_duration_seconds
    beat_supported_active_seconds
    active_coverage_ratio
    longest_unsupported_active_run_seconds
    longest_unsupported_active_run_beats
    first_beat_seconds
    last_beat_seconds
    detected_span_ratio
```

Replace `warnings: tuple[str, ...]` with typed warning records containing a
stable `code`, severity, and structured details. Human-readable messages may be
rendered from the code but never drive policy. Preserve unknown codes and treat
them as nonfatal until a new policy version classifies them; silently making a
new warning fatal would make old results change meaning.

`result_sha256`, the exact policy configuration digest, and analyzer identity
make the decision reproducible even after thresholds or model weights change.
The section-analysis cache key must include the quality-decision artifact hash.

## Measurements

### Contract integrity

Before quality scoring, require:

- finite source duration, sample rate, frame count, peak, beat times and derived
  measurements;
- positive duration, sample rate and channel count;
- nonempty beats, strictly increasing and inside `[0, duration_seconds]`;
- `downbeat_count` equal to the number of flagged beats;
- source hash and analyzer provenance matching the stage identity.

Most of these are already enforced by `BeatAnalysisResult` and the stage bridge.
The gate records a typed fatal reason if it receives an older, corrupted or
externally produced artifact that bypassed those validators.

### Active-audio support

Measure active audio from the same decoded source used for inference, before
source separation:

1. Fold channels to mono by RMS, not by signed summation.
2. Calculate non-overlapping 100 ms RMS frames.
3. Mark a frame active when its RMS is at least both `-60 dBFS` and `40 dB`
   below the track's 95th-percentile frame RMS.
4. Close inactive holes shorter than 300 ms so zero crossings and brief edits do
   not fragment activity.
5. A frame is beat-supported when its midpoint is within
   `max(350 ms, 0.75 * median_inter_beat_seconds)`, capped at 1.5 seconds, of
   the nearest detected beat.

This active mask and support radius are product definitions. Persist their
parameters in the hashed policy configuration. They avoid penalizing a silent
intro/outro while exposing long passages where audible music has no usable beat
grid. The cap prevents a single pair of extremely distant beats from claiming
an entire missing region as covered.

For diagnostics, also persist robust interval summaries (median, median absolute
deviation, 5th/95th percentiles, and maximum-to-median ratio). Do not use them as
fatal conditions in version 1: the Beat This! design explicitly permits tempo
and meter changes, and the values cannot distinguish an expressive passage from
a tracking error without reference or model confidence.

## Fatal and nonfatal classification

### Fatal in `1.0.0-provisional`

| Code | Condition | Reason |
| --- | --- | --- |
| `beat.contract_invalid` | Any integrity invariant above fails | The grid is not safe to consume. |
| `beat.no_beats_detected` | Analyzer returns no beats | There is no synchronization grid. |
| `beat.analyzer_failed` | Decode/model/postprocessing failed without a valid result | There is no reproducible grid to score. |
| `beat.insufficient_grid` | `beat_count < 16` | Fewer than four nominal 4/4 bars is too little evidence for multi-section inference. |
| `beat.insufficient_supported_duration` | `beat_supported_active_seconds < 12` | A tiny valid island must not authorize whole-track structure. |
| `beat.insufficient_active_coverage` | `active_coverage_ratio < 0.80` | Too much audible material lacks beat support. |
| `beat.long_active_gap` | One unsupported active run is `> 8 s` **and** `> 8 * median IBI` | A locally missing musical passage can hide or displace a section boundary even if global coverage is high. |

The paired seconds-and-beats rule prevents rejecting very slow music merely for
having a long inter-beat interval, while still catching a hole that spans many
beats at normal tempos.

### Nonfatal in version 1

- `downbeat_count == 0` or inconsistent downbeat spacing. The selected section
  hierarchy needs beats; downbeats can improve later presentation but are not a
  prerequisite.
- Median tempo outside a conventional dance-music range. Beat This! removed the
  DBN specifically to avoid fixed tempo limits.
- High IBI MAD, tempo jumps, half/double-time suspicion, or isolated long
  intervals that overlap inactive audio. Store and expose them to the
  perturbation suite.
- A large first-beat or end-beat gap when that region is inactive. Silence is
  not missing beat coverage.
- Clipping, low peak level, resampling, channel count, CPU/GPU choice, or
  float16 use after inference produced a valid grid. These may be analyzer or
  audio warnings, but they become fatal only if calibration demonstrates that a
  typed condition predicts unusable grids.
- Unknown warning codes. Record them and require policy review; do not change an
  already-versioned decision implicitly.

## Calibration

The provisional constants become `beat-input-validity@1.0.0` only after this
procedure:

1. Assemble a held-out Library corpus stratified by genre, meter, tempo,
   expressive timing, sparse/ambient material, long silence, live recordings,
   fades and concatenated songs. Do not tune on Beat This! training datasets;
   its official README warns that evaluation on training material can be
   unfairly good
   ([official model guidance](https://github.com/CPJKU/beat_this#available-models)).
2. Have two musically competent annotators label whether the predicted beat grid
   is usable for beat-synchronous structural boundaries, plus reference beat
   times where licensing and effort permit. Resolve disagreements explicitly.
3. Report `mir_eval` beat F1, CMLt and AMLt on annotated tracks, but tune runtime
   proxy thresholds against the binary *structurally usable* label.
4. Search thresholds using development folds only. On a locked test fold,
   require the upper 95% bootstrap confidence bound for invalid grids accepted
   by the gate to be at most 5%, while the lower bound for valid grids retained
   is at least 85%. Prefer abstention when objectives conflict.
5. Freeze the corpus revision, label revision, code revision, exact thresholds
   and resulting confusion matrix under `calibration_id`; hash the serialized
   policy config.
6. Run the four existing Library tracks only as regression smoke tests. They are
   unlabeled and cannot calibrate accuracy. Their current grids contain 324–452
   beats and detected spans of 93.5–98.1% of source duration, so they demonstrate
   that the provisional count and coarse-span gates are not accidentally
   impossible, nothing more.

Any threshold selected after this experiment replaces the provisional value,
even if numerically very different. Calibration owns the number; the literature
owns only the evaluation concepts and model limitations.

## Versioning rules

- `schema_version` changes when the artifact shape changes.
- `gate_version` is semantic: a major bump for any change that can flip
  `beat_input_valid`, a minor bump for new persisted nonfatal diagnostics, and a
  patch bump for implementation fixes proven not to change decisions.
- `calibration_id` identifies the immutable corpus/labels/split/result bundle.
- `config_sha256` covers every code classification, threshold, window, activity
  parameter and comparison operator. Equality at a threshold is therefore
  reproducible.
- Re-evaluation creates a new quality-decision artifact; never mutate an old
  artifact or reinterpret its warning strings under a newer policy.
- The section-inference artifact records both the beat-result hash and quality-
  decision hash. `beat_input_valid=false` deterministically selects the already
  decided one-editable-section fallback.

## Consequences for the map

This resolves the fatal precondition without duplicating the structural
stability gate. It also sharpens one implementation prerequisite: production
planning must add typed beat warnings and active-audio coverage to the analysis
contract before section inference can consume `beat_input_valid`.

No new product decision is required before the map destination. Choosing the
held-out calibration corpus and producing its labels are execution work after
the specification is handed off; the calibration acceptance rule above already
defines how that work decides the final thresholds.
