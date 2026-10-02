import {
  resolveGrowlybassSample,
  type GrowlybassSamplePlan,
} from '@/utils/growlybass';

export const GROWLYBASS_RELEASE_SECONDS = 0.5;
/** A sequenced line needs each note out of the way of the next one. */
export const GROWLYBASS_SEQUENCE_RELEASE_SECONDS = 0.08;

export interface GrowlybassAssetCache<T> {
  load(url: string): Promise<T>;
  size(): number;
}

export function createGrowlybassAssetCache<T>(
  loader: (url: string) => Promise<T>,
): GrowlybassAssetCache<T> {
  const assets = new Map<string, Promise<T>>();

  return {
    load(url) {
      const existing = assets.get(url);
      if (existing) return existing;

      const pending = loader(url).catch((error: unknown) => {
        assets.delete(url);
        throw error;
      });
      assets.set(url, pending);
      return pending;
    },
    size() {
      return assets.size;
    },
  };
}

export type GrowlybassSamplerStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface GrowlybassSampler {
  trigger(
    midiNote: number,
    velocity?: number,
    duration?: string,
  ): Promise<void>;
  /** Download and decode the samples these notes need. */
  preload(midiNotes: number[], velocity?: number): Promise<void>;
  /**
   * Start a note at `time` on the audio clock. Its sample must already be
   * loaded: a note cannot wait for a download and still land on the beat, so
   * one that is not ready is skipped.
   */
  schedule(
    midiNote: number,
    velocity: number,
    durationSeconds: number,
    time: number,
  ): void;
  getStatus(): GrowlybassSamplerStatus;
  subscribe(listener: (status: GrowlybassSamplerStatus) => void): () => void;
}

interface GrowlybassSamplerDependencies<T> {
  load(url: string): Promise<T>;
  play(
    asset: T,
    plan: GrowlybassSamplePlan,
    duration: string | number,
    releaseSeconds: number,
    time?: number,
  ): void;
}

export function createGrowlybassSampler<T>({
  load,
  play,
}: GrowlybassSamplerDependencies<T>): GrowlybassSampler {
  const loaded = new Map<string, T>();
  const cache = createGrowlybassAssetCache(async (url: string) => {
    const asset = await load(url);
    loaded.set(url, asset);
    return asset;
  });
  const listeners = new Set<(status: GrowlybassSamplerStatus) => void>();
  let status: GrowlybassSamplerStatus = 'idle';

  function setStatus(next: GrowlybassSamplerStatus) {
    status = next;
    listeners.forEach((listener) => listener(status));
  }

  return {
    async trigger(midiNote, velocity = 0.6, duration = '8n') {
      const plan = resolveGrowlybassSample(midiNote, velocity);
      setStatus('loading');
      try {
        const asset = await cache.load(plan.url);
        setStatus('ready');
        play(asset, plan, duration, GROWLYBASS_RELEASE_SECONDS);
      } catch (error) {
        setStatus('error');
        throw error;
      }
    },
    async preload(midiNotes, velocity = 0.6) {
      const urls = new Set(
        midiNotes.map((note) => resolveGrowlybassSample(note, velocity).url),
      );
      setStatus('loading');
      try {
        await Promise.all([...urls].map((url) => cache.load(url)));
        setStatus('ready');
      } catch (error) {
        setStatus('error');
        throw error;
      }
    },
    schedule(midiNote, velocity, durationSeconds, time) {
      const plan = resolveGrowlybassSample(midiNote, velocity);
      const asset = loaded.get(plan.url);
      if (asset === undefined) return;
      play(
        asset,
        plan,
        durationSeconds,
        GROWLYBASS_SEQUENCE_RELEASE_SECONDS,
        time,
      );
    },
    getStatus() {
      return status;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
