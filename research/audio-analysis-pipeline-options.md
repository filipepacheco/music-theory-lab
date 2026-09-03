# Audio analysis pipeline options

Date: 2026-08-30

## Scope

Primary-source audit for the offline audio-library POC described in
`design-plans/audio-library-discovery.md`. The target machine is Windows with
an RTX 2060 and 6 GB VRAM. The target material is mastered rock recordings,
eventually numbering from hundreds to low thousands.

The required outputs are:

- vocals, drums, bass, guitar, and residual `other` stems;
- one global major/minor tonal estimate with alternatives and confidence;
- high-precision major/minor chord regions with explicit abstention;
- separate vocal, bass, and guitar pitch/interval contours;
- a beat grid and tempo-invariant rhythmic fingerprint;
- explainable whole-track and passage-level similarity by harmony, melody,
  and rhythm.

This is a candidate audit, not a claim that published benchmark scores predict
quality on Led Zeppelin, Pink Floyd, or Radiohead mixes. The POC corpus is the
product acceptance boundary.

## Recommendation

Use a modular Python pipeline. No single inspected model produces all required
outputs with useful confidence and provenance.

1. Probe with FFmpeg/ffprobe and hash every source.
2. Bake off the default six-stem BS-RoFormer-SW checkpoint through
   `bs-roformer-infer` against Demucs `htdemucs_6s`.
3. Track beats with Beat This! `final0`, without its optional madmom DBN.
4. Compare a transparent HPCP/profile key baseline with Essentia
   `KeyExtractor`; do not make Essentia a production dependency without a
   licence decision.
5. Compare the existing madmom floor with ChordMini's ChordNet and BTC paths;
   retain Chordino only as a classical baseline.
6. Use torchcrepe for monophonic vocal/bass F0 and Basic Pitch for bass/guitar
   note events. Let guitar abstain in chordal or poorly separated passages.
7. Build drum onset features, cross-similarity, and subsequence alignment with
   librosa.
8. Evaluate with mir_eval plus explicit accepted-precision/coverage and
   retrieval metrics.

At POC scale, use direct symbolic pair comparison and cache results. Do not add
an embedding model or vector database before the deterministic baseline is
measured.

## Source separation

### BS-RoFormer-Infer — preferred first candidate

