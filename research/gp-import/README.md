# GP Import Research

Standalone research script investigating whether a Guitar Pro (`.gp`) tab file can be mechanically simplified into a chord progression per bar.

This lives in the `music-theory-lab` repo for convenience but is independent from the app — output does not feed into the React frontend. See the [wayfinder map](https://github.com/filipepacheco/music-theory-lab/issues/2) for the full effort and its open tickets.

## Goal

One question, in stages: **given a real `.gp` file, can we extract what's playing in each bar, and from that, a best-effort chord label?**

Both stages are done:
- `parse.ts` walks a GP7 file's internal structure (`MasterBars -> Bars -> Voices -> Beats -> Notes`) and produces, per bar and per track, the set of MIDI pitches sounding in that bar.
- `chords.ts` takes that and produces an actual chord label per bar — resolves **89%** of the sample file's 206 bars to a clean, recognizable chord (e.g. bars 13-37 resolve to a clean repeating `C#maj -> Bmaj -> G#min -> D#min` progression), 9% as `unclear`, and 2% as "no chord data" (both source tracks silent). See [issue #6](https://github.com/filipepacheco/music-theory-lab/issues/6) for the full algorithm design and the real-data evidence behind each choice.

## Scope

- GP**7** format only (`.gp` as a zip archive containing `Content/score.gpif` XML). Legacy `.gp3`/`.gp4`/`.gp5` binary format is explicitly out of scope for this map (deferred, see the map's "Out of scope" section).
- Node/TypeScript, run via [`tsx`](https://github.com/privatenumber/tsx) — no build step.
- Not integrated into the app. A separate future effort if this proves out.

## What it does

**`gpif.ts`** — shared parsing, used by both scripts below:
1. Unzips the `.gp` file and parses `Content/score.gpif`.
2. Checks for a metadata fast-path: does any track carry a `ChordCollection`/`DiagramCollection` dictionary with named chords, and do any beats reference one directly? (See [`CHORD-METADATA-FINDINGS.md`](CHORD-METADATA-FINDINGS.md) for how this is structured when present — confirmed via alphaTab's source, but author-dependent, not guaranteed. Not present in the sample file.)
3. Falls back to note-based extraction: walks every `MasterBar`, resolves each track's `Bar -> Voice(s) -> Beat(s) -> Note(s)`, and collects the MIDI pitches sounding in that bar.

**`parse.ts`** — prints a readable sample and writes the full per-bar, per-track pitch data to `outputs/<filename>.bars.json`.

**`chords.ts`** — the actual chord-per-bar output. Harmony track (Rhythm Guitar) and root track (Electric Bass) hardcoded by name for this sample file (see [#5](https://github.com/filipepacheco/music-theory-lab/issues/5)). Matches each bar's pitch-class set exactly against a fixed 12-chord vocabulary (maj, min, dim, aug, 5, maj7, min7, dom7, sus2, sus4, add9, minadd9) at any of 12 roots — no fuzzy/subset fallback, since that was tested and shown to produce mostly-spurious matches (see [#6](https://github.com/filipepacheco/music-theory-lab/issues/6)). Genuinely ambiguous bars (e.g. `{C#,F#,B}` = both F#sus4 and Bsus2) get tiebroken by the root track's lowest note; bars that don't resolve at all are labeled `unclear`; bars where both tracks are silent are labeled "no chord data." Writes `outputs/<filename>.chords.json`.

## Setup

```bash
cd research/gp-import
npm install
```

## Run

```bash
npm run parse                          # per-bar, per-track raw pitch data
npm run chords                         # per-bar chord labels
npm run chords -- /path/to/other.gp    # or point either at any other GP7 file
```

`outputs/` is gitignored — it holds real run output, not committed fixtures.

## Findings so far

- Parsing works end-to-end against a real, non-trivial file (206 bars, 5 tracks, no chord metadata at all — pure note-based extraction required).
- Every `Note` carries an explicit absolute MIDI pitch — no string/fret/tuning decoding needed.
- Real chord voicings are mostly clean (e.g. bar 9's Rhythm Guitar resolves to exactly `{G#, B, D#, F#}` = G#m7), but not always — bar 7 resolves to `{B, F#, C#}`, a power-chord/add9-style voicing with no 3rd. Chord-matching (ticket [#6](https://github.com/filipepacheco/music-theory-lab/issues/6)) needs to handle both.
- Bars are not evenly populated across tracks — some bars have notes in Bass but not Rhythm Guitar, or vice versa. Relevant to the still-open track-sourcing-strategy ticket ([#5](https://github.com/filipepacheco/music-theory-lab/issues/5)).

## Structure

```
research/gp-import/
  README.md
  CHORD-METADATA-FINDINGS.md   # findings for issue #4
  package.json
  gpif.ts                      # shared parsing (issue #3, #4)
  parse.ts                     # raw pitch dump (issue #3)
  chords.ts                    # chord-per-bar output (issue #5, #6)
  outputs/                     # run output (gitignored)
```
