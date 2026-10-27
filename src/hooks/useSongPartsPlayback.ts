import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LibraryAudio } from '@/components/library/useLibraryAudio';
import type { BassChart } from '@/domain/bassChart';
import type { ChartPart, ChartSummary } from '@/domain/chartSummary';
import { isBassChart, isDrumChart, type DrumChart } from '@/domain/drumChart';
import { drumPlaybackHits } from '@/domain/drumPlaybackSchedule';
import { isGuitarChart, type GuitarChart } from '@/domain/guitarChart';
import {
  guitarSynthNotes,
  type GuitarSynthNote,
} from '@/domain/guitarPlayback';
import {
  transposeGuitarChart,
  transposeVocalChart,
} from '@/domain/partsTransposition';
import { isVocalChart, type VocalChart } from '@/domain/vocalChart';
import { vocalSynthNotes, type VocalSynthNote } from '@/domain/vocalPlayback';
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
const GUITAR_VELOCITY = 0.45;
const VOCAL_VELOCITY = 0.35;

/** The voice of the engine. The key sets hold the mute keys of the charts. */
const engineVoice = (
  guitarKeys: ReadonlySet<string>,
  vocalKeys: ReadonlySet<string>,
): SongPartsVoice => ({
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
  scheduleLane: (key, event, when) => {
    if (vocalKeys.has(key)) {
      const vocal = event as VocalSynthNote;
      playbackEngine.scheduleVocalNote(
        key,
        vocal.midi,
        VOCAL_VELOCITY,
        vocal.seconds,
        when,
      );
      return;
    }
    if (!guitarKeys.has(key)) return;
    const note = event as GuitarSynthNote;
    playbackEngine.scheduleGuitarNote(
      key,
      note.midi,
      GUITAR_VELOCITY,
      note.seconds,
      when,
    );
  },
  stop: (part) => {
    if (part === undefined || part === 'bass') playbackEngine.stopBassNotes();
    if (part === undefined || part === 'drums') playbackEngine.stopDrumHits();
    if (part === undefined) {
      if (guitarKeys.size > 0) playbackEngine.stopGuitarNotes();
      if (vocalKeys.size > 0) playbackEngine.stopVocalNotes();
    } else if (guitarKeys.has(part)) playbackEngine.stopGuitarNotes(part);
    else if (vocalKeys.has(part)) playbackEngine.stopVocalNotes(part);
  },
});

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
  const openGuitar =
    openPart === 'guitar' ? charts.find((c) => c.id === openId) : undefined;
  for (const bass of charts.filter((c) => c.part === 'bass')) {
    const drumId = await partChartId(bass.id, 'drums');
    if (drumId === openId)
      return {
        bassId: bass.id,
        drumId: openId,
        laneIds: await sameFileLaneIds(bass.id, charts),
      };
    if (
      openGuitar?.trackIndex !== undefined &&
      ids.has(drumId) &&
      (await partChartId(bass.id, 'guitar', openGuitar.trackIndex)) === openId
    )
      return {
        bassId: bass.id,
        drumId,
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
    guitars: GuitarChart[];
    vocals: VocalChart[];
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
  const laneKey = pair?.laneIds.join(',') ?? '';
  useEffect(() => {
    setLoaded(null);
    if (!bassId || !drumId) return;
    let live = true;
    void (async () => {
      const [bass, drums, lanes] = await Promise.all([
        rocksmithLibrary.getChart(bassId),
        rocksmithLibrary.getChart(drumId),
        Promise.all(
          (laneKey ? laneKey.split(',') : []).map((id) =>
            rocksmithLibrary.getChart(id),
          ),
        ),
      ]);
      if (!live) return;
      setLoaded({
        bass: bass && isBassChart(bass) ? bass : null,
        drums: drums && isDrumChart(drums) ? drums : null,
        guitars: lanes.flatMap((chart) =>
          chart && isGuitarChart(chart) ? [chart] : [],
        ),
        vocals: lanes.flatMap((chart) =>
          chart && isVocalChart(chart) ? [chart] : [],
        ),
        partnerRecording: false,
      });
    })().catch(() => {});
    return () => {
      live = false;
    };
  }, [bassId, drumId, laneKey]);

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
    (openId === pair.bassId ||
      openId === pair.drumId ||
      pair.laneIds.includes(openId ?? '')) &&
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
  const guitarCharts = useMemo(
    () => loaded?.guitars.map((chart) => transposeGuitarChart(chart, shift)),
    [loaded, shift],
  );
  const guitarsRef = useRef(guitarCharts);
  guitarsRef.current = guitarCharts;
  const vocalCharts = useMemo(
    () => loaded?.vocals.map((chart) => transposeVocalChart(chart, shift)),
    [loaded, shift],
  );
  const vocalsRef = useRef(vocalCharts);
  vocalsRef.current = vocalCharts;
  const vocalSound = (vocalCharts ?? [])
    .map(
      (chart) =>
        `${chart.id}:${chart.notes.map((n) => `${n.time}.${n.midi}`).join(',')}`,
    )
    .join(';');
  // A new chart object with the same notes keeps the clock.
  const guitarSound = (guitarCharts ?? [])
    .map(
      (chart) =>
        `${chart.id}:${chart.notes.map((n) => `${n.time}.${n.midi}`).join(',')}`,
    )
    .join(';');

  useEffect(() => {
    const previous = wasActive.current ? stateRef.current : null;
    wasActive.current = active;
    setState(IDLE);
    const bass = bassRef.current;
    const drums = drumsRef.current;
    if (!active || !bass || !drums) return;
    const guitars = guitarsRef.current ?? [];
    const vocals = vocalsRef.current ?? [];
    const keys = [
      'bass',
      'drums',
      ...guitars.map((chart) => chart.id),
      ...vocals.map((chart) => chart.id),
    ];
    const transport = createSongPartsTransport(
      {
        bass: bassNotesRef.current,
        drums: drumPlaybackHits(drums.hits),
        lanes: [
          ...guitars.map((chart) => ({
            key: chart.id,
            events: guitarSynthNotes(chart.notes) as { time: number }[],
          })),
          ...vocals.map((chart) => ({
            key: chart.id,
            events: vocalSynthNotes(chart.notes) as { time: number }[],
          })),
        ],
        durationSeconds: Math.max(
          bass.songLengthSeconds,
          drums.songLengthSeconds,
          ...guitars.map((chart) => chart.songLengthSeconds),
          ...vocals.map((chart) => chart.songLengthSeconds),
        ),
      },
      engineVoice(
        new Set(guitars.map((chart) => chart.id)),
        new Set(vocals.map((chart) => chart.id)),
      ),
      () =>
        partsSounding({
          open: openPartRef.current ?? 'bass',
          sameFile: true,
          recording: false,
          mutes: mutesRef.current,
          keys,
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
  }, [active, bassId, drumId, shift, voicing, bassSound, guitarSound, vocalSound]);

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
