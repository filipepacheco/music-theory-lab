import type { Song, SongStructure } from '@/types';
import {
  mergeLastWriteWins,
  mergeProgressions,
  type CloudProgression,
  type CloudSong,
  type CloudStructure,
  type LastWriteWinsMerge,
  type SavedProgression,
} from '@/domain/syncMerge';
import { getDeviceId } from '@/services/deviceId';

const API_BASE = '/api';

function deviceQuery(): string {
  return `device_id=${encodeURIComponent(getDeviceId())}`;
}

async function postRecords(
  path: string,
  records: Record<string, unknown>[],
): Promise<void> {
  await fetch(`${API_BASE}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      device_id: getDeviceId(),
      records,
    }),
  });
}

async function deleteRecord(path: string, id: string): Promise<void> {
  await fetch(
    `${API_BASE}/${path}?id=${encodeURIComponent(id)}&${deviceQuery()}`,
    { method: 'DELETE' },
  );
}

async function pullRows<T>(path: string, withDevice = true): Promise<T[]> {
  const query = withDevice ? `?${deviceQuery()}` : '';
  const res = await fetch(`${API_BASE}/${path}${query}`);
  if (!res.ok) return [];
  return res.json();
}

// ---------------------------------------------------------------------------
// Push (fire-and-forget from callers)
// ---------------------------------------------------------------------------

export async function pushProgression(prog: SavedProgression): Promise<void> {
  await postRecords('progressions', [
    {
      id: prog.id,
      name: prog.name,
      description: prog.description,
      steps: JSON.stringify(prog.steps),
      mode: prog.mode,
      preset_id: prog.presetId,
      bpm: prog.bpm,
      is_example: prog.isExample ? 1 : 0,
      created_at: prog.createdAt,
    },
  ]);
}

export async function pushSong(song: Song): Promise<void> {
  await postRecords('songs', [
    {
      id: song.id,
      title: song.title,
      artist: song.artist,
      key_note: song.key,
      mode: song.mode,
      original_bpm: song.originalBpm,
      preset_id: song.presetId,
      sections: JSON.stringify(song.sections),
      created_at: song.createdAt,
      updated_at: song.updatedAt,
    },
  ]);
}

export async function pushStructure(structure: SongStructure): Promise<void> {
  await postRecords('structures', [
    {
      id: structure.id,
      title: structure.title,
      artist: structure.artist,
      bpm: structure.bpm,
      bars: JSON.stringify(structure.bars),
      sections: JSON.stringify(structure.sections),
      created_at: structure.createdAt,
      updated_at: structure.updatedAt,
    },
  ]);
}

export async function pushDeleteProgression(id: string): Promise<void> {
  await deleteRecord('progressions', id);
}

export async function pushDeleteSong(id: string): Promise<void> {
  await deleteRecord('songs', id);
}

export async function pushDeleteStructure(id: string): Promise<void> {
  await deleteRecord('structures', id);
}

// ---------------------------------------------------------------------------
// Pull
// ---------------------------------------------------------------------------

export function pullProgressions(): Promise<CloudProgression[]> {
  return pullRows<CloudProgression>('progressions');
}

export function pullSongs(): Promise<CloudSong[]> {
  // Transcriptions are shared globally across devices — no device filter.
  return pullRows<CloudSong>('songs', false);
}

export function pullStructures(): Promise<CloudStructure[]> {
  return pullRows<CloudStructure>('structures');
}

// ---------------------------------------------------------------------------
// Full sync
// ---------------------------------------------------------------------------

/** What sync needs from one persisted collection. */
export interface SyncCollection<Local, Cloud> {
  listLocal: () => Local[];
  applyCloud: (record: Cloud) => void;
  push: (record: Local) => Promise<void>;
}

export interface SyncDeps {
  progressions: SyncCollection<SavedProgression, CloudProgression>;
  songs: SyncCollection<Song, CloudSong>;
  structures: SyncCollection<SongStructure, CloudStructure>;
  /** Single flush after all cloud upserts. */
  persist: () => void;
}

function applyLastWriteWins<
  Local extends { id: string; updatedAt: string },
  Cloud extends { id: string; updated_at: string },
>(
  collection: SyncCollection<Local, Cloud>,
  merge: LastWriteWinsMerge<Local, Cloud>,
): void {
  for (const record of merge.cloudToApply) {
    collection.applyCloud(record);
  }
  for (const record of merge.localToPush) {
    collection.push(record).catch(() => {});
  }
}

/** Bidirectional merge: union for progressions, last-write-wins elsewhere. */
export async function syncAll(deps: SyncDeps): Promise<void> {
  const [cloudProgs, cloudSongs, cloudStructures] = await Promise.all([
    pullProgressions(),
    pullSongs(),
    pullStructures(),
  ]);

  const progressionMerge = mergeProgressions(
    deps.progressions.listLocal(),
    cloudProgs,
  );
  for (const record of progressionMerge.cloudOnly) {
    deps.progressions.applyCloud(record);
  }
  for (const record of progressionMerge.localOnly) {
    deps.progressions.push(record).catch(() => {});
  }

  applyLastWriteWins(
    deps.songs,
    mergeLastWriteWins(deps.songs.listLocal(), cloudSongs),
  );
  applyLastWriteWins(
    deps.structures,
    mergeLastWriteWins(deps.structures.listLocal(), cloudStructures),
  );

  // Single persist after all upserts (instead of per-upsert)
  deps.persist();
}
