import { importer, midi, Settings } from '@coderline/alphatab';
import {
  buildBassChart,
  STANDARD_OPEN_MIDI,
  type BassChart,
  type BassFretPosition,
} from '@/domain/bassChart';
import {
  midiToArrangement,
  pickBassChannel,
  tickToSeconds,
} from '@/domain/midiBassChart';
import {
  parseGpFile,
  gpParseErrorMessage,
  GpParseError,
} from '@/services/gpFile';
import { metadataFromFileName } from '@/services/midi/importMidi';
import { parseMidi, type MidiFile } from '@/services/midi/midiFile';

export function gpChartImportErrorMessage(error: unknown): string {
  if (error instanceof GpParseError) return gpParseErrorMessage(error);
  if (error instanceof Error && error.message === 'no-bass') {
    return 'Este arquivo Guitar Pro não tem notas além da bateria.';
  }
  return 'Não foi possível importar este arquivo Guitar Pro.';
}

/**
 * Export the score's playback order to MIDI before using the existing bass
 * adapter. alphaTab owns repeats, alternate endings, ties and tempo changes;
 * the same BassChart drives analysis and playback for every import format.
 * Keep the MIDI adapter's fingering and recover the score's original positions
 * on the same expanded playback timeline as an alternative practice view.
 */
export async function importGpChart(
  file: Blob & { name: string },
  now: Date = new Date(),
): Promise<{ chart: BassChart; audio: null }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  // Keep Biblioteca's .gp support aligned with the GP7/8 transcription flow.
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
  if (channel === null) throw new Error('no-bass');

  // Guitar Pro puts bends on a secondary channel. Keep those notes with the
  // selected bass part instead of silently losing them during channel choice.
  const track = score.tracks.find(
    (candidate) =>
      candidate.playbackInfo.primaryChannel === channel ||
      candidate.playbackInfo.secondaryChannel === channel,
  );
  if (track) {
    const channels = new Set([
      track.playbackInfo.primaryChannel,
      track.playbackInfo.secondaryChannel,
    ]);
    parsed.notes = parsed.notes.map((note) =>
      channels.has(note.channel) ? { ...note, channel } : note,
    );
  }

  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const id = Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
  const fallback = metadataFromFileName(file.name);
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
    id,
    source: 'gp',
    sourceFileName: file.name,
    importedAt: now.toISOString(),
    metadata: {
      ...fallback,
      title: score.title.trim() || fallback.title,
      artist: score.artist.trim() || fallback.artist,
      album: score.album.trim(),
    },
    arrangement: midiToArrangement(parsed, channel, importedTuning),
  });
  if (staff && importedTuning) {
    chart.originalFingering = recoverOriginalFingering(
      chart,
      parsed,
      generator,
      staff,
    );
  }
  return {
    chart,
    audio: null,
  };
}

/** Match by sounding pitch and playback onset, never by written bar number. */
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
          // Harmonics/ornaments whose sounding pitch differs from the written
          // fret cannot be represented faithfully by a plain fret position.
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
    // Never advertise invented fingering as the original GP transcription.
    if (!position) return undefined;
    original.push(position);
  }
  return original;
}
