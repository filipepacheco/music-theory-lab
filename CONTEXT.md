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
The single locally persisted and cloud-synchronized, user-owned correction
layer for one Biblioteca track, keyed by the same stable `source_sha256` as
its analysis artifacts. It contains only the editable chronological sections,
their automatic, fallback, or manual boundary origins, review state, schema
version, bar count, and timestamps; loading, migration, saving, and
single-user last-write-wins synchronization go through the saved-library
façade. An accepted [[structural-segmentation-result]] may seed a new document,
but regenerating analysis never replaces existing manual corrections.
Malformed cloud documents never replace valid local annotations.
_Avoid_: section analysis, inferred structure, arrangement

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

**Structural segmentation result**:
The immutable offline evidence for a Library track's neutral chronological
sections. It contains every `m = 2…10` hierarchy candidate from the baseline
and all 36 perturbation runs, plus stability measurements and the accepted or
fallback partition. It may seed a [[library-annotation-document]], but user
edits never rewrite it.
_Avoid_: annotation, verse/chorus detection, semantic sections

**Groove**:
The main drum pattern of a structure section: a configurable subdivision grid
over eight drum pieces, drawn on the section as a memory aid for what the
section's rhythm is. The supported grid resolutions cover quarter, eighth,
sixteenth, and thirty-second notes, plus eighth-note triplets and sixteenth-note
sextuplets, across one or two 4/4 measures. The groove has a base resolution,
and any beat can take its own (a triplet fill on beat 4 of a sixteenth-note
groove); such a beat keeps its hits in `beats`, not in the base rows. One groove
per section; toggling steps, changing resolution, and changing measure count
go through the `structureDocument` commands and persist in the section's JSON.
The section preview renders a standard-style percussion chart, one measure a
line, and keeps it in view while the groove editor is open. A [[drum-chart]] section has a groove too, worked out and not stored: the
section groove is the kick, snare, and hi-hat bar pattern that the section
repeats most (the first one on a tie). The section header draws it with the same
chart. "Beat" here means a beat of the measure, never the groove itself.
_Avoid_: beat (for the pattern), rhythm

**Fill**:
A bar of a [[drum-chart]] section whose kick, snare, or hi-hat pattern differs
from the section [[groove]]. The grid marks it. A bar that differs only in
other [[drum-piece]]s, or that has no kick, snare, or hi-hat, is not a fill.
_Avoid_: break, variation

**Drum piece**:
One element of the drum kit, and one row of a drum grid or a [[groove]] grid.
Both grids have the same eight: `bumbo` (kick), `caixa` (snare), `chimbal`
(hi-hat), `tomAgudo` (high tom), `tomMedio` (mid tom), `surdo` (floor tom),
and the two cymbals. The cymbals have two keys for the same pieces:
`pratoAtaque` (crash) and `pratoConducao` (ride) in a [[drum-chart]], `crash`
and `ride` in a [[groove]]. A drum-chart adds a ninth, `outros` (all other
[[general-midi]] numbers). A
piece can have an articulation: cross-stick on the snare; closed, open, or
pedal on the hi-hat; china or splash on the crash; bell on the ride. Each
piece list is a constant, so new pieces are an addition rather than a
redesign.
_Avoid_: drum, instrument, track

**General MIDI**:
The standard that gives each percussion sound a number on the percussion
channel of a MIDI file (36 is a kick, 38 a snare, 42 a closed hi-hat). A hit
of a [[drum-chart]] keeps its number, and its [[drum-piece]] and articulation
come from the number, so a better map of drum pieces needs no new import.
_Avoid_: GM number, drum note, pitch

**Ghost note**:
A very soft hit of a [[drum-chart]]. Its opposite is the accent, a hit that
stands out. For a Guitar Pro file the two come from the score, not from the
intensity of the hit: the intensity also follows the dynamic of the passage.
_Avoid_: soft note, quiet hit

**Bar root**:
The pitch class a bass chart's bar is heard over: the bass note on the
downbeat, or one held across the bar line. It is the root the bass line
implies, not a proven chord root — slash chords and pedal points read as their
bass note. A bar's chord type is named from the bass only when its played
third, fifth and seventh leave a single reading; otherwise only the root is
shown.
_Avoid_: chord, detected chord

