# Audio library POC

This directory is the reproducible, offline harness for the Music Theory Lab
audio-library project. It validates a trusted evaluation corpus, hashes and
probes local audio, exports versioned JSON Schemas, exercises deterministic
stage orchestration, and defines the first track-independent Phase 2 stem
contracts without downloading model weights.

The harness is deliberately separate from the React application. It does not
yet run a real separator, infer musical content, provide an HTTP API, store data
in a database, upload audio, or alter the existing transcription feature.

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
There are currently 12 committed files: two schema modes for six top-level
contracts, including `SeparationResult`.

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

## Remaining Phase 2 work

Real stem separation is intentionally absent. BS-RoFormer/Demucs adapters,
model checkpoints, GPU/VRAM measurements, general-file validation, listening
reports, and separator selection still require later Phase 2 slices. Phase 1
proved reproducibility, metadata boundaries, cache identity, resume behavior,
and safe local orchestration. The generic multi-file staged-artifact seam and
synthetic five-stem validation contract are now prepared without claiming that
either real separator runs.
