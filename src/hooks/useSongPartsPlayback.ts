import { useCallback, useEffect, useRef, useState } from 'react';
import type { LibraryAudio } from '@/components/library/useLibraryAudio';
import type { BassChart } from '@/domain/bassChart';
import type { ChartPart, ChartSummary } from '@/domain/chartSummary';
import { isDrumChart, type DrumChart } from '@/domain/drumChart';
import { drumPlaybackHits } from '@/domain/drumPlaybackSchedule';
import {
  NO_MUTES,
  partsSounding,
  type PartMutes,
  type PlaybackPart,
} from '@/domain/songPartsPlayback';
import { bassSynthNotes } from '@/services/bassSynthTransport';
import { partChartId } from '@/services/chartId';
import type { LibraryAudioState } from '@/services/libraryAudioSession';
import { ensureAudio, playbackEngine } from '@/services/playbackEngine';
import { rocksmithLibrary } from '@/services/rocksmithLibrary';
import {
  createSongPartsTransport,
  type SongPartsSession,
  type SongPartsVoice,
} from '@/services/songPartsTransport';

const SYNTH_VELOCITY = 0.6;

const engineVoice: SongPartsVoice = {
  prepare: async (bassMidi, samples) => {
    if (!(await ensureAudio())) throw new Error('audio unavailable');
    await Promise.all([
      playbackEngine.preloadBassNotes(bassMidi, SYNTH_VELOCITY),
      playbackEngine.preloadDrumSamples(samples),
    ]);
  },
  now: () => playbackEngine.now(),
  scheduleBass: (note, when) =>
    playbackEngine.scheduleBassNote(
      note.midi,
      SYNTH_VELOCITY,
      note.seconds,
      when,
      note.transposeSemitones ?? 0,
    ),
  scheduleDrum: (hit, when) => playbackEngine.scheduleDrumHit(hit, when),
  stop: (part) => {
    if (part !== 'drums') playbackEngine.stopBassNotes();
    if (part !== 'bass') playbackEngine.stopDrumHits();
  },
};

/** The two parts of one file, with the clock above the part on the screen. */
export interface SongPartsPlayback {
  /** The two parts play together on this clock. */
  active: boolean;
  audio: LibraryAudio;
  mutes: PartMutes;
  toggleMute: (part: PlaybackPart) => void;
  /** The bass part tells which line (and shift) it plays. */
  reportBass: (chart: BassChart, shift: number) => void;
  /** The open part tells whether a recording is linked to it. */
  reportRecording: (chartId: string, linked: boolean) => void;
}

interface Pair {
  bassId: string;
  drumId: string;
}

async function findPair(
  openId: string,
  openPart: ChartPart,
  charts: readonly ChartSummary[],
): Promise<Pair | null> {
  const ids = new Set(charts.map((c) => c.id));
  if (openPart === 'bass') {
    const drumId = await partChartId(openId, 'drums');
    return ids.has(drumId) ? { bassId: openId, drumId } : null;
  }
  for (const bass of charts.filter((c) => c.part === 'bass')) {
    if ((await partChartId(bass.id, 'drums')) === openId)
      return { bassId: bass.id, drumId: openId };
  }
  return null;
}

const IDLE: LibraryAudioState = {
  ready: false,
  playing: false,
  duration: 0,
  currentSeconds: 0,
};

/**
 * The bass and the drum samples on one clock for a song whose two parts come
 * from one file. The clock lives in the module, above the part, so a change
 * of part keeps the playback going. It is inactive (the parts play alone)
 * without a partner chart in the same file, or with a linked recording.
 */
