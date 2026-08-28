# Songsterr-style drum chart investigation

Date: 2026-08-28

## Scope

The supplied Songsterr page and screenshot were treated as visual references,
not as implementation instructions. The goal is to assess whether the current
three-piece groove can be presented as a small, professional-looking drum
chart for one or two measures.

This is an observation and design investigation only. It does not claim to
reproduce Songsterr's private rendering or data model.

## What Songsterr visibly provides

The supplied [Enter Sandman drum tab](https://www.songsterr.com/a/wsa/metallica-enter-sandman-drum-tab-s19)
has two distinct surfaces:

1. A score area that lays events out continuously by musical time. The
   reference screenshot shows bar numbers, a time signature and tempo, bar
   lines, rests, noteheads, stems/beams, accents, a tuplet, section text, and
   a green playback cursor.
2. A separate transport area with play, speed, loop, solo, mute, count-in,
   metronome, download, and editor controls. The page also exposes an
   instrument/drum-map control, including bass drum, snare, hi-hat, toms, and
   cymbal variants.

Songsterr's help page confirms that drum notation is a separate view/control
and that the desktop player can switch to standard notation in Sheet view:
[Songsterr Questions](https://www.songsterr.com/help).

The important product lesson is separation of concerns: the chart is a
time-based score, while playback and editing are controls around it. The
professional appearance comes mostly from spacing, bar grouping, conventional
note symbols, and readable playback position—not from the number of controls.

## What standard drum notation contributes

The current reference uses a conventional percussion staff rather than three
labelled rows. MuseScore documents percussion as its own staff type and allows
each drum sound to define its staff position, notehead, and stem direction:
[Staff/Part properties](https://musescore.org/en/handbook/4/staffpart-properties)
and [Entering and editing percussion notation](https://musescore.org/en/handbook/3/entering-and-editing-percussion-notation).

For our reduced vocabulary, a practical mapping is:

| Current piece | Chart position | Notehead |
| --- | --- | --- |
| `chimbal` | upper staff position | `x` |
| `caixa` | middle staff position | filled oval |
| `bumbo` | lower staff position | filled oval |

This is an idiomatic approximation, not a claim that every drumset notation
convention is universal. It is enough for a three-piece groove and leaves room
for later additions such as open hi-hat, crash, ghost notes, and accents.

## Fit with the current application

The current `GroovePattern` is already a useful authoring model:

- one subdivision (`4n`, `8n`, `16n`, or `32n`);
- one boolean row for each of `bumbo`, `caixa`, and `chimbal`;
- arrays aligned to musical steps;
- the existing player already consumes the same pattern and can update while
  playing.

That means a chart can be a pure rendering of the existing data. We should not
create a second notation-only representation for the first version.

There is one model gap for the requested use case: the current groove is one
fixed 4/4 measure. A two-measure capture needs an explicit length. The smallest
compatible extension is a `measureCount: 1 | 2` field with the three arrays
flattened to `measureCount * stepsPerMeasure`. Existing data defaults to `1`.
The chart and scheduler should both derive their total duration from that
field.

## Recommended simple implementation

### Phase 1: score preview, grid remains the editor

Add a `GrooveChart` component rendered as SVG:

- draw five staff lines and a left-side `4/4` marker;
- draw a barline after each measure and a small measure number above it;
- calculate x positions from the selected subdivision and group spacing by
  beat;
- draw a hi-hat `x`, snare oval, and kick oval at fixed y positions;
- add stems and simple beams for eighth notes and faster values;
- show a compact empty/rest treatment where a beat has no event;
- keep the existing grid for precise editing, with a chart/grid toggle if the
  panel becomes too tall.

This is a good fit for SVG because the scope is only three voices and one or
two measures. It avoids a notation dependency, keeps symbols crisp in the
browser, and can be made accessible with labels for each event.

### Phase 2: make it feel like a player

- expose a playback cursor whose step position is scheduled through the same
  `Tone.getDraw().schedule()` path as audio-related UI;
- highlight the current beat/measure without changing the pattern;
- make chart events clickable only after the static rendering is visually
  stable;
- add optional hit metadata (`accent`, `ghost`, `open`) only when the product
  needs those sounds and symbols.

For PDF export, do not rasterize a browser screenshot. Share a small pure chart
geometry helper between the SVG renderer and the jsPDF exporter so both use the
same measure widths, y positions, noteheads, stems, and barlines.

## What should remain out of scope

Replicating Songsterr completely would require a real notation engine: rests
and duration inference, multiple voices, tuplets, ties, articulations,
ghost/dead notes, open/choked cymbals, drum-map metadata, responsive score
layout, and likely imported score formats. Those features are valuable only if
the app is intended to author or import full drum parts.

For one or two measures with three binary voices, a custom chart can reproduce
the visual language convincingly without reproducing that full engine.

## Recommendation

Proceed with a custom SVG chart as a read-only professional preview, keep the
existing grid as the editor, and add explicit one/two-measure length before
changing the renderer. This gives the user the Songsterr-like visual result
while preserving the current playback, live-edit, and PDF architecture.

The first implementation should target: 4/4, the existing four subdivisions,
three note types, barlines, measure numbers, beams, and a synced playback
cursor. It should defer full notation semantics and library adoption until
there is evidence that users need more than the small groove vocabulary.
