import { importer, midi, model, Settings } from '@coderline/alphatab';
import {
  buildBassChart,
  STANDARD_OPEN_MIDI,
  type BassChart,
  type BassFretPosition,
} from '@/domain/bassChart';
import type { Chart, DrumDynamic } from '@/domain/drumChart';
import {
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
  const channel = pickBassChannel(parsed);
  if (channel === null && !hasDrumNotes(parsed)) throw new Error('no-parts');

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
  return { charts, audio: null };
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
