import { importer, midi, model, Settings } from '@coderline/alphatab';
import {
  buildBassChart,
  STANDARD_OPEN_MIDI,
  type BassChart,
  type BassChartMetadata,
  type BassFretPosition,
} from '@/domain/bassChart';
import type { Chart, DrumDynamic } from '@/domain/drumChart';
import {
  buildGuitarChart,
  GUITAR_MIN_STRINGS,
  type GuitarChart,
  type GuitarNoteInput,
  type GuitarTechnique,
} from '@/domain/guitarChart';
import {
  buildVocalChart,
  type VocalChart,
  type VocalNoteInput,
} from '@/domain/vocalChart';
import {
  hasBassProgram,
  midiToArrangement,
  pickBassChannel,
  tickToSeconds,
} from '@/domain/midiBassChart';
import {
  DRUM_CHANNEL,
  hasDrumNotes,
  midiToDrumChart,
} from '@/domain/midiDrumChart';
import { partChartId, sha256Hex } from '@/services/chartId';
import {
  parseGpFile,
  gpParseErrorMessage,
  GpParseError,
} from '@/services/gpFile';
import { metadataFromFileName } from '@/services/midi/importMidi';
import {
  parseMidi,
  type MidiFile,
  type MidiNote,
} from '@/services/midi/midiFile';

const NO_CHANNEL = -1;

export function gpChartImportErrorMessage(error: unknown): string {
  if (error instanceof GpParseError) return gpParseErrorMessage(error);
  if (error instanceof Error && error.message === 'no-parts') {
    return 'Este arquivo Guitar Pro não tem baixo nem bateria.';
  }
  return 'Não foi possível importar este arquivo Guitar Pro.';
}

export async function importGpChart(
  file: Blob & { name: string },
  now: Date = new Date(),
): Promise<{ charts: Chart[]; audio: null }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  parseGpFile(bytes);
  const settings = new Settings();
  const score = importer.ScoreLoader.loadScoreFromBytes(bytes, settings);
  const exported = new midi.MidiFile();
  const handler = new midi.AlphaSynthMidiFileHandler(exported, true);
  const generator = new midi.MidiFileGenerator(score, settings, handler);
  generator.generate();
  const parsed = parseMidi(exported.toBinary());
  // Section labels are not SMF marker events in alphaTab's MIDI export.
  // Read them from its expanded playback timeline, including repeat visits.
  parsed.markers = generator.tickLookup.masterBars.flatMap((played) => {
    const section = played.masterBar.section;
    const text = section?.text.trim() || section?.marker.trim();
    return text ? [{ tick: played.start, text }] : [];
  });
  const vocalTracks = findVocalTracks(score);
  const guitarTracks = findGuitarTracks(score, vocalTracks);
  const channel = pickBass(parsed, guitarTracks, vocalTracks);
  if (
    channel === null &&
    !hasDrumNotes(parsed) &&
    guitarTracks.length === 0 &&
    vocalTracks.length === 0
  ) {
    throw new Error('no-parts');
  }

  const fileHash = await sha256Hex(bytes);
  const fallback = metadataFromFileName(file.name);
  const shared = {
    source: 'gp' as const,
    sourceFileName: file.name,
    importedAt: now.toISOString(),
    metadata: {
      ...fallback,
      title: score.title.trim() || fallback.title,
      artist: score.artist.trim() || fallback.artist,
      album: score.album.trim(),
    },
  };

  const charts: Chart[] = [];
  if (channel !== null) {
    charts.push(
      bassChartOf(score, parsed, generator, channel, {
        ...shared,
        id: await partChartId(fileHash, 'bass'),
      }),
    );
  }
  const drums = midiToDrumChart({
    ...shared,
    id: await partChartId(fileHash, 'drums'),
    midi: parsed,
    dynamicOf: scoreDynamics(generator),
  });
  if (drums) charts.push(drums);
  const guitars = await guitarChartsOf(
    guitarTracks,
    parsed,
    generator,
    shared,
    fileHash,
  );
  charts.push(...guitars);
  charts.push(
    ...(await vocalChartsOf(vocalTracks, parsed, generator, shared, fileHash)),
  );
  if (charts.length === 0) throw new Error('no-parts');
  return { charts, audio: null };
}

interface GuitarTrack {
  track: model.Track;
  staff: model.Staff;
}

interface VocalTrack {
  track: model.Track;
  staves: model.Staff[];
}

const FIRST_VOCAL_PROGRAM = 53;
const LAST_VOCAL_PROGRAM = 55;
const VOCAL_NAME = /voc|voz|voice/i;