export function useSongPartsPlayback(
  openId: string | null,
  openPart: ChartPart | null,
  songCharts: readonly ChartSummary[],
): SongPartsPlayback {
  const [pair, setPair] = useState<Pair | null>(null);
  const [loaded, setLoaded] = useState<{
    bass: BassChart | null;
    drums: DrumChart | null;
    partnerRecording: boolean;
  } | null>(null);
  const [openRecording, setOpenRecording] = useState(true);
  const [reported, setReported] = useState<{
    chart: BassChart;
    shift: number;
  } | null>(null);
  const [mutes, setMutes] = useState<PartMutes>(NO_MUTES);
  const [state, setState] = useState<LibraryAudioState>(IDLE);

  const mutesRef = useRef(mutes);
  const openPartRef = useRef(openPart);
  openPartRef.current = openPart;
  const transportRef = useRef<SongPartsSession | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const wasActive = useRef(false);

  const chartsKey = songCharts.map((c) => c.id).join(',');
  useEffect(() => {
    if (!openId || !openPart) {
      setPair(null);
      return;
    }
    let live = true;
    void findPair(openId, openPart, songCharts)
      .then((found) => {
        if (!live) return;
        // The same pair, seen from the other part, stays the same object.
        setPair((current) =>
          current &&
          found &&
          current.bassId === found.bassId &&
          current.drumId === found.drumId
            ? current
            : found,
        );
      })
      .catch(() => {
        if (live) setPair(null);
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId, openPart, chartsKey]);

  const bassId = pair?.bassId ?? null;
  const drumId = pair?.drumId ?? null;
  useEffect(() => {
    setLoaded(null);
    if (!bassId || !drumId) return;
    let live = true;
    void (async () => {
      const [bass, drums] = await Promise.all([
        rocksmithLibrary.getChart(bassId),
        rocksmithLibrary.getChart(drumId),
      ]);
      if (!live) return;
      setLoaded({
        bass: bass && !isDrumChart(bass) ? bass : null,
        drums: drums && isDrumChart(drums) ? drums : null,
        partnerRecording: false,
      });
    })().catch(() => {});
    return () => {
      live = false;
    };
  }, [bassId, drumId]);

  // A recording linked to the other part also silences the samples. It is
  // read again whenever the part on the screen changes.
  const partnerId = openId === bassId ? drumId : bassId;
  const hasLoaded = loaded !== null;
  // The mutes belong to one song: a part change keeps them, a new song resets.
  useEffect(() => {
    mutesRef.current = NO_MUTES;
    setMutes(NO_MUTES);
  }, [bassId]);
  useEffect(() => {
    if (!partnerId || !hasLoaded) return;
    let live = true;
    void rocksmithLibrary
      .getAudio(partnerId)
      .then((audio) => {
        if (!live) return;
        setLoaded((current) =>
          current ? { ...current, partnerRecording: audio !== null } : current,
        );
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [partnerId, openId, hasLoaded]);

  const reportBass = useCallback((chart: BassChart, shift: number) => {
    setReported((current) =>
      current && current.chart === chart && current.shift === shift
        ? current
        : { chart, shift },
    );
  }, []);
  const reportRecording = useCallback((_chartId: string, linked: boolean) => {
    setOpenRecording(linked);
  }, []);

  const useReported = !!reported && reported.chart.id === bassId;
  const bassChart = useReported ? reported.chart : (loaded?.bass ?? null);
  const shift = useReported ? reported.shift : 0;
  const drumsChart = loaded?.drums ?? null;
  const active =
    !!pair &&
    (openId === pair.bassId || openId === pair.drumId) &&
    !!bassChart &&
    !!drumsChart &&
    !loaded?.partnerRecording &&
    !openRecording;

  const bassRef = useRef(bassChart);
  bassRef.current = bassChart;
  const drumsRef = useRef(drumsChart);
  drumsRef.current = drumsChart;

  useEffect(() => {
    const previous = wasActive.current ? stateRef.current : null;
    wasActive.current = active;
    setState(IDLE);
    const bass = bassRef.current;
    const drums = drumsRef.current;
    if (!active || !bass || !drums) return;
    const transport = createSongPartsTransport(
      {
        bass: bassSynthNotes(bass.notes, shift),
        drums: drumPlaybackHits(drums.hits),
        durationSeconds: Math.max(
          bass.songLengthSeconds,
          drums.songLengthSeconds,
        ),
      },
      engineVoice,
      () =>
        partsSounding({
          open: openPartRef.current ?? 'bass',
          sameFile: true,
          recording: false,
          mutes: mutesRef.current,
        }),
      setState,
    );
    transportRef.current = transport;
    if (previous) {
      transport.seek(previous.currentSeconds);
      if (previous.playing) void transport.play().catch(() => {});
    }
    return () => {
      transport.dispose();
      if (transportRef.current === transport) transportRef.current = null;
    };
    // The chart objects are read from refs: a change of part or of fingering
    // gives new objects with the same sound and must not restart the clock.
  }, [active, bassId, drumId, shift]);

  const toggleMute = useCallback((part: PlaybackPart) => {
    mutesRef.current = {
      ...mutesRef.current,
      [part]: !mutesRef.current[part],
    };
    setMutes(mutesRef.current);
    transportRef.current?.muteChanged(part);
  }, []);

  const audio: LibraryAudio = {
    ...state,
    play: async () => {
      await transportRef.current?.play().catch(() => {});
    },
    pause: () => transportRef.current?.pause(),
    seek: (seconds) => transportRef.current?.seek(seconds),
  };
  return { active, audio, mutes, toggleMute, reportBass, reportRecording };
}
