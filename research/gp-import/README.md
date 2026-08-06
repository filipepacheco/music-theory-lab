# GP Import Research

Standalone research script investigating whether a Guitar Pro (`.gp`) tab file can be mechanically simplified into a chord progression per bar.

This lives in the `music-theory-lab` repo for convenience but is independent from the app — output does not feed into the React frontend. See the [wayfinder map](https://github.com/filipepacheco/music-theory-lab/issues/2) for the full effort and its open tickets.

## Goal

One question, in stages: **given a real `.gp` file, can we extract what's playing in each bar, and from that, a best-effort chord label?**

This script answers the first stage only: parse + group. It walks a GP7 file's internal structure (`MasterBars -> Bars -> Voices -> Beats -> Notes`) and produces, per bar and per track, the set of MIDI pitches sounding in that bar. No chord-matching yet — that's a separate, still-open ticket ([#6](https://github.com/filipepacheco/music-theory-lab/issues/6)) that depends on seeing what this real data actually looks like.

## Scope

- GP**7** format only (`.gp` as a zip archive containing `Content/score.gpif` XML). Legacy `.gp3`/`.gp4`/`.gp5` binary format is explicitly out of scope for this map (deferred, see the map's "Out of scope" section).
- Node/TypeScript, run via [`tsx`](https://github.com/privatenumber/tsx) — no build step.
- Not integrated into the app. A separate future effort if this proves out.

## What it does

1. Unzips the `.gp` file and parses `Content/score.gpif`.
2. Checks for a metadata fast-path first: does any track carry a `ChordCollection`/`DiagramCollection` dictionary with named chords, and do any beats reference one directly? (See [`CHORD-METADATA-FINDINGS.md`](CHORD-METADATA-FINDINGS.md) for how this is structured when present — confirmed via alphaTab's source, but author-dependent, not guaranteed.)
3. Falls back to note-based extraction: walks every `MasterBar`, resolves each track's `Bar -> Voice(s) -> Beat(s) -> Note(s)`, and collects the MIDI pitches sounding in that bar.
4. Prints a readable sample to the console and writes the full per-bar, per-track result to `outputs/<filename>.bars.json`.

## Setup

```bash
cd research/gp-import
npm install
```

## Run

```bash
npm run parse                          # defaults to ~/Downloads/Resenha_do_arrocha_-_J_ESKINE.gp
npm run parse -- /path/to/other.gp     # or point it at any other GP7 file
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
  parse.ts                     # the script
  outputs/                     # run output (gitignored)
```
