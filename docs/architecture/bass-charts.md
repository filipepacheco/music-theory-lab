# Biblioteca bass charts

Each import gives one `BassChart`. `docs/library-imports.md` covers the Guitar Pro import, transposition, and chart persistence.

## Rocksmith import

Accepts Rocksmith 2014 `.psarc` packages, entirely in the browser.

| File | Job |
|---|---|
| `services/rocksmith/psarc.ts` | Reads the container: AES-CFB table of contents with Web Crypto, zlib blocks. |
| `services/rocksmith/sng.ts` | Decrypts (AES-CTR, PC or Mac key) and walks the binary arrangement. |
| `services/rocksmith/wemAudio.ts` | Lazy-loaded. Repackages the Wwise song stream as Ogg Vorbis with `ww2ogg-ts`. |
| `domain/bassChart.ts` | Keeps the hardest difficulty level of each phrase. Places notes on the beat grid of the chart (12 ticks per beat). Merges consecutive Rocksmith sections. |
| `services/rocksmithLibrary.ts` | Charts and audio persist only in IndexedDB. |

- `wemAudio.ts` must use the aoTuV 6.03 codebooks. The standard set gives packet errors and short audio.
- The user can attach an audio file of their own (for example MP3 where Ogg is not supported).

## MIDI bass import

Accepts `.mid` and `.midi` (format 0 and 1) through the same Biblioteca button. The chart has `source: 'midi'`.

- `services/midi/midiFile.ts` parses the file.
- `domain/midiBassChart.ts` picks the bass channel: General MIDI programs 33-40, else the lowest melodic channel.
- It builds the beat grid from the tempo map and the time signatures.
- Markers become sections. With no marker, the chart has one "Música" section.
- It suggests a string and a fret for each note, because MIDI has no fingering.
- A MIDI has no audio, and no technique other than a pitch-bend flag. Attached audio lines up only when the file follows the timing of the recording.

## Synth playback

A chart with no audio (each MIDI import, or a Rocksmith package with no song stream) plays through the sampled bass.

- `services/bassSynthTransport.ts` is a `LibraryAudioSession`. It schedules the notes about 200 ms ahead on the audio clock, with `playbackEngine.preloadBassNotes`, `scheduleBassNote`, and `stopBassNotes`.
- The same `LibraryPlayer`, playhead, and click-to-seek drive it. `useBassSynthPlayback` adapts it to React.
- A pitch outside the sampled range E1-G3 uses a sample in the range, shifted to the exact pitch. The register and the intervals stay.
- Each note is cut at the next onset.
- When the user attaches audio, the chart goes back to the recording.

## Bar analysis (`domain/bassAnalysis.ts`)

Reads the harmony that the bass implies, bar by bar, from the bass notes alone ("Mostrar graus" in the chart view). Rules cite the reference of the music-theory skill (`§n`).

| Topic | Rule |
|---|---|
| Bar root | The note on the downbeat, or one held across the bar line. Else an estimate from the note with the strongest position. |
| Weak-beat notes | Classified as passing, neighbour, chromatic approach, or anticipation, and left out of the harmony. |
| Chord type | The other notes give the 3rd, 5th, and 7th. A type is named only when those slots leave one `CHORD_TYPES` reading. A bar with no third stays unnamed. |
| Dead notes | Ignored. |
| Natural harmonics | Raised to the pitch that sounds. |

## Key and harmony (`domain/bassHarmony.ts`)

- `suggestKeys` ranks keys by where the bass rests: bars on the tonic, section starts and ends, V→I arrivals, the final chord. Scale fit only breaks ties. A tonic under 10% of the bars ranks last. The user can pick any key.
- `analyzeHarmony` groups the bars on one root into chords. Each chord gets a numeral and a T/SD/D function.
- A chord reads as a secondary dominant, SubV, passing diminished, borrowed, or chromatic chord only when its root, or a played third, fifth, or seventh, leaves the harmonic field.
- It flags avoid notes by degree.
- It lists cadences (ii–V–I, authentic, modal v→i, plagal, deceptive, half, b6→5) and the §13.1 progressions, with the 12-bar blues.
- A cadence that needs a major V (authentic, deceptive, half, b6→5, ii–V–I into the tonic) takes the V of the major field as given. In a minor key it needs a major third that the bass played, because the v of the natural minor has no leading tone. Else v→i is a modal cadence.
- Chord symbols use the accidentals of the key (`keyNoteNames`: D minor has Bb, not A#).
- `components/library/BassDegreeGuide.tsx` is a collapsible guide for beginners in pt-BR: degree labels, fret shapes, the "?", numerals with the harmonic field of the key, function colours, cadences, and avoid notes.

## Chart view: dock, fretboard, circle

| Part | Behaviour |
|---|---|
| `PlaybackDock` | Fixed to the bottom of the screen, above the mobile nav. It is `fixed` because `overflow-x-hidden` on the app root makes `position: sticky` inert. Holds play/pause, the current bar and note, and a compact `ChartFretboard`. |
| `ChartFretboard` | Draws the chord tones of the bar from `barChordTones`: solid when the bass played them, dashed when only the reading of the key implies them. The sounding note is amber on its exact fret, in the tuning of the chart. Scrolls sideways to keep it in view. |
| `FifthsCircle` | Up to 300px, with the key and the current chord in its centre. Lives in a draggable `FloatingWindow`. |
| `FloatingWindow` | Toggled by the "Ciclo" button of the dock. Open by default on wide screens, closed on phones. Starts bottom-left above the dock (over the track list on desktop). Remembers if it is open and where it was dragged. A double click on its title sends it back. |

The circle (`domain/circleOfFifths.ts`):

- Shades the harmonic field of the key by function, highlights the current chord, and outlines the next one.
- Shows an arrow and a caption for the next root move, and the next chord under the current one in the centre.
- A third that the bass played decides the ring of a chord. With no third (or both), the reading of the key is a guess, drawn lighter with `?`. The same root with the other third gets a dotted outline. A note under the circle (`describeThird`) says which third makes which chord.

## Chart view: lines and repeats

- The "por linha" picker of each section sets the bars on a line (`sectionRows`, counted from the first bar of the section). It is saved for each chart and section in localStorage.
- Bars shrink to 80% to keep that length. When it still does not fit, a divisor is used (`fittedBarsPerRow`: 8 → 4), so the lines start on the same bars of each phrase.
- "Marcar repetições" (saved in localStorage): in such a section, a bar with the same tab as the bar right above it is drawn empty under a bar-repeat sign. `barsRepeatingAbove` compares meter, beats, strings, frets, slides, and techniques. Sustain is not drawn, so it is not compared. A bar with no notes never counts.
- "Acompanhar a reprodução" keeps the playing bar visible between the app header and the dock. It scrolls to centre the bar only when it leaves that space, and leaves already visible bars in place.
