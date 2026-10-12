# Drum sample set: candidates and choice

Date: 2026-10-12
Ticket: 19, "The owner chooses the drum sample set" (library-songs-drums)
Feeds: ticket 23, "The drum chart plays with drum samples"

## Owner choice

**Chosen set:** _(the owner writes the name here)_

**Chosen by / date:** _(the owner writes it here)_

Ticket 23 reads this line. Until the owner fills it, ticket 23 stays blocked.

## Scope and method

The repository is public, so the licence of the set must allow redistribution
in a public repository. The app ships the samples from its own host (ticket
23), so each licence below is read for "may the files sit in this repository
and be served by the app".

Every licence, size, and instrument fact below was read at the source named
under the set, on 2026-10-12. Where I could not confirm a fact at the source,
the note says so under "Not confirmed". I did not download a sample set. I did
not listen to any set: the sound is for the owner (ticket 23 has an ear check).
Sizes are the byte sizes that the host reports (GitHub API), not a measure of
what ticket 23 will ship. Ticket 23 can cut velocity layers and unused
articulations.

This is a reading of the licence texts, not legal advice.

Target map (ticket 16): kick; snare with cross-stick; hi-hat closed, open, and
pedal; high tom; mid tom; floor tom; crash (with china and splash); ride (with
bell); other.

## Summary

| Set | Licence | Needs attribution | Hi-hat closed / open / pedal | Whole set on host | Verdict |
|---|---|---|---|---|---|
| Virtuosity Drums | CC0 1.0 | No | yes / yes / yes | 1.4 GB, 7 mic sets | Recommended |
| Hydrogen GMRockKit | GPL (version not stated for the samples) | Copyleft terms | yes / yes / yes | 11.3 MB | Small, but the GPL needs the owner's decision |
| MuldjordKit (FreePats) | CC BY 4.0 | Yes | yes / yes / no | 165 MB (FLAC archive) | Good coverage, no pedal hi-hat, no cross-stick |
| Karoryfer Swirly Drums | CC0 1.0 | No | yes / yes / yes (by sample names) | 341 MB without the "wet" folders | Fits the licence, character not confirmed |
| Karoryfer Big Rusty Drums | CC0 1.0 | No | yes / yes / yes (by sample names) | 706 MB | Fits the licence, character not confirmed |

## Candidates

### 1. Virtuosity Drums (Versilian Studios and Karoryfer Samples)

- Source: <https://github.com/sfzinstruments/virtuosity_drums> (master,
  commit `9f04cf9a734527edfbb0a4eee1f674e45bbf71bc`, last push 2026-04-21)
- Licence: CC0 1.0 Universal (public domain dedication). GitHub reports
  `CC0-1.0`, and the `LICENSE` file starts with "Creative Commons Legal Code
  / CC0 1.0 Universal".
  Text: <https://github.com/sfzinstruments/virtuosity_drums/blob/master/LICENSE>
  and <https://creativecommons.org/publicdomain/zero/1.0/legalcode>
- Attribution: none required by CC0.
- Size (sum of file sizes in `Samples/`, from the git tree): `lofi` 136.3 MB
  (575 files), `kickmic` 101.9 MB, `snaremic` 105.1 MB, `oh` 239.4 MB, `mid`
  263.6 MB, `room` 263.5 MB, `perc` 359.1 MB (aux percussion, not needed).
  Files in `lofi` are 565 FLAC and 10 WAV. The README is 2.3 KB; the manual PDF
  is 3.95 MB.
  The `lofi` files for exactly the pieces of the map (kick, snare centre and
  cross-stick, high tom, low tom, hi-hat closed/open/pedal, crash, ride, ride
  bell), all velocity layers: 44.6 MB.
- Covers (README articulation list and `lofi` sample names):
  - Kick (snares on and off); keymap notes 35 and 36.
  - Snare: centre, off-centre, rimshot, stickshot, cross-stick, muted, flam,
    buzz, roll.
  - Hi-hat: closed, open, pedal, half-open, 3/4 open, splash. The keymap puts
    them on the General MIDI numbers 42, 44, and 46.
  - Toms: high tom and low tom (two toms), with centre, off-centre, rimshot,
    cross-stick, and muted variants of the low tom.
  - Crash (normal, sizzle), ride (normal, bell), flat ride (also as a crash).
- Does not cover:
  - A mid tom: the set has a high tom and a low tom only, so the map's mid tom
    and floor tom share one piece (the keymap puts the low tom on 41, 43, and
    45).
  - A china: not in the articulation list.
  - A separate splash cymbal: the keymap puts the flat ride used as a crash on
    note 55 (the General MIDI splash), and the hi-hat has a splash hit.
- Character: a jazz kit, played with sticks, recorded at a shop in Boston
  (README). A rock groove may sound thin. This is for the owner's ear.
- Not confirmed: I did not check the origin of each aux percussion sample (the
  README says "from VSCO 2 Pro" and "Karoryfer"); they are not needed for the
  map. I did not check that the `lofi` mic set sounds good: the name suggests a
  lo-fi microphone, and the other sets are larger.

