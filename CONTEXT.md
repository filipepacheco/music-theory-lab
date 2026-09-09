# Domain Glossary

Terms specific to the [.gp file → chord progression effort](https://github.com/filipepacheco/music-theory-lab/issues/2). The browser importer currently supports GP7 `.gp` files and loads its results into the transcription module.

## Harmony track

The track in a `.gp` file's data that carries full chord content per bar — always polyphonic (multiple simultaneous pitches), never a single note. Source of chord _quality_ (major/minor/7th/etc). Identified by literal track name for v1 (e.g. `"Rhythm Guitar - Acoustic Guitar (steel)"`); no structural auto-detection yet. See [Decide track-sourcing strategy for chord extraction](https://github.com/filipepacheco/music-theory-lab/issues/5).

## Root track

The track providing a bass/root anchor per bar — often monophonic or near-monophonic (frequently a single note). Used alongside the harmony track, not merely as a gap-filler. Cannot alone determine chord quality. Identified by literal track name for v1 (e.g. `"Electric Bass (finger)"`).

## Scale collection

The unordered set of pitch classes a passage draws on (e.g. the seven notes `F# G# A# B C# D# E#`). **Not** a key: every mode of a collection shares its notes, so establishing that chords fit a collection says nothing about which note is home. Use this term whenever the evidence is only note-membership.

## Tonal center

The note that functions as home/resolution. Distinct from [[scale-collection]] and not derivable from it — determining it requires characteristic-note analysis (e.g. #4 vs 4 to separate Lydian from Ionian) or a human ear. Chord frequency is a signal, not proof: a candidate tonic appearing in 3% of bars is evidence _against_ it.

## No chord data

The explicit output label for a bar where **both** the harmony track and root track are silent. Not a fallback chain to other tracks; just an honest "nothing to work with here." Distinct from an [[unclear-bar]], where notes _are_ present but match no chord template.

## Unclear bar

A bar whose pitch-class set matches no chord template exactly, or matches several with no root-track note to break the tie. Carries **no** chord label at all — the no-fuzzy-fallback decision on [Decide chord-matching algorithm approach for ambiguous voicings](https://github.com/filipepacheco/music-theory-lab/issues/6) ruled out best-effort guessing as overfitting. Distinct from [[no-chord-data]]: an unclear bar has notes but no name for them.

## GP import

The browser transcription flow accepts GP7 `.gp` files, lets the user choose the harmony and root tracks, and maps each parsed bar into one editable `SongSection`. Resolved chords become confident chromatic steps; unclear and silent bars remain visible as uncertain steps for review. The first resolved chord supplies a reference root for playback, not a proven tonal center.

## Application concepts

**Library analysis artifact**:
An immutable offline-analysis JSON file for one Biblioteca track, identified by
the track's stable `source_sha256`. It may suggest structural boundaries, but
its bytes are never rewritten by a correction in the app.
_Avoid_: editable analysis, Library state

**Library annotation document**:
The single locally persisted, user-owned correction layer for one Biblioteca
track, keyed by the same stable `source_sha256` as its analysis artifacts. It
contains only the editable chronological sections; loading, migration, and
saving go through the saved-library façade.
_Avoid_: section analysis, arrangement

**Library section**:
A neutral-named, non-empty half-open range of bar indexes in a
[[library-annotation-document]]. Its start is inclusive and its end is
exclusive. The ordered section list must cover every bar exactly once, without
gaps, overlaps, or reordering. A track without accepted automatic boundaries
starts with one full-track section named `Parte 1`.
_Avoid_: verse, chorus, inferred form

**Library boundary**:
The shared bar edge between two adjacent [[library-section]] ranges. Moving it
left or right transfers exactly one bar to the neighboring section; splitting
adds one at the selected bar and merging removes one. Edits at a track edge or
ones that would leave an empty section are invalid.
_Avoid_: drag handle for reordering, timestamp boundary

**Structure document**:
The editable song arrangement made of ordered sections and their bars. Use this term for the arrangement being recorded, reorganized, or exported.
_Avoid_: structure state, arrangement data

**Transcription document**:
The working song being transcribed or reviewed — its ordered sections, the
steps inside each section, and the active section index. The transcription
module's counterpart of the [[structure-document]]; every mutation goes through
the `transcriptionDocument` module. Step lists also share the cap-and-clamp
rules of the progression builder.
_Avoid_: song state, transcription screen

**Beat-input quality decision**:
The immutable, versioned offline artifact that decides whether a detected beat
grid is eligible for automatic Biblioteca section inference. It binds the
exact beat result and analyzer identity to a semantic gate version, hashed
configuration, calibration ID, measurements, diagnostics, and typed fatal
reasons. A valid grid still cannot publish sections until its held-out
calibration passes the confidence-bound targets; invalid or uncalibrated input
exports one neutral, editable full-track section marked for review.
_Avoid_: beat confidence, successful detection

**Groove**:
The main drum pattern of a structure section: a configurable subdivision grid
over three drum pieces, drawn on the section as a memory aid for what the
section's rhythm is. The supported grid resolutions cover quarter, eighth,
sixteenth, and thirty-second notes across one or two 4/4 measures. One groove
per section; toggling steps, changing resolution, and changing measure count
go through the `structureDocument` commands and persist in the section's JSON.
The section preview renders a compact standard-style percussion chart.
_Avoid_: beat, rhythm

**Drum piece**:
One row of the [[groove]] grid: `bumbo` (kick), `caixa` (snare), or `chimbal`
(hi-hat). The piece list is a constant, so new pieces are an addition rather
than a redesign.
_Avoid_: drum, instrument, track

**Quiz session**:
One active run of music-theory questions, including its current question, answer result, score, streak, and replay state.
_Avoid_: quiz state, quiz screen