/** A track with a General MIDI voice program, or a vocal name. */
function findVocalTracks(score: model.Score): VocalTrack[] {
  return score.tracks.flatMap((track) => {
    const staves = track.staves.filter((staff) => !staff.isPercussion);
    const program = track.playbackInfo.program;
    const vocal =
      (program >= FIRST_VOCAL_PROGRAM && program <= LAST_VOCAL_PROGRAM) ||
      VOCAL_NAME.test(track.name);
    return vocal && staves.length > 0 ? [{ track, staves }] : [];
  });
}

/** A stringed staff with 5 or more strings, one for each track. */
function findGuitarTracks(
  score: model.Score,
  vocals: VocalTrack[],
): GuitarTrack[] {
  const vocalTracks = new Set(vocals.map(({ track }) => track));
  return score.tracks.flatMap((track) => {
    if (vocalTracks.has(track)) return [];
    const staff = track.staves.find(
      (candidate) =>
        candidate.isStringed && candidate.tuning.length >= GUITAR_MIN_STRINGS,
    );
    return staff ? [{ track, staff }] : [];
  });
}

/**
 * The bass channel that the import always picked, unless the pick is a guitar
 * track that no bass program names: a guitar is not the bass.
 */
function pickBass(
  allNotes: MidiFile,
  guitars: GuitarTrack[],
  vocals: VocalTrack[],
): number | null {
  // A vocal track is never the bass, also when it is the only pitched track.
  const vocalChannels = new Set(
    vocals.flatMap(({ track }) => [
      track.playbackInfo.primaryChannel,
      track.playbackInfo.secondaryChannel,
    ]),
  );
  const parsed = {
    ...allNotes,
    notes: allNotes.notes.filter((note) => !vocalChannels.has(note.channel)),
  };
  const channel = pickBassChannel(parsed);
  if (channel === null) return null;
  const guitarChannels = new Set(
    guitars.flatMap(({ track }) => [
      track.playbackInfo.primaryChannel,
      track.playbackInfo.secondaryChannel,
    ]),
  );
  if (!guitarChannels.has(channel) || hasBassProgram(parsed, channel)) {
    return channel;
  }
  return pickBassChannel({
    ...parsed,
    notes: parsed.notes.filter((note) => !guitarChannels.has(note.channel)),
  });
}

async function guitarChartsOf(
  guitars: GuitarTrack[],
  parsed: MidiFile,
  generator: midi.MidiFileGenerator,
  shared: {
    sourceFileName: string;
    importedAt: string;
    metadata: BassChartMetadata;
  },
  fileHash: string,
): Promise<GuitarChart[]> {
  if (guitars.length === 0) return [];
  const { arrangement, grid } = songGrid(parsed, shared, fileHash);
  const toSeconds = tickToSeconds(parsed);
  const charts: GuitarChart[] = [];
  for (const { track, staff } of guitars) {
    const notes = guitarNotesOf(staff, generator, toSeconds);
    if (notes.length === 0) continue;
    charts.push(
      buildGuitarChart({
        ...shared,
        id: await partChartId(fileHash, 'guitar', track.index),
        partName: track.name.trim() || `Guitarra ${charts.length + 1}`,
        trackIndex: track.index,
        grid,
        beats: arrangement.beats,
        openPitches: [...staff.tuning]
          .reverse()
          .map((pitch) => pitch - staff.transpositionPitch),
        capo: staff.capo,
        notes,
      }),
    );
  }
  return charts;
}

/** The bars and sections of the file, which all of its charts share. */
function songGrid(
  parsed: MidiFile,
  shared: {
    sourceFileName: string;
    importedAt: string;
    metadata: BassChartMetadata;
  },
  fileHash: string,
) {
  const arrangement = midiToArrangement(parsed, NO_CHANNEL);
  const grid = buildBassChart({
    id: fileHash,
    sourceFileName: shared.sourceFileName,
    importedAt: shared.importedAt,
    metadata: shared.metadata,
    source: 'gp',
    arrangement,
  });
  return { arrangement, grid };
}

async function vocalChartsOf(
  vocals: VocalTrack[],
  parsed: MidiFile,
  generator: midi.MidiFileGenerator,
  shared: {
    sourceFileName: string;
    importedAt: string;
    metadata: BassChartMetadata;
  },
  fileHash: string,
): Promise<VocalChart[]> {
  if (vocals.length === 0) return [];
  const { arrangement, grid } = songGrid(parsed, shared, fileHash);
  const toSeconds = tickToSeconds(parsed);
  const charts: VocalChart[] = [];
  for (const { track, staves } of vocals) {
    const notes = staves.flatMap((staff) =>
      vocalNotesOf(staff, generator, toSeconds),
    );
    if (notes.length === 0) continue;
    charts.push(
      buildVocalChart({
        ...shared,
        id: await partChartId(fileHash, 'vocals', track.index),
        partName: track.name.trim() || `Vocal ${charts.length + 1}`,
        trackIndex: track.index,
        grid,
        beats: arrangement.beats,
        notes,
      }),
    );
  }
  return charts;
}

