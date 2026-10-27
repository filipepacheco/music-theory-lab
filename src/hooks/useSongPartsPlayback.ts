import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LibraryAudio } from '@/components/library/useLibraryAudio';
import type { BassChart } from '@/domain/bassChart';
import type { ChartPart, ChartSummary } from '@/domain/chartSummary';
import { isDrumChart, type DrumChart } from '@/domain/drumChart';
import { drumPlaybackHits } from '@/domain/drumPlaybackSchedule';
import {
  muteControls,
  NO_MUTES,
  partsSounding,
  type MuteControl,
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
    if (part === undefined || part === 'bass') playbackEngine.stopBassNotes();
    if (part === undefined || part === 'drums') playbackEngine.stopDrumHits();
  },
};

export interface SongPartsPlayback {
  active: boolean;
  audio: LibraryAudio;
  mutes: PartMutes;
  /** One mute control for each chart of the file on the clock. */
  controls: MuteControl[];
  toggleMute: (part: PlaybackPart) => void;
  reportBass: (chart: BassChart, shift: number, voicing?: string) => void;
  reportRecording: (chartId: string, linked: boolean) => void;
}

interface Pair {
  bassId: string;
  drumId: string;
  /** Ids of the guitar and vocal charts of the same file. */
  laneIds: string[];
}

async function sameFileLaneIds(
  bassId: string,
  charts: readonly ChartSummary[],
): Promise<string[]> {
  const found: string[] = [];
  for (const chart of charts) {
    if (chart.part !== 'guitar' && chart.part !== 'vocals') continue;
    if (chart.trackIndex === undefined) continue;
    if ((await partChartId(bassId, chart.part, chart.trackIndex)) === chart.id)
      found.push(chart.id);
  }
  return found;
}

async function findPair(
  openId: string,
  openPart: ChartPart,
  charts: readonly ChartSummary[],
): Promise<Pair | null> {
  const ids = new Set(charts.map((c) => c.id));
  if (openPart === 'bass') {
    const drumId = await partChartId(openId, 'drums');
    return ids.has(drumId)
      ? {
          bassId: openId,
          drumId,
          laneIds: await sameFileLaneIds(openId, charts),
        }
      : null;
  }
  for (const bass of charts.filter((c) => c.part === 'bass')) {
    if ((await partChartId(bass.id, 'drums')) === openId)
      return {
        bassId: bass.id,
        drumId: openId,
        laneIds: await sameFileLaneIds(bass.id, charts),
      };
  }
  return null;
}

const IDLE: LibraryAudioState = {
  ready: false,
  playing: false,
  duration: 0,
  currentSeconds: 0,
};

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
    voicing: string;
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

  const songChartsRef = useRef(songCharts);
  songChartsRef.current = songCharts;
  const chartsKey = songCharts.map((c) => c.id).join(',');
  useEffect(() => {
    if (!openId || !openPart) {
      setPair(null);
      return;
    }
    let live = true;
    void findPair(openId, openPart, songChartsRef.current)
      .then((found) => {
        if (!live) return;
        setPair((current) =>
          current &&
          found &&
          current.bassId === found.bassId &&
          current.drumId === found.drumId &&
          current.laneIds.join(',') === found.laneIds.join(',')
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

  const partnerId = openId === bassId ? drumId : bassId;
  const hasLoaded = loaded !== null;
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

  const reportBass = useCallback(
    (chart: BassChart, shift: number, voicing = '') => {
      setReported((current) =>
        current && current.chart === chart && current.shift === shift
          ? current
          : { chart, shift, voicing },
      );
    },
    [],
  );
  const openIdRef = useRef(openId);
  openIdRef.current = openId;
  const reportRecording = useCallback((chartId: string, linked: boolean) => {
    // A late report of the part that was open before must not count.
    if (chartId === openIdRef.current) setOpenRecording(linked);
  }, []);

  const useReported = !!reported && reported.chart.id === bassId;
  const bassChart = useReported ? reported.chart : (loaded?.bass ?? null);
  const shift = useReported ? reported.shift : 0;
  const voicing = useReported ? reported.voicing : '';
  const drumsChart = loaded?.drums ?? null;
  const active =
    !!pair &&
    (openId === pair.bassId || openId === pair.drumId) &&
    !!bassChart &&
    !!drumsChart &&
    !loaded?.partnerRecording &&
    !openRecording;

  const bassNotes = useMemo(
    () => (bassChart ? bassSynthNotes(bassChart.notes, shift) : []),
    [bassChart, shift],
  );
  // A new chart object with the same sound keeps the clock; new notes do not.
  const bassSound = useMemo(
    () =>
      bassNotes
        .map(
          (n) =>
            `${n.time}:${n.midi}:${n.seconds}:${n.transposeSemitones ?? 0}`,
        )
        .join(','),
    [bassNotes],
  );
  const bassRef = useRef(bassChart);
  bassRef.current = bassChart;
  const bassNotesRef = useRef(bassNotes);
  bassNotesRef.current = bassNotes;
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
        bass: bassNotesRef.current,
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
  }, [active, bassId, drumId, shift, voicing, bassSound]);

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
  const laneKey = pair?.laneIds.join(',') ?? '';
  const controls = useMemo(
    () =>
      muteControls(
        pair
          ? songChartsRef.current.filter(
              (c) =>
                c.id === pair.bassId ||
                c.id === pair.drumId ||
                pair.laneIds.includes(c.id),
            )
          : [],
      ),
    [bassId, drumId, laneKey, chartsKey],
  );
  return {
    active,
    audio,
    mutes,
    controls,
    toggleMute,
    reportBass,
    reportRecording,
  };
}