### 2. Hydrogen GMRockKit (Glen MacArthur / Sebastian Moors)

- Source: <https://github.com/hydrogen-music/hydrogen/tree/master/data/drumkits/GMRockKit>
  (kit description: "A Sampled 5pc Pearl DX Series Drumkit")
- Licence: the `drumkit.xml` of the kit has the field `<license>GPL</license>`,
  and the file starts with a GNU General Public License notice that says "either
  version 3 of the License, or" (the rest of the sentence I did not read). The
  kit folder has no `LICENSE` file; it holds `drumkit.xml` and the WAV files.
  The `imageLicense` field says "undefined license", and the kit has no image
  file.
  Text of GPLv3: <https://www.gnu.org/licenses/gpl-3.0.html>
  Raw file: <https://raw.githubusercontent.com/hydrogen-music/hydrogen/master/data/drumkits/GMRockKit/drumkit.xml>
- Attribution: the GPL requires the licence text and a copyright notice with
  the files.
- Size: 86 WAV files, 11.3 MB in total (11,322,412 bytes), plus `drumkit.xml`
  (67.7 KB). Five velocity layers per piece.
- Covers (instrument names in `drumkit.xml`): kick, snare, snare rimshot, side
  stick (cross-stick), hi-hat closed, open, pedal, and semi-open, tom 1, tom 2,
  floor tom, crash, splash, ride, ride 2, ride bell, cowbell, hand clap.
- Does not cover: a china. One crash only (and a splash).
- Not confirmed: the version of the GPL that applies to the samples (the XML
  notice says v3 for the program; the kit field says only "GPL"). Whether the
  GPL reaches the app when GPL samples ship in a public repository and are
  served as data is a legal question that I did not resolve. It is the reason
  that this set is not the recommendation. The other sets are CC0 or CC BY and
  have no such question.
- The Hydrogen repository also holds `TR808EmulationKit` (GPL, ArtemioLabs,
  16 synthesized sounds, FLAC, about 0.2 MB). It has a closed, open, and
  pedal hi-hat, but no crash, ride, or snare cross-stick by its file names
  (`808_Cymbal`, `808_Clap`, and so on). I list it as a note, not as a
  candidate: an 808 sound does not fit a rock bass player's drum charts.

### 3. MuldjordKit (Lars Muldjord, DrumGizmo), FreePats version

- Source: <https://freepats.zenvoid.org/Percussion/acoustic-drum-kit.html>
  and <https://github.com/freepats/muldjordkit> (version 2020-10-18; the
  original is at <https://drumgizmo.org/wiki/doku.php?id=kits:muldjordkit>)
- Licence: Creative Commons Attribution 4.0 International (CC BY 4.0). GitHub
  reports `CC-BY-4.0`. The README says: "The MuldjordKit drumkit source files
  are released under the Creative Commons Attribution 4.0 International
  License."
  Text: <https://creativecommons.org/licenses/by/4.0/legalcode>
  Repository file: <https://github.com/freepats/muldjordkit/blob/master/LICENSE.txt>
- Attribution: required. The README says: "Since 2021-01, attribution is
  required in the 'album credits' field, or similiar album linear notes. The
  text is: Drum samples provided by DrumGizmo.org." The app has no album
  credits; the owner or ticket 23 must place this text in an about or credits
  place. The DrumGizmo page says the text can be omitted when there are no
  credits or liner notes; whether that applies to an app is for the owner.
- Size (release assets, 2020-10-18): SFZ with FLAC 7z, 165.0 MB (165,026,479
  bytes); SFZ with WAV 7z, 233.6 MB; Hydrogen `.h2drumkit`, 136.9 MB; SF2 7z,
  54.9 MB. The FreePats page lists SFZ FLAC "157MiB (160MiB)" and SF2
  "53MiB (209MiB)". I did not list the files inside the archives, so I do not
  have a size for the subset that the map needs.
- Covers (SFZ section comments and README): 2 kick drums, 2 snares, hi-hat
  closed and open, 4 toms (3 hanging and 1 floor), 2 crashes, 2 rides with a
  bell for each, 1 china.
- Does not cover: a pedal hi-hat (the SFZ has "Hi-hat closed" and "Hi-hat
  open" only); a snare cross-stick (the SFZ sections are "Snare 1", "Snare 2",
  and two "Snare rest" sections; I found no cross-stick); a splash.
- Character: "a metal or rock kit" (README). The FreePats version is a
  simplified stereo version of the 16-channel original.
- Not confirmed: the size of the subset; the velocity layers per piece.

### 4. Karoryfer Swirly Drums

- Source: <https://github.com/sfzinstruments/karoryfer.swirly-drums> (branch
  main, last push 2023-04-29)
- Licence: CC0 1.0 Universal. GitHub reports `CC0-1.0`, and the `license` file
  starts with "CC0 1.0 Universal".
  Text: <https://github.com/sfzinstruments/karoryfer.swirly-drums/blob/main/license>
