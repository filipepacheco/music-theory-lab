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

**Structure document**:
The editable song arrangement made of ordered sections and their bars. Use this term for the arrangement being recorded, reorganized, or exported.
_Avoid_: structure state, arrangement data

**Quiz session**:
One active run of music-theory questions, including its current question, answer result, score, streak, and replay state.
_Avoid_: quiz state, quiz screen