The [official inference package README](https://github.com/openmirlab/bs-roformer-infer/blob/main/README.md)
documents a Python 3.10+/PyTorch 2.0+ inference-only package. Its recommended
`BS-RoFormer-SW` registry entry emits six stems: vocals, drums, bass, guitar,
piano, and other. The app should fold piano into `other`, preserving the native
artifact for research.

Documented lifecycle API:

```python
from bs_roformer import BSRoformerSession

with BSRoformerSession(device='cuda') as session:
    session.infer('input_folder', store_dir='outputs')
```

Documented CLI:

```text
bs-roformer-infer --input_folder songs --store_dir stems --device cuda
```

The package registry stores checkpoint URLs and SHA-256 values. Its README
currently identifies the default checkpoint as `BS-Rofo-SW-Fixed.ckpt`, about
700 MB, with SHA-256
`24e7d35ee9c64415673d3fd33e06a67cac2c103c5df6267ba1576459c775916e`.
The POC must copy the effective registry metadata into its run manifest rather
than trust a mutable model slug.

Why it leads the bake-off:

- native six-stem output matches the requested instruments;
- explicit session lifetime helps release scarce 6 GB VRAM between stages;
- registry downloads are integrity checked;
- code/config is MIT licensed.

Risks:

- the inference package and current registry are comparatively new;
- the default is a community-trained checkpoint, not the checkpoint evaluated
  in the original paper;
- the README documents past upstream accounts and fallback URLs disappearing;
- package licence, architecture licence, training-data rights, and checkpoint
  terms are separate facts.

The original [BS-RoFormer paper](https://arxiv.org/abs/2309.02612) reports a
9.80 dB average SDR on MUSDB18HQ for a smaller architecture and first place in
the SDX23 music-separation track. That supports evaluating the architecture;
it is not evidence that this particular six-stem checkpoint passes the private
corpus.

### Demucs — required historical baseline

The [official Demucs repository](https://github.com/facebookresearch/demucs)
was archived on 2025-01-01 and states that it is no longer actively
maintained. Its `htdemucs_6s` model adds guitar and piano to vocals, drums,
bass, and other. The README calls the six-source model experimental and warns
about piano quality.

Documented Python entry point:

```python
import demucs.separate

demucs.separate.main(['-n', 'htdemucs_6s', '--segment', '8', 'song.mp3'])
```

The exact segment value is a POC parameter, not a fixed recommendation. The
README reports about 7 GB VRAM for defaults, at least 3 GB with smaller
segments, and `--segment 8` as an example for 3 GB. Therefore the RTX 2060 is
plausible, but every run must record segment, overlap, shifts, precision, peak
VRAM, and runtime. A smaller segment may reduce quality.

Use Demucs as a stable comparison point, not the long-term abstraction. Its
archived status and experimental guitar output make silent production lock-in
unwise.

### python-audio-separator — useful harness, optional dependency

The active [python-audio-separator repository](https://github.com/nomadkaraoke/python-audio-separator)
supports MDX, VR, Demucs, MDXC/RoFormer and related architectures. Its CLI can
list/filter models and its Python interface separates one file, a list, or a
directory:

```python
from audio_separator.separator import Separator

separator = Separator(output_dir='output')
separator.load_model(model_filename='pinned-model.ckpt')
output_files = separator.separate('audio.wav')
```

The documented `separate()` result is a list of fully written output paths.
Batch failures use `BatchSeparationError`; validation/publication errors have
more specific exception types. These are useful semantics for a POC adapter.

The broad model catalogue and automatic download behavior are convenient for
exploration but dangerous for reproducibility. If used, resolve a model once,
record the exact filename/source/hash/config, and make subsequent POC runs
offline. Do not pick the top displayed SDR without confirming its target stem,
dataset, and checkpoint provenance.

### Not selected initially

[Music-Source-Separation-Training](https://github.com/ZFTurbo/Music-Source-Separation-Training)
supports several modern architectures and is valuable for training or broad
evaluation. It is too large a dependency surface for the first inference-only
POC. Revisit only if the pinned inference packages cannot run the chosen
checkpoint or if fine-tuning becomes justified.

## Beat grid and rhythmic evidence

### Beat This! — preferred

The [Beat This! repository](https://github.com/CPJKU/beat_this) documents an
MIT-licensed model and weights, direct file inference, GPU selection, directory
processing, and beat/downbeat output. The package API is:

```python
from beat_this.inference import File2Beats

file2beats = File2Beats(
    checkpoint_path='final0',
    device='cuda',
    dbn=False,
)
beats, downbeats = file2beats('song.mp3')
```

Use `final0` first and `dbn=False`. The optional DBN pulls in madmom, whose
current compatibility friction is already visible in
`research/chord-recognition/README.md`. The model's README also warns that
evaluation on training datasets can be optimistically biased; the private
corpus avoids that direct leakage concern.

### Rhythmic fingerprint

Beat This supplies alignment, not a full groove descriptor. On the separated
drum stem, use documented librosa functions:

- [`librosa.onset.onset_strength`](https://librosa.org/doc/0.11.0/generated/librosa.onset.onset_strength.html)
  returns a spectral-flux onset envelope;
- [`librosa.segment.cross_similarity`](https://librosa.org/doc/0.11.0/generated/librosa.segment.cross_similarity.html)
  returns a cross-similarity matrix between feature sequences;
- [`librosa.sequence.dtw`](https://librosa.org/doc/0.11.0/generated/librosa.sequence.dtw.html)
  supports `subseq=True` for retrieval-style alignment.

Resample onset energy into beat-relative duple and triplet subdivisions. This
keeps comparison tempo-invariant and avoids assuming that all material is
straight 4/4. Persist the beat grid, resampling parameters, feature vectors,
and coverage so a similarity explanation can point to evidence.

BeatNet is a reasonable alternate tracker, but it adds no necessary first-POC
capability over this simpler documented path.

## Key and scale

### Transparent baseline

Implement a small, testable baseline that aggregates an HPCP/chroma profile,
scores all 12 tonics against major and minor templates, and retains all 24
scores. The primary result is the top score; alternatives and confidence come
from normalized score margins calibrated on the private corpus.

This baseline is intentionally simple. It makes alternatives observable and
prevents a library API's single `strength` scalar from becoming unexplained
product confidence. It must not infer tonal centre from mere scale membership;
`CONTEXT.md` already records that distinction.

### Essentia comparison

Essentia's documented
[`KeyExtractor`](https://essentia.upf.edu/reference/streaming_KeyExtractor.html)
takes audio and emits `key`, `scale`, and `strength`. It computes HPCP frames,
supports tuning correction, and offers multiple `profileType` choices. Run a
small fixed profile comparison and record the exact profile, frame/hop size,
HPCP size, tuning, and thresholds.

Essentia's
[`TonalExtractor`](https://essentia.upf.edu/reference/std_TonalExtractor.html)
also emits key fields, an HPCP, chord progression, and chord strengths. Its
chord output should not replace the chord bake-off: the project's own
[chord tutorial](https://essentia.upf.edu/tutorial_tonal_chords.html) calls
`ChordsDetection` naive.

Licensing is the production blocker. Essentia's
[licensing page](https://essentia.upf.edu/licensing_information.html) states
that the library is AGPLv3 for non-commercial applications, commercial terms
are separate, and many pre-trained models are CC BY-NC-ND for non-commercial
use. It is acceptable as a private POC comparator; adopting it in a deployed
service requires an explicit decision.

## Chord recognition

### Existing madmom baseline

Keep `CNNChordFeatureProcessor` plus `CRFChordRecognitionProcessor` only as the
historical floor. The repository's existing synthetic C-Am-F-G-C experiment
proved that the patched code executes but produced musically unusable output.
Pure sine stacks were outside the model's real-recording distribution, so the
next evaluation must use trusted excerpts.

### ChordMini BTC and ChordNet — preferred current bake-off

The current [ChordMini repository](https://github.com/ptnghia-j/ChordMini)
publishes checkpoints and one-file test commands for both models through
`src/evaluation/test.py`. Inputs may be a file or directory; outputs are `.lab`
files. The documented candidate forms are:

```text
python src/evaluation/test.py --model_type ChordNet \
  --checkpoint checkpoints/2e1d_model_best.pth \
  --config config/ChordMini.yaml --audio_dir song.mp3 \
  --save_dir output --use_overlap --vote_aggregation logit \
  --smooth_predictions

python src/evaluation/test.py --model_type BTC \
  --checkpoint checkpoints/btc_model_best.pth \
  --config config/ChordMini.yaml --audio_dir song.mp3 \
  --save_dir output --smooth_logits --use_overlap \
  --vote_aggregation logit --smooth_predictions
```

Do not copy every optional smoothing argument blindly. Phase 0 should capture
the actual installed revision's `--help`, then define a small configuration
grid. Normalize every output to major/minor/no-chord before comparison and add
our own `unknown` threshold using candidate confidence/logits when available.

The original [BTC paper and repository](https://github.com/jayg996/BTC-ISMIR19)
remain useful for model intent and framewise probability semantics, while
ChordMini is the more current runnable wrapper. ChordMini is a young project,
so checkpoint identity and labelled-data claims need local verification.

### Chordino — classical baseline only

The official [NNLS Chroma/Chordino repository](https://github.com/c4dm/nnls-chroma)
identifies the Vamp plugin as `vamp:nnls-chroma:chordino`, emits timed chord
estimates, and supports HMM/Viterbi smoothing. The README itself describes the
approach as non-state-of-the-art. GPL-2.0 licensing plus Vamp/C++/Windows setup
friction make it a comparison baseline, not the preferred production route.

### Input combinations to measure

For each chord candidate compare:

1. full mix;
2. full mix with vocals/drums attenuated if the separator supports remixing;
3. guitar + bass + other;
4. guitar alone.

The winner is the input/candidate pair with accepted-label precision and useful
coverage, not the cleanest-sounding guitar stem. Harmony can live in keyboards,
bass motion, vocals, and residual `other`.

## Melody and pitch contours

### torchcrepe — vocal and monophonic bass

The [torchcrepe repository](https://github.com/maxrmorrison/torchcrepe)
documents CUDA inference and exposes confidence-like periodicity:

```python
pitch, periodicity = torchcrepe.predict(
    audio,
    sample_rate,
    hop_length,
    fmin,
    fmax,
    'full',
    batch_size=batch_size,
    device='cuda:0',
    return_periodicity=True,
)
```

Its documented filters include median/mean smoothing,
`torchcrepe.threshold.At`, `Hysteresis`, and a silence threshold. Tune separate
frequency ranges and thresholds for vocals and bass. Preserve periodicity and
the voiced mask; do not store only the post-threshold pitch.

This is not a polyphonic guitar solution. It may work on clearly monophonic
lead passages, but guitar should normally use the note-event candidate below.

### Basic Pitch — bass/guitar polyphonic baseline

Spotify's [Basic Pitch README](https://github.com/spotify/basic-pitch) states
that it is instrument-agnostic, polyphonic, and works best on one instrument at
a time. Windows uses an available serialized runtime, including ONNX. The
programmatic contract is:

```python
from basic_pitch.inference import predict

model_output, midi_data, note_events = predict('stem.wav')
```

`note_events` contain timing, MIDI pitch, and amplitude-like evidence; the POC
normalizes those events into beat-aligned pitch and interval observations.
Keep raw outputs for evaluation even though the UI does not need exact note
onsets and durations.

Run Basic Pitch on separated bass and guitar, not the full mastered mix. Score
lead and chordal guitar excerpts separately. If no threshold gives both useful
coverage and believable precision, mark guitar melody unsupported rather than
invent a monophonic line.

## Similarity approach

### Harmony features

Convert each accepted major/minor chord to an absolute root/quality plus a root
relative to the selected tonic. Keep chromatic roots as chromatic. Compare
beat-normalized passages using duration-weighted token agreement, n-grams, and
sequence alignment. This is transposition-invariant without erasing chord
quality or chromatic detail.

### Melody features

For each instrument, derive semitone intervals and coarse contour from accepted
observations. Compare with subsequence DTW after transposition and octave
normalization. Keep source-specific scores and combine only eligible sources.

### Rhythm features

Compare multi-resolution, beat-relative drum onset vectors using cosine or
cross-affinity and local sequence alignment. Never compare raw seconds when the
requirement is tempo invariance.

### Passage retrieval

Use overlapping 16- and 32-beat windows rather than inferred sections. Compute
directly and cache by both analysis-run ids and feature/config versions. For
roughly 1,000 tracks, the approximately 500,000 unordered pairs are a tractable
offline batch for compact symbolic features. Measure before introducing ANN.

## Evaluation design

### Ladder

1. Three tracks, several 30–60 second trusted excerpts: execution and schema
   smoke test.
2. Ten tracks, three contrasting excerpts per track: candidate bake-off.
3. Three to five full tracks: long-run behavior, transitions, silence, tempo
   drift, resource use, interruption, and resume.

Synthetic audio may test deterministic transforms and queue behavior. It must
not stand in for model-quality evaluation. Pitch-shifted and time-stretched
real excerpts are valid metamorphic tests because their expected invariances
are known.

### Metrics

Use the [mir_eval project](https://github.com/mir-evaluation/mir_eval) for
standard beat, chord, and melody metrics:

- beat F-measure;
- duration-weighted major/minor chord agreement;
- raw pitch, raw chroma, voicing recall, and voicing false alarm.

Add product-specific metrics:

- accepted-label precision and coverage after abstention;
- top-1/top-3 key accuracy and confidence margin calibration;
- separator downstream gain versus full-mix input;
- passage retrieval recall@5;
- invariance rank under pitch shift, octave shift, and time stretch;
- runtime factor, peak VRAM/RAM, disk, failure/retry rate.

For source separation, [MUSDB18](https://sigsep.github.io/datasets/musdb.html)
and [museval](https://github.com/sigsep/sigsep-mus-eval) provide a public
four-source sanity check, not a guitar-specific product gate. GuitarSet's
[official repository](https://github.com/marl/GuitarSet) and
[Zenodo record](https://zenodo.org/records/3371780) can sanity-check guitar
transcription, but its clean guitar signals do not reproduce errors from
separating a mastered rock mix.

### Provisional gates

| Capability    | Gate                                                                                                               |
| ------------- | ------------------------------------------------------------------------------------------------------------------ |
| Beat          | F-measure at least 0.90 on evaluated excerpts.                                                                     |
| Key           | top-1 at least 8/10; correct in top-3 at least 9/10.                                                               |
| Chords        | duration-weighted major/minor agreement at least 0.80; accepted precision at least 0.90 at coverage at least 0.75. |
| Vocal melody  | raw pitch at least 0.85 on accepted frames at coverage at least 0.70.                                              |
| Bass melody   | same initial target; report octave mistakes separately.                                                            |
| Guitar melody | exploratory raw pitch at least 0.65 on lead excerpts and honest abstention on chordal excerpts.                    |
| Separation    | improves chord precision or relevant melody accuracy on at least 70% of evaluated excerpts.                        |
| Invariance    | transformed excerpt ranks first against its own source.                                                            |
| Retrieval     | related passage in top five for at least 80% of at least 20 labelled queries.                                      |
| Hardware      | no RTX 2060 OOM with recorded settings; end-to-end real-time factor above 8 forces a deployment/hardware review.   |

Each capability passes independently. Guitar melody failure cannot hide or
block successful harmony, vocal/bass melody, or rhythmic analysis.

## Metadata

Use [`ffprobe`](https://ffmpeg.org/ffprobe.html) JSON as the first dependency
because FFmpeg is already required for audio decoding. Capture format/stream
facts and raw tags, then map title, artist, album, date/year, and genre without
discarding unknown fields. Filename inference fills only missing fields.

[Mutagen](https://github.com/quodlibet/mutagen) has broader direct ID3 support
and is a useful fallback comparison, but its GPL-2-or-later boundary should be
reviewed before embedding it in a deployed service. Online acoustic
fingerprinting and metadata enrichment are deferred.

## Contract and orchestration sources

For model-independent output contracts, Pydantic's official
[JSON Schema documentation](https://docs.pydantic.dev/latest/concepts/json_schema/)
documents `BaseModel.model_json_schema()` and separate validation versus
serialization schema modes. Commit generated schemas and create TypeScript
types from them after the POC passes.

For later production integration:

- FastAPI's [`UploadFile`](https://fastapi.tiangolo.com/tutorial/request-files/#uploadfile)
  is spooled rather than loading a large upload wholly into memory;
- FastAPI explicitly recommends an external mechanism for
  [heavy background computation](https://fastapi.tiangolo.com/tutorial/background-tasks/#caveat);
- PostgreSQL documents `SKIP LOCKED` as useful with multiple consumers of a
  [queue-like table](https://www.postgresql.org/docs/17/sql-select.html#SQL-FOR-UPDATE-SHARE);
- private object storage can use authenticated, short-lived
  [presigned uploads](https://docs.aws.amazon.com/AmazonS3/latest/userguide/PresignedUrlUploadObject.html).

These are production seams, not POC requirements.

## Allowed APIs for Phase 0

An implementation agent may start from only these documented seams, rechecking
the pinned revision before coding:

| Project                | Documented seam                                          | Expected output                                          |
| ---------------------- | -------------------------------------------------------- | -------------------------------------------------------- |
| Demucs                 | `demucs.separate.main(list[str])`                        | audio files under the model/stem output tree             |
| BS-RoFormer-Infer      | `BSRoformerSession(...).infer(input, store_dir=...)`     | six stem WAVs plus instrumental artifact                 |
| python-audio-separator | `Separator`, `load_model`, `separate`                    | list of completed output paths or typed batch error      |
| Beat This!             | `File2Beats(...)(audio_path)`                            | `(beats, downbeats)` timestamp arrays                    |
| Essentia               | `KeyExtractor`                                           | `key`, `scale`, `strength`                               |
| ChordMini              | `src/evaluation/test.py`                                 | timed `.lab` chord file                                  |
| torchcrepe             | `predict(..., return_periodicity=True)`                  | pitch and periodicity tensors                            |
| Basic Pitch            | `basic_pitch.inference.predict(path)`                    | model output, MIDI object, note events                   |
| librosa                | `onset_strength`, `cross_similarity`, `dtw(subseq=True)` | onset envelope, similarity matrix, accumulated cost/path |
| Pydantic               | `BaseModel.model_json_schema(mode=...)`                  | JSON-serializable schema dictionary                      |

Anything deeper than these public seams requires a source-code pin and a small
adapter test. Do not import undocumented internals merely because an example
app does so.

## Anti-patterns

- Choosing a separator from a headline SDR that used another checkpoint,
  source vocabulary, or dataset.
- Treating an MIT code licence as the licence for downloaded weights or their
  training data.
- Auto-downloading mutable model assets during every experiment.
- Running all analysis through a web request or FastAPI `BackgroundTasks`.
- Treating key strength or softmax maximum as calibrated probability.
- Carrying the previous chord through an uncertain region.
- Calling silence and model uncertainty the same `N` value.
- Using guitar alone as the complete harmony source.
- Running a monophonic F0 tracker on rhythm guitar and presenting it as melody.
- Scoring abstention as an incorrect zero rather than reporting coverage.
- Evaluating recognizer accuracy on synthesized sine-wave triads.
- Adding cloud, a vector database, or a catalogue UI before core quality gates
  pass.

## Licence and maintenance summary

| Candidate              | Code/weight signal from primary source                                            | POC posture                                                |
| ---------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Demucs                 | MIT code; archived/unmaintained                                                   | safe baseline, avoid long-term lock-in                     |
| BS-RoFormer-Infer      | MIT package; registry has hashes; checkpoint terms still require separate capture | preferred candidate with provenance gate                   |
| python-audio-separator | MIT code; many community checkpoints                                              | optional adapter/harness only after pinning                |
| Beat This!             | MIT code and published weights                                                    | preferred beat candidate                                   |
| Basic Pitch            | Apache-2.0 code                                                                   | preferred note-event baseline                              |
| torchcrepe             | MIT code                                                                          | preferred F0 baseline                                      |
| ChordMini              | MIT code/repository                                                               | current chord candidate; verify checkpoint/data provenance |
| Chordino               | GPL-2.0                                                                           | baseline only                                              |
| Essentia               | AGPLv3 non-commercial path; separate commercial terms and model terms             | POC comparison only pending decision                       |
| librosa                | ISC                                                                               | preferred deterministic feature utility                    |
| mir_eval               | MIT                                                                               | preferred standard metric library                          |
| Mutagen                | GPL-2-or-later                                                                    | metadata fallback pending production review                |

This table is not legal advice. The POC manifest must retain licence URLs,
checkpoint URLs, hashes, and the date each was verified.

## Confidence and known gaps

Confidence is high in the modular architecture, the documented public APIs,
Demucs memory workaround, Beat This/torchcrepe/Basic Pitch roles, and the need
for high-precision abstention.

Confidence is medium in BS-RoFormer-SW as the winning separator and ChordMini as
the winning chord recognizer. Both are strong candidates, but neither has been
benchmarked on the target GPU and private recordings.

Open empirical gaps:

- exact track/excerpt corpus and trusted annotations;
- Windows/CUDA dependency resolution across all selected packages;
- BS-RoFormer-SW peak VRAM and runtime on the RTX 2060;
- actual guitar-stem bleed on dense, doubled, distorted guitar mixes;
- whether stem separation improves or hurts chord recognition per track;
- confidence calibration for key/chords/melodies;
- attainable guitar melody coverage;
- final similarity weights and human retrieval judgments;
- checkpoint-specific rights beyond the repository licence.

No additional architecture interview is needed to begin the POC harness. The
next human decision is simply which recordings and passages enter the corpus.