/** The melody of one staff, in playback order, with repeats expanded. */
function vocalNotesOf(
  staff: model.Staff,
  generator: midi.MidiFileGenerator,
  toSeconds: (tick: number) => number,
): VocalNoteInput[] {
  const notes: VocalNoteInput[] = [];
  for (const played of generator.tickLookup.masterBars) {
    const seen = new Set<number>();
    for (let slice = played.firstBeat; slice; slice = slice.nextBeat) {
      for (const item of slice.highlightedBeats) {
        if (item.beat.voice.bar.staff !== staff || seen.has(item.beat.id))
          continue;
        seen.add(item.beat.id);
        const start = Math.round(played.start + item.playbackStart);
        const time = toSeconds(start);
        const end = toSeconds(start + item.beat.playbackDuration);
        const lyric = item.beat.lyrics?.find((line) => line.trim())?.trim();
        for (const note of item.beat.notes) {
          const pitch = note.calculateRealValue(
            generator.applyTranspositionPitches,
            true,
          );
          if (note.isTieDestination) {
            const origin = [...notes]
              .reverse()
              .find((earlier) => earlier.midi === pitch);
            if (origin) {
              origin.sustain = Math.max(origin.sustain, end - origin.time);
              continue;
            }
          }
          notes.push({
            time,
            sustain: Math.max(0, end - time),
            midi: pitch,
            lyric: lyric ?? null,
          });
        }
      }
    }
  }
  return notes;
}

function techniquesOf(note: model.Note): GuitarTechnique[] {
  const { beat } = note;
  const found: [boolean, GuitarTechnique][] = [
    [note.isDead, 'mute'],
    [
      note.accentuated === model.AccentuationType.Normal ||
        note.accentuated === model.AccentuationType.Heavy,
      'accent',
    ],
    [
      note.isHammerPullDestination &&
        !!note.hammerPullOrigin &&
        note.fret > note.hammerPullOrigin.fret,
      'hammerOn',
    ],
    [
      note.isHammerPullDestination &&
        !!note.hammerPullOrigin &&
        note.fret <= note.hammerPullOrigin.fret,
      'pullOff',
    ],
    [
      note.slideOutType !== model.SlideOutType.None ||
        note.slideInType !== model.SlideInType.None,
      'slide',
    ],
    [note.harmonicType !== model.HarmonicType.None, 'harmonic'],
    [note.isPalmMute, 'palmMute'],
    [beat.slap, 'slap'],
    [beat.pop, 'pop'],
    [beat.tap, 'tap'],
    [
      note.vibrato !== model.VibratoType.None ||
        beat.vibrato !== model.VibratoType.None,
      'vibrato',
    ],
    [note.hasBend, 'bend'],
    [beat.tremoloSpeed !== null, 'tremolo'],
  ];
  return found.flatMap(([present, technique]) => (present ? [technique] : []));
}

/** The notes of one staff, in playback order, with repeats expanded. */
function guitarNotesOf(
  staff: model.Staff,
  generator: midi.MidiFileGenerator,
  toSeconds: (tick: number) => number,
): GuitarNoteInput[] {
  const strings = staff.tuning.length;
  const notes: GuitarNoteInput[] = [];
  for (const played of generator.tickLookup.masterBars) {
    const seen = new Set<number>();
    for (let slice = played.firstBeat; slice; slice = slice.nextBeat) {
      for (const item of slice.highlightedBeats) {
        if (item.beat.voice.bar.staff !== staff || seen.has(item.beat.id))
          continue;
        seen.add(item.beat.id);
        const start = Math.round(played.start + item.playbackStart);
        const time = toSeconds(start);
        const end = toSeconds(start + item.beat.playbackDuration);
        for (const note of item.beat.notes) {
          if (!note.isStringed) continue;
          // alphaTab counts the strings from the lowest, which is index 0.
          const string = note.string - 1;
          if (string < 0 || string >= strings) continue;
          if (note.isTieDestination) {
            const origin = [...notes]
              .reverse()
              .find((earlier) => earlier.string === string);
            if (origin) {
              origin.sustain = Math.max(origin.sustain, end - origin.time);
            }
            continue;
          }
          notes.push({
            time,
            sustain: Math.max(0, end - time),
            string,
            fret: note.fret,
            slideToFret: note.slideTarget ? note.slideTarget.fret : null,
            techniques: techniquesOf(note),
          });
        }
      }
    }
  }
  return notes;
}