- Attribution: none required by CC0.
- Size (sum of file sizes in `Samples/`): 341.1 MB for the folders without
  "wet" and "wetter", which add 720.0 MB and 759.5 MB (processed variants, by
  their names). Files are WAV.
- Covers (folder and file names): kick, snare (main, edge, dig, flutter),
  hi-hat closed, open, foot (pedal), half, quarter, tight, sizzling, foot
  splash, toms (floor, "mlow", "xmed", "mhi", "vhi"), crash, broken crash,
  china, ride, splash, plus cajon, bongo, djembe, darbouka, and cowbell.
- Does not cover: a snare cross-stick (no such name in the file list).
- Not confirmed: the character of the kit. The repository has a PDF user guide
  (1.0 MB) that I did not read. Which sample is the closed, the open, and the
  pedal hi-hat is my reading of the names `hat_closed`, `hat_open`, and
  `hat_foot`.

### 5. Karoryfer Big Rusty Drums

- Source: <https://github.com/sfzinstruments/karoryfer.big-rusty-drums>
  (branch main, last push 2023-04-29)
- Licence: CC0 1.0 Universal. GitHub reports `CC0-1.0`, and the `LICENSE` file
  starts with "CC0 1.0 Universal".
  Text: <https://github.com/sfzinstruments/karoryfer.big-rusty-drums/blob/main/LICENSE>
- Attribution: none required by CC0.
- Size (sum of file sizes in `Samples/`): 706.2 MB (4,366 FLAC and 100 WAV).
  Largest folders: snare 117.0 MB, hi-hat 106.8 MB, sizzle ride 90.1 MB, ride
  81.6 MB.
- Covers (folder and file names): kick, snare, hi-hat with closed, open,
  "chik" (pedal chick), and foot splash, four toms (14, 15, 18, and 22 inch),
  crash, sizzle crash, ride, sizzle ride, 18 inch china, and a stack.
- Does not cover: not confirmed for the snare cross-stick (file names such as
  `sn_rims`, `sn_ss` could be a rim shot or a stick shot; I did not read the
  guide).
- Not confirmed: the character of the kit; the meaning of the short file
  names. The repository has an 8.5 MB PDF user guide that I did not read.

## Looked at and left out

- Open Metronome percussion sets
  (<https://openmetronome.sourceforge.net/samples.html>): the page states no
  licence for the two sets (one from a Freesound beatbox library, one
  extracted from the FluidR3 soundfont). No licence, so it cannot go in a
  public repository.
- DRSKit (DrumGizmo, CC BY 4.0,
  <https://drumgizmo.org/wiki/doku.php?id=kits:drskit>): the page does not
  describe the hi-hat articulations or give file sizes. Not pursued further
  because MuldjordKit is the same family and licence with a clearer
  description.
- FreePats Electric and Synthesizer Percussion (CC0, 2.0 MiB Hydrogen kit,
  <https://freepats.zenvoid.org/Percussion/electric-percussion.html>): the page
  gives no instrument list, and it describes sounds of vintage electronic
  music. Not enough information, and not an acoustic kit.
- GeneralUser GS and FluidR3: I could not read the licence page of GeneralUser
  GS (the fetch returned no licence text), so I give no fact about it.

## Recommendation

**Virtuosity Drums**, with the sample set cut to the pieces of the map.

Reason:

1. The licence is CC0 1.0. It needs no attribution and no copyleft decision,
   and the repository holds the licence text, so the "licence text" criterion
   of ticket 23 is easy to meet.
2. It is the only set here with the closed, open, and pedal hi-hat, the snare
   cross-stick, crash, ride, ride bell, and a keymap on the General MIDI
   numbers that the map of ticket 16 uses (35, 36, 37, 38, 40, 41, 42, 43, 44,
   45, 46, 47, 48, 49, 50, 51, 53, 57, 59).
3. The pieces of the map take about 45 MB in the `lofi` set with all velocity
   layers, and ticket 23 can cut that further, since it needs a soft, normal,
   and hard hit for the ghost note and the accent.

What the owner gives up: a mid tom and a china (a high and low tom only); a
jazz character, which may sound light for rock; and I did not hear it.

Second choice if the owner wants a rock sound and accepts the GPL: **Hydrogen
GMRockKit** (11.3 MB). If the owner wants rock and a permissive licence:
**MuldjordKit** (CC BY 4.0, with the attribution text), with no pedal
hi-hat and no cross-stick, so those two hits have no sample (ticket 23 says a
hit with no sample makes no sound and no error).

## What the owner decides

1. Which set (write it in "Owner choice" above).
2. For GMRockKit: whether the GPL is acceptable for samples in this repository.
   For MuldjordKit: where the attribution text goes in the app.
3. Whether a jazz kit (Virtuosity) is acceptable, after a listen: audition
   the demo or the set before the choice. I did not do it.
