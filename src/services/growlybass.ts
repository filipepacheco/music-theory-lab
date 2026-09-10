import {
  resolveGrowlybassSample,
  type GrowlybassSamplePlan,
} from '@/utils/growlybass';

export const GROWLYBASS_RELEASE_SECONDS = 0.5;

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
  getStatus(): GrowlybassSamplerStatus;
  subscribe(listener: (status: GrowlybassSamplerStatus) => void): () => void;
}

interface GrowlybassSamplerDependencies<T> {
  load(url: string): Promise<T>;
  play(
    asset: T,
    plan: GrowlybassSamplePlan,
    duration: string,
    releaseSeconds: number,
  ): void;
}

export function createGrowlybassSampler<T>({
  load,
  play,
}: GrowlybassSamplerDependencies<T>): GrowlybassSampler {
  const cache = createGrowlybassAssetCache(load);
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
    getStatus() {
      return status;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