function bassChartOf(
  score: model.Score,
  parsed: MidiFile,
  generator: midi.MidiFileGenerator,
  channel: number,
  input: Omit<Parameters<typeof buildBassChart>[0], 'arrangement'>,
): BassChart {
  // Guitar Pro puts bends on a secondary channel. Keep those notes with the
  // selected bass part instead of silently losing them during channel choice.
  const track = score.tracks.find(
    (candidate) =>
      candidate.playbackInfo.primaryChannel === channel ||
      candidate.playbackInfo.secondaryChannel === channel,
  );
  let bass = parsed;
  if (track) {
    const channels = new Set([
      track.playbackInfo.primaryChannel,
      track.playbackInfo.secondaryChannel,
    ]);
    bass = {
      ...parsed,
      notes: parsed.notes.map((note) =>
        channels.has(note.channel) ? { ...note, channel } : note,
      ),
    };
  }

  const staff = track?.staves.find(
    (candidate) => candidate.tuning.length === 4,
  );
  const importedTuning =
    staff && staff.capo === 0
      ? [...staff.tuning]
          .reverse()
          .map(
            (pitch, string) =>
              pitch - staff.transpositionPitch - STANDARD_OPEN_MIDI[string],
          )
      : undefined;
  const chart = buildBassChart({
    ...input,
    arrangement: midiToArrangement(bass, channel, importedTuning),
  });
  if (staff && importedTuning) {
    chart.originalFingering = recoverOriginalFingering(
      chart,
      bass,
      generator,
      staff,
    );
  }
  return chart;
}

function scoreDynamics(
  generator: midi.MidiFileGenerator,
): (note: MidiNote) => DrumDynamic {
  const marked = new Map<string, DrumDynamic[]>();
  for (const played of generator.tickLookup.masterBars) {
    const seen = new Set<number>();
    for (let slice = played.firstBeat; slice; slice = slice.nextBeat) {
      for (const item of slice.highlightedBeats) {
        const staff = item.beat.voice.bar.staff;
        if (!staff.isPercussion || seen.has(item.beat.id)) continue;
        seen.add(item.beat.id);
        const tick = Math.round(played.start + item.playbackStart);
        for (const note of item.beat.notes) {
          // A Guitar Pro 7 or 8 track lists the articulations that it uses.
          const articulation =
            staff.track.percussionArticulations[note.percussionArticulation];
          if (!note.isPercussion || !articulation) continue;
          const key = `${tick}:${articulation.outputMidiNumber}`;
          const dynamics = marked.get(key) ?? [];
          dynamics.push(
            note.isGhost
              ? 'ghost'
              : note.accentuated === model.AccentuationType.Normal ||
                  note.accentuated === model.AccentuationType.Heavy
                ? 'accent'
                : 'normal',
          );
          marked.set(key, dynamics);
        }
      }
    }
  }
  return (note) =>
    note.channel === DRUM_CHANNEL
      ? (marked.get(`${note.startTick}:${note.pitch}`)?.shift() ?? 'normal')
      : 'normal';
}

function recoverOriginalFingering(
  chart: BassChart,
  parsed: MidiFile,
  generator: midi.MidiFileGenerator,
  staff: import('@coderline/alphatab').model.Staff,
): BassFretPosition[] | undefined {
  const toSeconds = tickToSeconds(parsed);
  const positions = new Map<string, BassFretPosition[]>();
  for (const played of generator.tickLookup.masterBars) {
    const seen = new Set<number>();
    for (let slice = played.firstBeat; slice; slice = slice.nextBeat) {
      for (const item of slice.highlightedBeats) {
        if (item.beat.voice.bar.staff !== staff || seen.has(item.beat.id))
          continue;
        seen.add(item.beat.id);
        const time = toSeconds(Math.round(played.start + item.playbackStart));
        for (const note of item.beat.notes) {
          if (!note.isStringed || note.isTieDestination) continue;
          const string = note.string - 1;
          const pitch = note.calculateRealValue(
            generator.applyTranspositionPitches,
            true,
          );
          if (
            pitch !==
            STANDARD_OPEN_MIDI[string] + chart.tuning[string] + note.fret
          )
            continue;
          const key = `${time}:${pitch}`;
          const candidates = positions.get(key) ?? [];
          candidates.push({ string, fret: note.fret });
          positions.set(key, candidates);
        }
      }
    }
  }
  const original: BassFretPosition[] = [];
  for (const note of chart.notes) {
    const position = positions.get(`${note.time}:${note.midi}`)?.shift();
    if (!position) return undefined;
    original.push(position);
  }
  return original;
}
