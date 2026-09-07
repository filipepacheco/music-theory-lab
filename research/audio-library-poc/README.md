# Audio library POC

This directory is the reproducible, offline harness for the Music Theory Lab
audio-library project. It validates a trusted evaluation corpus, hashes and
probes local audio, exports versioned JSON Schemas, exercises deterministic
stage orchestration, and provides concrete local stages for separation, beat,
key, chord, and experimental section analysis. Quality acceptance remains
unfinished.

The harness is deliberately separate from the React application. It runs local
inference stages but does not store data in a database or alter the existing
transcription feature. The static `public/library`
viewer is an explicit export of derived results; it is not authenticated private
storage and must never be used to publish originals, private annotations, or
private run artifacts.

One exception to "no HTTP API": `audio-library-intake` (see [Local intake
service](#local-intake-service)) accepts an audio upload and runs the four
publishable stages for it. It is a development convenience that binds
loopback, has no authentication, and is never deployed. The offline
`audio-library-poc` CLI is unchanged and still reaches the network only
through `fetch_checkpoints.py`.

## Requirements and setup

- Python 3.12
- [uv](https://docs.astral.sh/uv/)
- FFprobe from an FFmpeg installation for the `inspect` command

The project metadata supports `>=3.12,<3.13`, and Ruff targets Python 3.12.
Python 3.12 is required because safe Windows cache handling uses native
junction inspection. The local `.python-version` selects 3.12, and the verified
local setup uses Python 3.12.3.

From this directory in PowerShell, point uv at the already-installed Python
interpreter rather than asking uv to acquire one:

```powershell
$installedPython = (Get-Command python).Source
& $installedPython --version
uv sync --extra dev --python $installedPython
```

If `python` is not Python 3.12, replace `$installedPython` with the path printed
by your local Python 3.12 installation. After synchronization, all commands
below use executables from `.venv`.

Confirm FFprobe separately:

```powershell
ffprobe -version
```

FFprobe is invoked as an argument list without a shell. Its executable can be
overridden per inspection with `--ffprobe`.

### Optional inference dependencies

The `dev` extra above covers everything the offline harness needs. To run real
Phase 2 stem separation, add the `inference` extra:

```powershell
uv sync --extra dev --extra inference --python $installedPython
```

To run the local intake service on top of that, add the `server` extra:

```powershell
uv sync --extra dev --extra inference --extra server --python $installedPython
```

That installs `torch` and `torchaudio` from PyTorch's CUDA 12.4 wheel index
(pinned via `[tool.uv.sources]` in `pyproject.toml`), plus
`bs-roformer-infer==0.1.5` and `demucs==4.1.0`. Only Windows is resolved
(`[tool.uv].environments = ["sys_platform == 'win32'"]`) because Demucs'
macOS-x86_64 leg constrains torch to `<2.3`; widen that list if you ever
need to build on another platform.

The target machine has an NVIDIA GeForce RTX 2060 with 6 GiB of memory and
compute capability 7.5 according to `nvidia-smi`. This inventories available
hardware; it does not establish a compatible PyTorch build or measured model
performance. Verify the installed runtime before running an inference stage:

```powershell
.venv\Scripts\python.exe -c "import torch; print(torch.__version__, torch.cuda.is_available(), torch.cuda.get_device_name(0))"
```

Record the exact torch/CUDA version, the result of that command, end-to-end
elapsed time, inference time, and peak VRAM with each measured run. Choose
precision only after that compatibility and parity evidence exists.

## CLI

The installed entrypoint is `.venv\Scripts\audio-library-poc.exe`. The
equivalent module invocation is
`.venv\Scripts\python.exe -m audio_library_poc.cli`.

### Validate a corpus manifest

```powershell
.venv\Scripts\audio-library-poc.exe validate-corpus corpus.example.yaml
```

This validates the complete typed manifest and writes a stable JSON summary to
standard output. It does not require the referenced audio files to exist.

### Inspect local audio

Place private source files under the ignored `workspace` tree or reference
them from another private local location:

```powershell
.venv\Scripts\audio-library-poc.exe inspect workspace\originals\track-a.mp3 workspace\originals\track-b.mp3 --output reports\inspection.json
```

To select a different executable:

```powershell
.venv\Scripts\audio-library-poc.exe inspect workspace\originals\track-a.mp3 --output reports\inspection.json --ffprobe C:\tools\ffmpeg\bin\ffprobe.exe
```

The command streams SHA-256 hashing, probes each unique content hash once,
reports duplicates, and atomically replaces the output JSON. The report keeps
raw FFprobe tags and source paths, so treat it as private data.

### Export schemas

```powershell
.venv\Scripts\audio-library-poc.exe export-schemas --output schemas
```

The command exports validation and serialization schemas for each committed
contract. Repeating it must reproduce the files under `schemas` byte for byte.
There are currently 28 committed files: two schema modes for fourteen top-level
contracts, including `SeparationResult`, `CheckpointManifest`,
`BeatAnalysisResult`, `ChordAnalysisResult`, `KeyAnalysisResult`, and
`SectionAnalysisResult`.

## Synthetic Phase 2 separation validation

`SeparationResult` fixes the application vocabulary at exactly five stems:
`vocals`, `drums`, `bass`, `guitar`, and `other`. It records candidate and model
provenance, effective separator settings, candidate-native source mappings,
portable artifact filenames, per-signal facts, explicit tolerances, and the
reconstruction metric. A candidate-native `piano` source can map only to
`other`, never to `guitar`.

`Pcm16WaveSource` and `validate_separation_audio` provide dependency-free audio
validation for generated fixtures. They check sample rate, channel count,
frame and duration tolerances, finite and frame-aligned interleaved samples,
declared stream lengths, and relative-RMS reconstruction. Validation streams
bounded chunks from the source and five stems, retaining only
`O(chunk_frames * channels * 6)` samples rather than loading complete signals.

This reader is intentionally synthetic-only: it accepts uncompressed 16-bit
PCM WAV fixtures and rejects other encodings. General audio decoding (including
MP3 and production WAV variants), real BS-RoFormer/Demucs adapters, model
checkpoints, and separator execution remain deferred.

### Run the deterministic fake pipeline

The committed `pipeline.example.yaml` is directly executable:

```powershell
.venv\Scripts\audio-library-poc.exe run-fake --pipeline pipeline.example.yaml --workspace workspace --run-id phase-1-smoke --input-sha256 aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
```

Stages execute in manifest order. A successful stage's first published
artifact hash becomes the next stage's input hash. Repeating the same command
validates and reuses completed artifacts. Changing the input hash, normalized
config, implementation version, output schema version, model identifier or
model hash, or pipeline code revision creates a different cache identity.

Pause and cancellation are cooperative stage-boundary controls:

```powershell
.venv\Scripts\audio-library-poc.exe run-fake --pipeline pipeline.example.yaml --workspace workspace --run-id phase-1-paused --input-sha256 aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa --pause
.venv\Scripts\audio-library-poc.exe run-fake --pipeline pipeline.example.yaml --workspace workspace --run-id phase-1-paused --input-sha256 aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa --resume
.venv\Scripts\audio-library-poc.exe run-fake --pipeline pipeline.example.yaml --workspace workspace --run-id phase-1-cancelled --input-sha256 aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa --cancel
```

`--pause` or `--cancel` persists the request before execution, so the next
stage returns a typed `paused` or `cancelled` envelope without beginning an
attempt. `--resume` clears either request and continues from validated cached
results. Controls are not polled inside a running stage, and cancellation does
not delete already-published artifacts.

Expected command and validation failures are emitted as typed JSON on standard
error with a nonzero exit status and no traceback. A stage-level terminal or
retry-exhausted result exits with status 4 after writing its JSON summary.

### Run any registered pipeline

`run-fake` above always uses the built-in `FakeStage` executor, regardless of
the `stage_kind` a stage specifies. `run` dispatches each stage to the
executor registered for its `stage_kind`:

```powershell
.venv\Scripts\audio-library-poc.exe run --pipeline workspace\pipeline.local.yaml --workspace workspace --run-id phase-2-smoke --input-sha256 <source-audio-sha256>
```

The registered kinds are:

- `fake.deterministic` — the same `FakeStage` `run-fake` uses.
- `separator.bs_roformer` — BS-RoFormer six-stem inference adapter.
- `separator.demucs_htdemucs_6s` — Demucs `htdemucs_6s` inference adapter.
- `beat.beat_this` — Beat This! beat and downbeat analysis.
- `chord.chordmini_btc` — vendored ChordMini BTC chord analysis.
- `chord.chordmini_btc_baseline_evidence` — legacy BTC semantics with private
  frame evidence under a new identity.
- `chord.chordmini_btc_verified` — parity-fixed BTC candidate.
- `chord.chordmini_chordnet` — pinned-source ChordNet candidate.
- `key.hpcp` and `key.chord_root_profile` — independent key baselines.
- `section.librosa_segment` — experimental repeated-section clustering.

Both separator kinds validate their configuration and workspace-contained model
assets before lazy-loading their inference runtime. A checkpoint must be pinned
and hash-verified in the selected private manifest before an empirical run is
accepted; execution and listening evidence still do not establish a quality
winner.

Unknown stage kinds fail as `stage.unknown_kind` `FAILED_TERMINAL` — the
pipeline manifest is validated statically, but a missing executor is treated
like any other stage failure.

## Local intake service

Adding a track by hand means writing a manifest per stage, pasting the same
source path into each, pinning both checkpoint digests, inventing a run id,
running the CLI once per stage, and then running the sync script. The intake
service does all of that for one uploaded file.

```powershell
.venv\Scripts\audio-library-intake.exe --workspace workspace --public ..\..\public
```

`--public` is the React app's `public/` directory, **not** `public/library` --
the sync script appends `library` itself. Passing the deeper path is refused
with a message rather than silently publishing into `public/library/library`.

With the service running, `npm run dev` shows an extra "Analisar" module. Drop
in an `.mp3`, `.m4a`, `.wav`, `.flac` or `.ogg`, and the service:

1. validates the upload and writes it to `workspace/originals/<slug><ext>`,
2. writes `workspace/intake-<slug>.local.yaml` -- one manifest carrying all
   four publishable stages under one run id,
3. runs `beat.beat_this`, `chord.chordmini_btc`, `key.hpcp` and
   `section.librosa_segment` in order, stopping at the first failure that
   matters (a `section` failure is survivable; the other three are not),
4. runs `sync_workspace_to_public.py --copy-audio`, so the viewer gets a
   player as well as a chord chart.

The copied source lands at `public/library/tracks/<prefix>/source<ext>`, which
`.gitignore` covers -- originals stay on the machine. A measured run of a
3'06" track on the RTX 2060 took about 17 seconds for all four stages.

Endpoints, all under `/intake` (the Vite dev server proxies that prefix to
port 8756; `/api` already belongs to the deployed sync endpoints):

- `GET /intake/health` -- checkpoint presence, device, resolved library root.
- `POST /intake/tracks` -- multipart `file`, `title`, `artist`, `segment_count`.
- `GET /intake/jobs` and `GET /intake/jobs/{id}` -- queue and per-stage status.

One job runs at a time; there is one GPU. The job list is in memory, so a
restart forgets it -- but not the work, since completed stages stay in the
workspace cache and re-uploading the same file under the same title replays as
cache hits.

The "Analisar" module is hidden from production builds and nothing proxies
`/intake` there. That is deliberate: the deployed site is public, and a working
upload box on it would let anyone push audio into a public static export.

## Model checkpoints

Phase 2 real inference needs pinned model checkpoints on disk. Both bytes and
manifests stay local to the workspace.

- `checkpoints.example.yaml` (committed) documents the manifest schema with
  placeholder URLs. Copy it to a private working file:

  ```powershell
  Copy-Item checkpoints.example.yaml workspace\checkpoints.local.yaml
  ```

  Replace the vendor URLs with the ones you actually intend to pin. Leave
  `expected_sha256` set to `null` on the very first fetch — the script prints
  the observed digest so you can paste it back and enforce it afterwards.
- `scripts/fetch_checkpoints.py` downloads pinned checkpoints into
  `workspace/models/` (ignored by Git). Downloads stream through a `.part`
  staging file and are only renamed into place after the digest matches:

  ```powershell
  .venv\Scripts\python.exe scripts\fetch_checkpoints.py --manifest workspace\checkpoints.local.yaml --target workspace\models
  ```

  The script skips checkpoints that are already present with the expected
  hash, refuses to overwrite an existing file with a mismatching hash, and
  emits typed JSON errors on standard error with exit status 1.
- Pipeline manifests reference the pinned checkpoint through
  `model_identifier` and `model_sha256` on the stage specification so the
  cache invalidates the moment either changes. The bridge rejects any
  `SeparationResult` whose recorded provenance does not match the committed
  `StageIdentity`.

The `audio-library-poc` CLI is intentionally offline. `fetch_checkpoints.py`
is the only entry point that reaches the network, and only when invoked
explicitly.

## Workspace layout

Runtime state is local and ignored by Git except for placeholders:

```text
workspace/
  originals/                         # optional private local input files
  pipeline.local.yaml                # optional private runnable manifest
  runs/<run-id>/
    control.json
    events.jsonl
    stages/<stage-kind>/
      states/<cache-key>.json
      results/<cache-key>.json
      attempts/<cache-key>/<attempt>.json
      artifacts/<cache-key>/fake-result.json
      staging/<cache-key>/
reports/                              # generated private reports
schemas/                              # committed public contracts
```

JSON file replacement is atomic, and every stage artifact bundle is published
with one same-filesystem directory rename. Related result, attempt, and state
JSON files are still not one filesystem transaction: the canonical success or
failure result is the commit marker. Recovery uses every committed attempt
result to reconstruct a missing attempt envelope and state before deciding
whether to return or retry.

Executors write complete files into their exact attempt staging namespace and
return only a strict descriptor bundle, never artifact bytes. The orchestrator
rejects missing, undeclared, duplicate, non-regular, nested, symlink, or junction
entries; stream-hashes and sizes every declared file; then renames the entire
staging directory into the cache-key artifact namespace. It verifies the
published files immediately before committing the result. Every cache hit also
requires an exact case-insensitive match between the committed manifest and all
directory entries, then rechecks every size and hash. Cache cleanup applies the
same lexical, reparse-point, and workspace-containment checks.

Before bundle publication, existing staging and destination ancestor identities
are snapshotted and checked immediately before and after the rename. Cleanup
first renames only the exact derived namespace to a random quarantine name in
the same parent, verifies that the moved entry retained its identity, and then
removes entries without following symlinks or junctions. This is a single-user
local POC: no other process may concurrently rewrite the ignored workspace
tree. Windows does not provide the handle-relative filesystem operations needed
to promise safety against a hostile process that can race every path check.

A crash before the directory rename leaves staging only. A crash after the
rename but before the canonical result leaves a complete but uncommitted
artifact bundle. On recovery, the orchestrator removes only that cache key's
artifact and staging namespaces before retrying or publishing
`stage.attempts_exhausted`. Events, controls, other cache keys, originals, and
unrelated workspace data are preserved. The uncommitted execution still
consumes its attempt number. Pause and cancellation control envelopes are not
stage-attempt results and do not have attempt history. Partial or undeclared
staging files are never accepted as completed results.

`StageResultEnvelope` uses schema version `2.0.0`. Older local POC cache
envelopes, including version `1.1.0`, are automatically invalidated and rebuilt
on the next run. Invalidation removes only the derived files for that stage
cache key (state, result, attempts, staging, and artifacts); it never deletes
original audio or other user data.

## Corpus handoff

When the evaluation tracks are selected, keep the committed example unchanged
and create a private working copy:

```powershell
Copy-Item corpus.example.yaml workspace\corpus.local.yaml
```

Replace the fictional path and zero hash with the local source path and its
real SHA-256, then add trusted excerpt annotations. The current
`validate-corpus` command validates manifest data only; it does not resolve or
inspect referenced files. The `inspect` command receives source paths
explicitly and does not read them from a corpus manifest. `resolve_source_path`
is a helper reserved for future manifest-driven processing, where relative
paths can be resolved from the manifest's directory. Do not commit the working
copy or its audio.

## Reproducibility and verification

Run checks sequentially through the existing environment:

```powershell
.venv\Scripts\python.exe -m pytest
.venv\Scripts\ruff.exe check .
.venv\Scripts\ruff.exe format --check .
```

For a manual schema reproduction check, export into a new temporary directory
and compare hashes by filename:

```powershell
$schemaCheck = Join-Path $env:TEMP audio-library-poc-schema-check
New-Item -ItemType Directory -Force $schemaCheck
.venv\Scripts\audio-library-poc.exe export-schemas --output $schemaCheck
Get-ChildItem schemas\*.json | Sort-Object Name | Get-FileHash -Algorithm SHA256
Get-ChildItem "$schemaCheck\*.json" | Sort-Object Name | Get-FileHash -Algorithm SHA256
```

The two ordered hash lists must match. `tests/test_schemas.py` enforces the same
byte-level requirement automatically.

## Copyright and privacy

- Use only recordings you own or are authorized to analyze.
- Never commit MP3/WAV files, model outputs, private reports, absolute personal
  paths, embedded private tags, credentials, or provider tokens.
- Keep sources, copied manifests, run state, and generated reports under the
  ignored `workspace` and `reports` directories.
- Commit only code, fictional examples, versioned schemas, and anonymous
  aggregate measurements that are safe to share.

## Remaining POC work

The separation adapters, `SeparatorStageExecutor` bridge, stage-kind dispatcher,
`run` CLI subcommand, and hash-verified checkpoint fetcher have landed. The
remaining work is to establish reproducible evidence for the selected runs,
not to claim a separator winner merely because an adapter executes.

Still open: retain selected checkpoint source/terms/hashes in the private
manifest and dependency record, run GPU/VRAM measurements, and produce the
listening report that decides between candidates. Phase 1 proved
reproducibility, metadata boundaries, cache identity, resume behavior, and
safe local orchestration; the seam described above extends those guarantees
across the Phase 2 boundary without claiming a quality result.

Beat, key, BTC chord, section, and separation executors are registered. Their
presence is not a quality result: each evaluation must
select hash-verified artifacts through a frozen manifest, verify annotation and
recording alignment, and report raw predictions separately from accepted
product output. See `research/audio-library-harmony-dependencies.md` and
`design-plans/audio-library-quality-handoff.md` before changing the chord path.

For the evaluation contract, copy `evaluation.example.yaml` to the ignored
`workspace/evaluation.local.yaml`. Bind each recording to its `corpus.local.yaml`
entry, retain the original and annotation hashes, select each successful
envelope and declared artifact explicitly, and document any master-duration
difference or annotation offset. A quarantined reference is retained for audit
but excluded from scores; it does not suppress another valid reference for the
same recording. Corpus sources may be absolute external paths, but only the
private corpus manifest names them.

Render the historical raw-label diagnostic only from that frozen selection:

```powershell
$env:PYTHONPATH = 'src'
.venv\Scripts\python.exe scripts\phase3_evaluation_report.py `
  --workspace workspace `
  --manifest workspace\evaluation.local.yaml `
  --out workspace\reports\phase1_frozen_raw.md
```

The report validates original bytes, raw annotations and overlays, successful
envelopes, artifact size/hash/schema, source hash, and typed provenance before
reading a score. It never searches `runs/` for a replacement result. The pilot
split is recording-level but already inspected, so neither label is a blind
holdout or an acceptance result.

Render the separate normalized Biblioteca-output report as both private JSON
and Markdown. It reports uncalibrated vocabulary-filtered acceptance only;
confidence thresholds remain a later calibration decision. `N` is scored as
no-chord and `X` remains unknown, while unsupported reference qualities are
shown as exclusions. Both output paths must stay under `workspace/reports`.
The retained raw diagnostic is explicitly post-segment-smoothing. The
baseline-evidence and verified chord identities retain private pre- and
post-smoothing frame evidence. Existing public sync/index data, including its consumer confidence
field, is inspection drift rather than this frozen pilot and is unchanged here.

```powershell
$env:PYTHONPATH = 'src'
.venv\Scripts\python.exe scripts\product_evaluation_report.py `
  --workspace workspace `
  --manifest workspace\evaluation.local.yaml `
  --markdown-out workspace\reports\phase2_product.md `
  --json-out workspace\reports\phase2_product.json
```

The reports are private evaluation artifacts. Do not run the public-library
sync as part of evaluation: its public index and selected runs are inspection
data and can differ from this four-recording frozen pilot.