**Degree lane**:
The row under the bass tab that names the degree of each note over the
[[bar-root]]. A double stop is one label. The lane has two levels: a label
that touches the label before it shows on the second level, and a label with
enough space stays on the first. When the bars are at their largest width and
a label still touches the label before it on its level, it moves right by the
missing distance. Below the largest width (a set line length) no label moves:
labels may touch, but each stays at its note, inside its bar.
_Avoid_: degree row, interval line

**Suggested key**:
A ranked guess at a bass chart's [[tonal-center]], from where the bass rests
(bars on the root, how sections start and end, V→I arrivals) rather than from
which notes it uses, since a [[scale-collection]] fits relative keys equally.
It is a default the user can replace, never a finding; degrees, functions and
cadences are always read relative to the key in use.
_Avoid_: detected key, the key

**Quiz session**:
One active run of music-theory questions, including its current question, answer result, score, streak, and replay state.
_Avoid_: quiz state, quiz screen

**Library song**:
One row of the Biblioteca list: the charts and [[analysed-track]]s that share
one [[song-key]]. It is a view calculated when the list loads; it merges and
deletes nothing, and each chart keeps its own settings and linked recording.
Its title and artist come from its best [[source]]: Guitar Pro, then
Rocksmith, then MIDI. A click opens the chart of the best source, or the
analysis when the song has only an analysed track.
_Avoid_: merged chart, song record

**Song key**:
The normalized title and artist that group charts into a [[library-song]]:
lower case, no accents, no punctuation, no text in brackets, and without
words that name the file ("bass", "tab", a version number). A chart without
an artist joins by title when only one song has that title. It is not a
musical key.
_Avoid_: key, tonal center

**Source**:
The file format of a chart: Rocksmith, MIDI, or Guitar Pro.
_Avoid_: origin, format

**Part**:
The instrument of a chart: bass or drums.
_Avoid_: track, instrument

**Analysed track**:
A recording that the offline pipeline analysed for chords, key, and tempo.
It appears in the Biblioteca list through its [[library-song]].
_Avoid_: library track, analysis

**Chart**:
One [[part]] of one imported file, bar by bar: a [[bass-chart]] or a
[[drum-chart]]. Its id comes from the hash of the file, so the same file
always gives the same chart. The two charts of one file share the metadata,
the bars, and the sections, and they use one table and one synchronization.
A change to a chart sends the full chart to the shared library again. A
deletion leaves a deletion record, so a device that was offline cannot bring
the chart back.
_Avoid_: song, tab, arrangement

**Bass chart**:
A [[chart]] of a bass line: notes with a string and a fret, and a tuning. It
has no part field, and its id is the hash of the file, so the charts from
before the drum charts stay valid.
_Avoid_: bass tab, bass line, Rocksmith chart

**Drum chart**:
A [[chart]] of a drum part: hits, each with its time, bar, position in the
bar, [[drum-piece]], articulation, intensity, and [[general-midi]] number,
and a mark for a [[ghost-note]] or an accent. It has no tuning and no frets.
Its part field is "drums", and its id is a hash of the file hash and the part
name. All percussion tracks of a file make one drum chart.
_Avoid_: drum tab, drum track, groove

**Line length**:
The number of bars in each line of a section of a [[chart]], from 1 to 16, or
"automatic" (the layout wraps the bars as they fit). The musician sets it for
a section, by its first bar, or for the whole song; a section with no choice
uses the song line length. A set number always holds: each line shows exactly
that many bars, and the layout never lowers it to a divisor. It lives in the
[[chart-settings]], so it shows on all devices. A new import starts automatic.
_Avoid_: bars per row, bars per line

**Chart settings**:
The synchronized view choices of one [[chart]]: the song line length, the
line length of each section (by its first bar), and the group override (a
[[song-key]] or "separate"). They are a record apart from the chart, so a
change sends no chart and does not restart playback. They use the model of
the charts: one shared library, no login, and the last write wins. They stay
after the deletion of their chart, on the device and in the cloud, and they
apply again when the same file returns.
_Avoid_: chart options, view state, preferences
