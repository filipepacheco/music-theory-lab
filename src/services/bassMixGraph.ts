// Routes a media element through Web Audio so a practice mix can filter it.
// `createMediaElementSource` can run only once per element, and from then on
// the element sounds only through the graph, so the graph lives as long as
// the element and switching mixes just rewires its filters.

import { bassMixFilters, type BassMixMode } from '@/domain/bassMix';

export interface BassMixGraph {
  apply(mode: BassMixMode, crossoverHz: number): void;
  /** The context starts suspended outside a user gesture; call before play. */
  resume(): Promise<void>;
  dispose(): void;
}

let sharedContext: AudioContext | null = null;

function audioContext(): AudioContext {
  sharedContext ??= new AudioContext();
  return sharedContext;
}

export function createBassMixGraph(media: HTMLMediaElement): BassMixGraph {
  const context = audioContext();
  const source = context.createMediaElementSource(media);
  let filters: BiquadFilterNode[] = [];

  const disconnect = () => {
    source.disconnect();
    for (const filter of filters) filter.disconnect();
    filters = [];
  };

  return {
    apply(mode, crossoverHz) {
      disconnect();
      filters = bassMixFilters(mode, crossoverHz).map(
        (spec) => new BiquadFilterNode(context, spec),
      );
      const chain: AudioNode[] = [source, ...filters, context.destination];
      for (let i = 0; i < chain.length - 1; i += 1) {
        chain[i].connect(chain[i + 1]);
      }
    },
    resume: () =>
      context.state === 'suspended' ? context.resume() : Promise.resolve(),
    dispose: disconnect,
  };
}
