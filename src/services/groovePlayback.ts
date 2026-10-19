import { DEFAULT_GROOVE_SUBDIVISION } from '@/constants/groove';
import {
  grooveHits,
  grooveHitsAtTick,
  grooveStepDuration,
} from '@/domain/grooveSchedule';
import type { ClockOwner, Transport } from '@/services/transport';
import type { DrumPiece, GroovePattern } from '@/types';

const GROOVE_OWNER: ClockOwner = { kind: 'groove', id: 'groove' };

export interface GroovePlaybackDeps {
  /** Get the audio and the drum samples ready; false when audio is blocked. */
  prepare(): Promise<boolean>;
  playHit(piece: DrumPiece, time: number): void;
  /** The tick for the UI (on the draw scheduler); -1 when the groove stops. */
  onTick(tick: number): void;
  /** The section that plays now, or null. */
  onSectionChange(sectionId: string | null): void;
  /** Silence the drum voices. */
  silence?(): void;
}

export interface GroovePlayRequest {
  groove: GroovePattern;
  bpm: number;
  sectionId: string | null;
}

export interface GroovePlayback {
  play(request: GroovePlayRequest): Promise<void>;
  /** Swap the pattern while it plays; the next tick uses it. */
  update(groove: GroovePattern): void;
  stop(): void;
  playingSectionId(): string | null;
}

function withSubdivision(groove: GroovePattern): GroovePattern {
  return { ...groove, subdivision: groove.subdivision ?? DEFAULT_GROOVE_SUBDIVISION };
}

/** Plays the groove that the caller gives it, on the shared transport. */
export function createGroovePlayback(
  transport: Transport,
  deps: GroovePlaybackDeps,
): GroovePlayback {
  let token = 0;
  let cancelRepeat: (() => void) | null = null;
  let current: GroovePattern | null = null;
  let sectionId: string | null = null;
  let tick = 0;

  const halt = () => {
    token += 1;
    cancelRepeat?.();
    cancelRepeat = null;
    current = null;
    tick = 0;
    deps.silence?.();
    deps.onTick(-1);
    if (sectionId !== null) {
      sectionId = null;
      deps.onSectionChange(null);
    }
  };

  const stop = () => {
    halt();
    transport.releaseClock(GROOVE_OWNER.id);
  };

  return {
    async play({ groove, bpm, sectionId: id }) {
      if (!grooveHits(groove).some((step) => step.length > 0)) return;

      stop();
      const mine = token;

      // The groove takes the clock; the transport stops the old player.
      await transport.takeClock(GROOVE_OWNER, { onRelease: halt });
      if (mine !== token) return;

      const ready = await deps.prepare();
      if (mine !== token) return;
      if (!ready) {
        stop();
        return;
      }

      transport.setTempo(bpm);
      current = withSubdivision(groove);
      tick = 0;
      sectionId = id;
      cancelRepeat = transport.repeat(
        grooveStepDuration(bpm, '32n'),
        (time) => {
          if (mine !== token || !current) return;
          const now = tick;
          for (const piece of grooveHitsAtTick(current, now)) {
            deps.playHit(piece, time);
          }
          transport.draw(() => {
            if (mine === token) deps.onTick(now);
          }, time);
          tick += 1;
        },
      );
      deps.onSectionChange(id);
    },

    update(groove) {
      if (current) current = withSubdivision(groove);
    },

    stop,

    playingSectionId: () => sectionId,
  };
}
