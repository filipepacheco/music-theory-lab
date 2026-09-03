# Audio library and musical-similarity discovery brief

Status: product discovery complete. Technical recommendations and implementation
phases live in `design-plans/audio-library-architecture.md`; evidence for the
model/tool shortlist lives in `research/audio-analysis-pipeline-options.md`.
This is a planning document, not an implementation specification.

## Product outcome

Build a private, single-user library of uploaded MP3 recordings. Each library
entry is catalogued, analysed for musical content, and comparable with other
entries by harmony, melody, and groove. The product should support both music
theory study and discovery of related songs.

The first proof of concept is an offline research pipeline. It must establish
that the analysis is accurate enough before any React, cloud, or production
queue work begins.

## Working domain terms

- **Library track**: one original studio recording imported from an MP3. The
  initial scope does not model remasters, live versions, or a separate abstract
  composition.
- **Stem**: a derived source-separated audio signal. The initial contract
  permits `vocals`, `drums`, `bass`, `guitar`, and residual `other` stems.
- **Analysis run**: one versioned execution of the processing pipeline against
  a library track.
- **Canonical analysis**: the currently selected output used for browsing,
  search, and similarity. Reprocessing replaces it completely, including any
  corrections made to the previous run.

`Library track` must remain distinct from the existing `Song` type and
**transcription document**. Generated analysis will not create or update a
transcription document.

## Fixed product decisions

### Ownership and access

- The product will remain exclusive to one user.
- Import and initial processing may run only on the main Windows computer.
- Processed analysis should eventually be browsable from an iPad.
- The iPad experience may remain read-only.
- Remote/offline support has no initial requirement.
- Authentication is deferred, so remote sync is also deferred until private
  access is designed. The current globally visible song endpoints are not an
  acceptable boundary for this feature.

### Catalogue metadata

- Support batch imports.
- Start processing immediately; metadata correction does not gate analysis.
- Initial metadata comes from embedded MP3 tags and local filename inference.
- Artist, album, year, and title remain editable.
- Genre is represented by multiple editable tags.
- Online fingerprint and metadata enrichment are deferred.
- The library supports both artist/album grouping and a flat searchable,
  filterable catalogue.
- Theory-aware search is required in addition to ordinary metadata search.

### Audio retention

- The original MP3 is the permanent source of truth.
- Analysis data is permanent.
- Stems are regenerable cache entries, not permanent records.
- Temporary decoded PCM/WAV data may be deleted after a stage completes.
- The POC keeps its small corpus locally. Local storage should initially remain
  near 10 GB; capacity monitoring is preferable to premature cloud storage.

### Processing policy

- The POC may use Python, FFmpeg, downloaded model weights, and the RTX 2060
  GPU.
- A local worker may continue running after the browser closes.
- Batch jobs may run overnight or across several days.
- The eventual queue needs pause, resume, retry, cancellation, and priority.
- Pipeline stages and their outputs are independently versioned.
- Upgraded stages mark affected analyses as outdated; reprocessing is selected
  manually or in a user-selected batch.
- Prefer local open-source processing. Low-confidence tracks may be submitted
  manually to a paid or specialised provider later.
- A provider-neutral processing contract should allow local and cloud workers
  without changing the musical output schema.

## Initial musical-analysis contract

### Track-level analysis

- One global tonal centre/key for the recording.
- One primary major/minor scale result.
- Alternatives and confidence for ambiguous key/scale results.
- Tonal centre and scale collection are separate claims; note membership alone
  must not be treated as proof of a tonal centre.
- Modes, pentatonic scales, and blues scales are later enhancements.

### Harmony

- Timestamped major/minor chord regions plus an explicit unknown/no-chord
  state.
- Prefer abstention or a gap to a low-confidence guess.
- Derive key-independent harmonic degrees/functions for comparison.
- Use evidence from the full mix and relevant stems; do not assume guitar alone
  carries the harmony.

### Melody

- Separate vocal, bass, and guitar representations.
- Multiple guitars may remain combined for the initial scope.
- Store ordered pitch and interval contours; exact note duration is not a
  user-facing requirement.
- Preserve enough internal timing to align observations and passages.
- Derive an additional combined melody score without discarding the
  instrument-specific scores.

### Rhythm and groove

- Detect the beat grid needed to normalize rhythm.
- Compare groove independently of absolute tempo.
- Automatic section labels, bar structure, and time-signature analysis are not
  required for the first POC.

## Similarity semantics

- Harmony is transposition-invariant: the same functional progression in
  another key is similar.
- Melody is transposition- and octave-invariant: compare intervals and contour.
- Groove is tempo-invariant: compare beat-normalized rhythmic structure.
- Present one overall score plus separate harmony, melody, and groove scores.
- Initial component weights are fixed.
- Opening a library track shows ranked similar tracks and an explanation of the
  contributing dimensions.
- Support passage matches, not only whole-track similarity. Use beat-normalized
  windows initially rather than depending on automatic section detection.

## Offline POC boundary

The first POC includes:

1. Batch MP3 discovery and embedded metadata extraction.
2. Local GPU source separation into the agreed stem contract.
3. Global major/minor key analysis with alternatives and confidence.
4. High-precision major/minor chord regions with abstention.
5. Vocal, bass, and guitar pitch/interval contours.
6. Beat-normalized drum/groove features.
7. Whole-track and passage-level similarity.
8. Stable machine-readable JSON outputs and human-readable evaluation reports.

The POC explicitly excludes React integration, cloud execution, cloud object
storage, authentication, remote sync, and transcription-document integration.

## Evaluation ladder

1. **Smoke test**: three songs, using several verified 30–60 second excerpts,
   to prove every selected tool runs and emits the agreed contracts.
2. **Candidate bake-off**: ten songs with three representative excerpts each,
   including a sparse/clean passage, a dense passage, and an instrumental or
   solo passage.
3. **Full-track validation**: three to five complete songs to expose intros,
   transitions, silence, tempo drift, and long-form failures.

The corpus should emphasize original studio recordings representative of Led
Zeppelin, Pink Floyd, and Radiohead. Exact tracks are deliberately unresolved.
Trusted chord charts, Guitar Pro/MIDI files, and manual verification may supply
ground truth. Synthetic sine-wave audio is not a valid quality benchmark for
the recognizers under consideration; the existing experiment established only
that its pipeline executed.

Each capability receives an independent integration gate. Failure of guitar
melody extraction must not block successful key, harmony, or groove work.

## Deferred decisions

- Exact smoke-test and bake-off recordings.
- Winning models/configurations and final pass thresholds after the proposed
  candidates and provisional gates are measured.
- Durable local queue implementation.
- Production database and object-storage providers.
- Cloud GPU versus specialised music-analysis providers.
- Authentication mechanism.
- Analysis JSON schema and pipeline compatibility rules.
- Final similarity weights and whether measured search latency ever requires
  an index beyond direct cached comparison.
- Visual treatment of chord regions, melodic contours, confidence, and matched
  passages.

## Existing repository evidence

- `research/chord-recognition/` contains a standalone madmom chord-recognition
  experiment and should remain historical evidence rather than production code.
- Its synthetic progression proved that the old pipeline executes, but the
  result was musically unusable because the test signal was outside the model's
  training distribution.
- The next experiment must use real recordings and trusted annotations.
- The application already has local SQLite-in-IndexedDB persistence, Turso
  sync, editable transcription documents, and pure music-theory helpers. None
  of these currently provides object storage, a durable job queue, or an audio
  ML runtime.
