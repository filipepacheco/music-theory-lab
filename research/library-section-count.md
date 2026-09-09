# Inferring the number of contiguous Library sections

Date: 2026-09-08  
Question: Which reproducible method should infer a track's number of contiguous
sections from its audio features, with a measurable fallback when confidence is
low?

## Verdict

Use a beat-synchronous implementation of the McFee–Ellis Laplacian spectral
decomposition, pinned as its own offline pipeline stage. Generate structural
levels for `m = 2..10`, select the level with the paper's mean-duration plus
maximum-entropy rule, and count its contiguous runs—not its cluster labels—as
the proposed number of sections. Snap every boundary to an existing detected
beat and emit only neutral chronological names (`Parte 1`, `Parte 2`, ...).

Do **not** treat the selected level as ground truth. Measure its stability under
a fixed perturbation suite. Publish the automatic proposal only when both the
whole segmentation and every proposed internal boundary pass calibrated
stability gates. Otherwise abstain to one full-track editable section and retain
the rejected proposal as diagnostic provenance. This fallback is lossless,
preserves chronology, makes no unsupported semantic claim, and works with the
already chosen split/merge/boundary-moving UI.

The method follows a primary, inspectable algorithm rather than introducing a
trained section-label model. The paper explicitly separates the number of
cluster types from the number of contiguous segments and exposes multiple
granularities; it also reports that automatic selection does not reliably pick
the oracle level. That combination fits this ticket particularly well: use its
hierarchy, make selection deterministic, and abstain when the hierarchy is not
stable ([McFee & Ellis 2014, §§3.2–4.3](https://archives.ismir.net/ismir2014/paper/000319.pdf)).

## Inputs and feature construction

Read the immutable original recording plus the canonical
`BeatAnalysisResult`. The existing contract already supplies strictly ordered
beat times, source duration, model/checkpoint/code provenance, and warnings
([local beat contract](../research/audio-library-poc/src/audio_library_poc/beat_analysis.py)).
Use **all beats**, not the current `is_downbeat` flags: this decision does not
require a time-signature or reliable bar analysis.

For the baseline run:

1. Decode the full mix to mono, 22,050 Hz. Use a 2,048-sample FFT window and a
   512-sample hop.
2. Compute a 72-bin log-power constant-Q representation spanning C2–C8 for
   long-range repetition. Mean-aggregate frames between the existing beat
   times and add one beat of time-delay history.
3. Compute the first 13 MFCCs from the same audio and mean-aggregate them over
   the identical beat intervals for local timbre continuity.
4. Standardize each feature dimension per track before distances, recording
   zero-variance dimensions rather than dividing by zero.

Steps 1–3 reproduce the paper's published feature recipe and parameters
([McFee & Ellis 2014, §4.2](https://archives.ismir.net/ismir2014/paper/000319.pdf)).
`librosa.util.sync` is the directly available aggregation primitive and pads
indices to cover the full feature sequence; its documentation warns that beat
frames and features must use the same hop length
([librosa 0.10.2 `sync`](https://librosa.org/doc/0.10.2/generated/librosa.util.sync.html)).
The repo already pins librosa 0.10.x in the inference environment
([local POC dependencies](../research/audio-library-poc/pyproject.toml)).

Do not use chord labels as the sole structural input. Current Library artifacts
can contain long `no_chord` spans and null chord confidence, so section count
must remain recoverable from acoustic repetition and timbre even when chord
recognition abstains. Chord-change density may be recorded later as an
explanation, not as the first boundary generator.

## Deterministic algorithm

Let `n` be the number of beat intervals.

1. Build the harmonic affinity and mutual-nearest-neighbor recurrence graph
   using `k = 1 + ceil(2 * log2(n))`. Forbid recurrence links within three beats.
   Diagonally median-filter recurrence links with the paper's majority window
   `w = 17` beats. `librosa.segment.recurrence_matrix` supports explicit
   neighbor count, exclusion width, mutual neighbors, and affinity output;
   `timelag_filter` applies a diagonal filter in the time-lag domain
   ([recurrence matrix](https://librosa.org/doc/0.10.2/generated/librosa.segment.recurrence_matrix.html),
   [time-lag filter](https://librosa.org/doc/0.10.2/generated/librosa.segment.timelag_filter.html)).
2. Build a weighted nearest-neighbor sequence graph from adjacent MFCC beats.
   Combine it with the recurrence graph using the paper's closed-form `mu`
   that balances total local and repetition degree, then form the symmetric
   normalized graph Laplacian `L = I - D^-1/2 A D^-1/2`.
3. Compute the bottom ten eigenvectors once. For every `m = 2..min(10, n)`,
   row-normalize the first `m` eigenvectors and run K-means with exactly
   `init='k-means++'`, `n_init=20`, `max_iter=300`, `tol=1e-4`,
   `algorithm='lloyd'`, and `random_state=0`. Scikit-learn documents that an
   integer `random_state` makes centroid initialization deterministic and that
   `n_init` controls repeated initializations
   ([scikit-learn 1.9 `KMeans`](https://scikit-learn.org/stable/modules/generated/sklearn.cluster.KMeans.html)).
4. Convert every change in adjacent cluster assignment into an internal
   boundary. Always add `0` and source duration. Snap internal boundaries to
   the nearest input beat, break equal-distance ties toward the earlier beat,
   deduplicate, and merge any run shorter than four beats into the neighboring
   run with the smaller standardized feature discontinuity. This final minimum
   is a product guard against single-measure flicker, not a semantic claim.
5. Discard candidate levels whose mean contiguous-run duration is below ten
   seconds. Among the survivors, choose the level with maximum frame-level
   cluster-label entropy; break ties by smaller `m`, then fewer contiguous
   runs. If no level survives, the result is low-confidence.
6. The proposed section count is `len(boundaries) - 1`. `m` is **not** the
   count: repeated non-adjacent passages can share a cluster label, a distinction
   made explicitly by the source paper
   ([McFee & Ellis 2014, §§3.2–3.3](https://archives.ismir.net/ismir2014/paper/000319.pdf)).

The paper specifies the recurrence graph, optimal local/global weighting,
Laplacian decomposition, `m = 2..10`, and maximum-entropy selection under a
ten-second mean-duration constraint. Its reference implementation is available
in the MIT-licensed MSAF project, whose spectral segmenter consumes PCP plus
MFCC features and returns boundary indices and labels
([MSAF spectral segmenter](https://github.com/urinieto/msaf/blob/main/msaf/algorithms/scluster/segmenter.py),
[MSAF license](https://github.com/urinieto/msaf/blob/main/LICENSE.md)). Use it
as a parity oracle, not a runtime dependency: the local pipeline already has
the necessary librosa/scipy/scikit-learn stack, and a small in-repo stage keeps
the contract, cache identity, and Python 3.12 behavior under this repo's control.

## Confidence is stability, not correctness

Store the baseline result plus a deterministic 36-run full-factorial
perturbation suite:

- recurrence neighborhood: `k-1`, `k`, `k+1` (clamped to valid values);
- recurrence smoothing: `w = 13`, `17`, `21` beats;
- K-means seed: `0`, `1`, `2`, `3`.

Run the Cartesian product in lexicographic order
`(neighbor_offset, w, seed)`, where neighbor offsets are `-1, 0, +1`,
smoothing values are `13, 17, 21`, and seeds are `0, 1, 2, 3`. This is 36
named configurations and avoids confounding one parameter change with another.

For each perturbation, run the same level selector. Compare its internal
boundaries to the baseline with one-to-one matching within `max(1 beat, 3.0 s)`.
This deliberately uses the coarse structural tolerance separately from the
0.5-second localization metric: the paper found that 0.5-second and 3-second
metrics reward qualitatively different granularities
([McFee & Ellis 2014, §4.3](https://archives.ismir.net/ismir2014/paper/000319.pdf)).

Record:

- `boundary_support[i]`: fraction of the 36 perturbations containing a matched
  boundary for baseline boundary `i`;
- `count_agreement`: fraction producing the same contiguous-section count;
- `stability_f1`: median boundary F1 of the 36 perturbations against baseline;
- `selection_margin`: normalized entropy gap between the chosen and runner-up
  eligible levels (diagnostic only);
- `beat_input_valid`: false for fewer than 32 beat intervals, non-monotonic or
  out-of-range beats, non-finite features, or an upstream beat warning declared
  fatal by the stage contract.

`mir_eval.segment.detection` performs one-to-one boundary matching inside a
chosen window and returns precision, recall, and F-measure; its `deviation`
metric reports nearest-boundary timing error
([mir_eval 0.8.2 segment metrics](https://mir-eval.readthedocs.io/latest/api/segment.html)).
These are suitable both for perturbation stability and later human-reference
evaluation. Name the score `stability`, never `accuracy` or `probability`:
agreement among nearby parameterizations cannot prove musical correctness.

### Initial gate and fallback

Until calibrated, mark the gate version `provisional-v1` and accept a proposal
only when all are true:

- `beat_input_valid`;
- `count_agreement >= 0.75`;
- `stability_f1 >= 0.75`;
- every internal `boundary_support >= 0.67`;
- at least two eligible structural levels exist.

If accepted, initialize the shared annotation document from the proposed
neutral sections with `origin='automatic'`. If any gate fails, initialize
exactly one `[0, duration]` section with `origin='fallback'` and
`review_required=true`. Preserve candidate boundaries and all measurements in
the immutable analysis result, but do not silently install them into the shared
annotation. The user can recover them by splitting/moving boundaries in the
chronological editor.

The numerical thresholds are explicit starting hypotheses, not literature
claims. Calibrate them once on held-out Library recordings, then version any
change so the pipeline cache cannot mix decisions made by different gates.

## Output contract and reproducibility

Add a versioned `StructuralSegmentationResult` artifact containing:

- source SHA-256; input beat artifact SHA-256; stage/config/code versions;
- library versions and resolved numeric parameters;
- selected `m`, neutral cluster ids, baseline candidate boundaries and count;
- accepted boundaries and count, or the single fallback interval;
- all stability fields, gate version, decision (`accepted` or `fallback`),
  reason codes, and warnings;
- a full ordered partition of `[0, source.duration_seconds]` with no gaps or
  overlaps.

The artifact belongs to an immutable analysis run. The accepted/fallback
partition only seeds the separate shared annotation document; later manual
edits never rewrite this result. This mirrors the repo's existing stage
identity and portable JSON pattern and preserves the map's analysis-versus-
annotation boundary.

Pin direct dependencies rather than relying on librosa transitives: librosa,
NumPy, SciPy, and scikit-learn, including wheel hashes in `uv.lock`. Record the
BLAS/runtime platform because eigensolvers may vary at the last bit. Tests must
assert byte-identical output on the target Windows environment for repeated
runs of the same stage identity; K-means parameters must never inherit changing
library defaults.

## Evaluation protocol

1. **Unit/metamorphic tests.** Synthetic piecewise-constant features verify
   coverage, count, repeated labels versus contiguous runs, snapping, short-run
   merging, tie-breaks, and fallback reasons. Re-running identical bytes and
   identity must yield byte-identical JSON. Time stretching a real track should
   preserve beat-index boundaries; gain changes should not materially alter
   the partition.
2. **Public sanity check.** Evaluate coarse/uppercase SALAMI annotations, not
   semantic function labels. SALAMI publishes hierarchical annotations, often
   from two listeners, under CC0
   ([official SALAMI data repository](https://github.com/DDMAL/salami-data-public)).
   Use all available annotators independently rather than manufacturing a
   single unquestioned ground truth.
3. **Product calibration set.** Two people annotate coarse boundaries for at
   least 30 representative full tracks from the actual rock-oriented Library
   corpus. Split by track into calibration and locked test sets. Tune only the
   stability gates on calibration; never tune feature parameters on the locked
   set without starting a new evaluation version.
4. **Report per track and in aggregate.** Boundary precision/recall/F1 at 0.5 s
   and 3.0 s, median bidirectional boundary deviation, exact-count accuracy,
   mean absolute count error, fallback rate, accepted-only precision/recall,
   and coverage. Also report disagreement against each human annotator and the
   annotators against each other.
5. **Acceptance target.** Promote automatic initialization only if, on the
   locked set, accepted proposals achieve at least 0.80 boundary precision at
   3 s, exact-count accuracy at least 0.70, and coverage at least 0.60, while
   the fallback path has zero invalid partitions. These are product gates to be
   confirmed after observing annotator agreement, not published benchmark
   expectations.

The paper evaluated boundary F-measure at both 0.5 s and 3 s on Beatles-TUT and
SALAMI and showed that its automatic selector can be substantially below an
oracle choice, especially at finer granularity. That evidence argues for an
explicit accepted-precision/coverage tradeoff instead of unconditional output
([McFee & Ellis 2014, Tables 1–3](https://archives.ismir.net/ismir2014/paper/000319.pdf)).

## Practical fit and exclusions

- Reuses the canonical beat artifact and the inference environment's librosa
  stack; no new checkpoint, CUDA stage, or semantic-label taxonomy is needed.
- Produces chronological contiguous sections only. It does not reorder audio
  or infer `verso`, `refrão`, `intro`, or other names.
- Keeps automatic analysis immutable and manually edited shared annotations
  separate.
- Supports the chosen continuous-strip editor: accepted boundaries become its
  initial handles; fallback yields a single strip that the user can split.
- Leaves the existing 16/32-beat passage-similarity windows unchanged. A
  structural section is a UI annotation seed, not a replacement for the
  existing `Passage` retrieval concept.

## Decisions surfaced for later tickets

1. Define which upstream beat warnings are fatal and add a measured per-track
   beat-quality field; the current beat contract validates shape but does not
   expose a calibrated beat confidence.
2. Decide whether rejected candidate boundaries should be visible behind an
   explicit “show suggestion” control or remain diagnostic-only.
3. Decide ownership and merge behavior when a new canonical analysis proposes
   boundaries after users have already edited the shared annotation document.
