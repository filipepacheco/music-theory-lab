# Electric-bass samples for the native fretboard

Research for [Select attributed electric-bass samples for the native
fretboard](https://github.com/filipepacheco/music-theory-lab/issues/33).

## Decision

Bundle an app-specific, lossy derivative of **Karoryfer Growlybass**, starting
with ten sustained `f`, round-robin-1 anchors from `e2` through `gb4`, mapped
one written octave down to sounding pitches E1 through F♯3. Tone.js can pitch
shift the nearest anchor for the intervening notes, including the fretboard's
top G3.

Growlybass is the best source because its own repository contains the CC0 1.0
legal text, identifies Karoryfer Lecolds as the 2014 copyright holder, and
explicitly says commercial and non-commercial use is royalty-free. Its README
also says the instrument is a directly recorded Squier Jazz Bass in regular
EADG tuning, with the low E additionally sampled down to C♯
([README at the pinned revision](https://github.com/sfzinstruments/karoryfer.growlybass/blob/4f483268fc66b5a6d5781d421c0d11b8d08d3fc6/readme.txt),
[CC0 text](https://github.com/sfzinstruments/karoryfer.growlybass/blob/4f483268fc66b5a6d5781d421c0d11b8d08d3fc6/LICENSE)).
CC0 does not require attribution, but the app should still credit it:

> Growlybass by Karoryfer Lecolds (2014), dedicated to the public domain under
> CC0 1.0. Selected and converted for Music Theory Lab.

Link both the pinned source revision and the CC0 deed from the app's notices.
State the conversion format and any editing once those are fixed. Do not imply
that Karoryfer endorses the app.

This is a **source-collection decision**, not approval to copy the whole
library into the production bundle. The curated derivative should be produced
reproducibly from the pinned commit and reviewed by ear before shipping.

## Fit with the application

The current `BassNeck` models a standard four-string E1/A1/D2/G2 instrument
through fret 12, so its sounding span is E1–G3
([`BassNeck.tsx`](../src/components/instruments/BassNeck.tsx)). The current
`SamplerPreset` is only a map from pitch to one URL, and `playNote` sends a
single note and velocity-less duration to `Tone.Sampler`; every sampler preset
is instantiated eagerly at module load
([`tonePresets.ts`](../src/constants/tonePresets.ts),
[`playbackEngine.ts`](../src/services/playbackEngine.ts)). The locked Tone.js
version is 15.1.22.

Tone's sampler explicitly maps scientific note names or MIDI pitches to URLs
and repitches the closest supplied sample when a requested pitch is absent
([Tone.js `Sampler` source](https://github.com/Tonejs/Tone.js/blob/dev/Tone/instrument/Sampler.ts#L35-L49),
[closest-sample implementation](https://github.com/Tonejs/Tone.js/blob/dev/Tone/instrument/Sampler.ts#L154-L175)).
That makes a sparse anchor set compatible with the existing engine.

Growlybass is much richer than the engine can currently express. Its clean SFZ
mapping spans MIDI keys 33–79 and uses sustained samples at fourteen pitch
centres. Each centre has four velocity layers (`pp`, `p`, `f`, `ff`) and four
round robins; the README also documents five round robins for staccatos and
releases
([clean mapping](https://github.com/sfzinstruments/karoryfer.growlybass/blob/4f483268fc66b5a6d5781d421c0d11b8d08d3fc6/growlybass_clean.sfz#L65-L178),
[README](https://github.com/sfzinstruments/karoryfer.growlybass/blob/4f483268fc66b5a6d5781d421c0d11b8d08d3fc6/readme.txt)).
The SFZ and filenames use the written bass octave: `e2` is the standard bass's
sounding E1. The conversion manifest therefore needs to record the one-octave
mapping explicitly rather than treating filenames as Tone note names.

Measurements from the immutable Git tree at commit `4f48326`:

- The repository contains 389 blobs totalling 190,765,200 bytes (181.93 MiB).
- Its 224 sustain WAV files total 178,440,056 bytes (170.17 MiB).
- Ten proposed `f`/RR1 source WAVs (`e2`, `gb2`, `a2`, `c3`, `eb3`, `gb3`,
  `a3`, `c4`, `eb4`, `gb4`) total 7,966,074 bytes (7.60 MiB) before lossy
  conversion.

Those figures are sums of the `size` fields in the
[pinned repository tree](https://api.github.com/repos/sfzinstruments/karoryfer.growlybass/git/trees/4f483268fc66b5a6d5781d421c0d11b8d08d3fc6?recursive=1).
The final download size is not yet known because bitrate/codec and trimming
have not been selected. The source README describes the downloadable library
as 310 24-bit, 44.1 kHz WAV samples and 159 MB; the Git tree is the more useful
upper-bound measurement for a reproducible subset
([official Growlybass page](https://shop.karoryfer.com/pages/free-growlybass)).

## Candidate comparison

| Candidate                                         | Rights and attribution                                                                                                                                                                                                                                                                   | Coverage and delivery                                                                                                                                                                                                                                  | Verdict                                                                                                                                                                                |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Karoryfer Growlybass**                          | CC0 file in the same repository as the WAVs; Karoryfer Lecolds and 2014 are named in the README.                                                                                                                                                                                         | Standard EADG; low extension to C♯; fourteen sustained pitch centres, four velocities and four round robins. A ten-anchor, one-layer subset is 7.60 MiB before conversion.                                                                             | **Choose.** Clearest chain of rights and enough source fidelity to make a compact native asset.                                                                                        |
| **gleitz FluidR3_GM / Electric Bass (finger)**    | The distributor's README calls FluidR3_GM CC BY 3.0 and explicitly permits fetching files from its GitHub Pages prefix. However, Debian's current package metadata calls FluidR3 MIT, and the distributor README does not identify the original author or a complete attribution string. | 88 chromatic MP3 renders A0–C8; the whole bass folder is 1.42 MiB. Ten 3-semitone anchors over E1–G3 are 159,910 bytes. Generator source shows every render is one 3-second MIDI note at velocity 85, so there are no velocity layers or round robins. | **Fallback for a remote proof of concept only.** Tiny and already matches the app's existing CDN pattern, but settle the conflicting license metadata and attribution before bundling. |
| **nbrosowsky/tonejs-instruments `bass-electric`** | Its repository declares the samples CC BY 3.0 and says `bass` came from Karoryfer, but does not name the original Karoryfer library, performer, or original recording license. The code's MIT license does not replace the audio license.                                                | Seventeen MP3s at four pitch classes per octave, 4.81 MiB total; already shaped as a Tone sampler map. No velocity or round-robin mapping.                                                                                                             | Reject for production unless provenance is completed. It is convenient, but its attribution trail is less precise than using Growlybass directly.                                      |

Primary evidence for the alternatives:

- gleitz describes the FluidR3 source, license and direct-fetch URL in its
  [soundfont repository README](https://github.com/gleitz/midi-js-soundfonts/tree/044fab8e1456bfafc5776e86dfd6bb8697149aef#soundfonts-available).
  The 88-file count and byte totals come from its
  [pinned Git tree](https://api.github.com/repos/gleitz/midi-js-soundfonts/git/trees/044fab8e1456bfafc5776e86dfd6bb8697149aef?recursive=1).
  Its generator fixes `VELOCITY = 85`, `DURATION = 3000`, and renders every
  pitch A0–C8
  ([generator source](https://github.com/gleitz/MIDI.js/blob/master/generator/ruby/soundfont_builder.rb#L352-L393),
  [render loop](https://github.com/gleitz/MIDI.js/blob/master/generator/ruby/soundfont_builder.rb#L441-L459)).
  Debian independently identifies FluidR3 as Frank Wen's soundfont but lists
  MIT, not CC BY 3.0
  ([Debian package page](https://packages.debian.org/bookworm/fluidr3mono-gm-soundfont)).
- Creative Commons says CC BY 3.0 permits commercial sharing and adaptation
  but requires appropriate credit, a license link, and change indication
  ([CC BY 3.0 deed](https://creativecommons.org/licenses/by/3.0/)).
- `tonejs-instruments` states the sample license and describes its edits in the
  [pinned README](https://github.com/nbrosowsky/tonejs-instruments/tree/622c2f1c32c8cfce4158ddc3eb26e518ddef37e5#about-the-samples),
  attributes `bass` only to Karoryfer in
  [`sample-source-info.txt`](https://github.com/nbrosowsky/tonejs-instruments/blob/622c2f1c32c8cfce4158ddc3eb26e518ddef37e5/sample-source-info.txt),
  and exposes the seventeen-note map in
  [`Tonejs-Instruments.js`](https://github.com/nbrosowsky/tonejs-instruments/blob/622c2f1c32c8cfce4158ddc3eb26e518ddef37e5/Tonejs-Instruments.js#L84-L102).
  The 4.81 MiB total is summed from its
  [pinned Git tree](https://api.github.com/repos/nbrosowsky/tonejs-instruments/git/trees/622c2f1c32c8cfce4158ddc3eb26e518ddef37e5?recursive=1).

## Recommended implementation contract

1. Pin Growlybass commit `4f483268fc66b5a6d5781d421c0d11b8d08d3fc6`
   in a conversion manifest and vendor its `LICENSE` beside the generated
   assets.
2. Start with the ten `sustain/*_f_rr1.wav` anchors named above. Map their
   sounding roots explicitly as E1, F♯1, A1, C2, E♭2, F♯2, A2, C3, E♭3 and
   F♯3; let Tone repitch at most two semitones to cover E1–G3.
3. Convert to one browser format already supported by the app, preserving a
   manifest of source path, source hash, output hash, encoder/version and
   settings. Self-host under `public/` rather than depending on the upstream
   repository's availability or CORS policy.
4. Keep the present synthetic fallback while files load. Do not eagerly load
   the bass set until the fretboard is visible or first played; the current
   eager sampler loop is acceptable for the tiny Fluid set but would make a
   higher-fidelity Growlybass derivative part of every app startup.
5. Add the credit above to a third-party notices surface and retain the full
   CC0 text in the distribution even though neither is legally required by
   CC0. This keeps provenance auditable.

## Facts still requiring a spike or human judgment

- **Sounding-octave verification:** the README establishes standard EADG and
  the SFZ uses written bass pitches, but the ten selected files should be
  frequency-checked and auditioned after mapping. This is a technical QA gate,
  not a licensing gap.
- **Encoding budget:** choose MP3 versus Ogg (or both), bitrate, tail trimming
  and loudness policy, then measure decoded quality and actual transfer size on
  target browsers. No final bundle-size claim can be made before this.
- **Expressiveness:** decide whether one fixed `f` layer is sufficient for the
  educational click-to-hear interaction. Supporting source velocity layers or
  round robins would require a deeper sampler abstraction than the current
  one-URL-per-pitch preset and should be a separate decision.
- **Product timbre:** audition Growlybass's aggressive, roundwound Jazz Bass
  character against the intended neutral teaching voice. If it is too
  characterful, use the FluidR3 remote set for a temporary prototype while
  researching another directly licensed CC0 electric bass—not the
  incompletely attributed `tonejs-instruments` derivative.
- **Legal review:** this research reports source terms and is not legal advice.
  CC0 is unusually low-friction, but the project owner should approve the
  notice wording and distribution policy.
