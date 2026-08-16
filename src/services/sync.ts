import type { Song, SongStructure } from '@/types';
import {
  mergeLastWriteWins,
  mergeProgressions,
  type CloudProgression,
  type CloudSong,
  type CloudStructure,
  type SavedProgression,
} from '@/domain/savedLibrary';
import { getDeviceId } from '@/services/deviceId';
const API_BASE = '/api';

// ---------------------------------------------------------------------------
// Push (fire-and-forget)
// ---------------------------------------------------------------------------

export async function pushProgression(prog: SavedProgression): Promise<void> {
  const deviceId = getDeviceId();
  await fetch(`${API_BASE}/progressions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      device_id: deviceId,
      records: [
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
      ],
    }),
  });
}

export async function pushSong(song: Song): Promise<void> {
  const deviceId = getDeviceId();
  await fetch(`${API_BASE}/songs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      device_id: deviceId,
      records: [
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
      ],
    }),
  });
}

export async function pushStructure(structure: SongStructure): Promise<void> {
  const deviceId = getDeviceId();
  await fetch(`${API_BASE}/structures`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      device_id: deviceId,
      records: [
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
      ],
    }),
  });
}

// ---------------------------------------------------------------------------
// Push delete
// ---------------------------------------------------------------------------

export async function pushDeleteProgression(id: string): Promise<void> {
  const deviceId = getDeviceId();
  await fetch(
    `${API_BASE}/progressions?id=${encodeURIComponent(id)}&device_id=${encodeURIComponent(deviceId)}`,
    { method: 'DELETE' },
  );
}

export async function pushDeleteSong(id: string): Promise<void> {
  const deviceId = getDeviceId();
  await fetch(
    `${API_BASE}/songs?id=${encodeURIComponent(id)}&device_id=${encodeURIComponent(deviceId)}`,
    { method: 'DELETE' },
  );
}

export async function pushDeleteStructure(id: string): Promise<void> {
  const deviceId = getDeviceId();
  await fetch(
    `${API_BASE}/structures?id=${encodeURIComponent(id)}&device_id=${encodeURIComponent(deviceId)}`,
    { method: 'DELETE' },
  );
}

// ---------------------------------------------------------------------------
// Pull
// ---------------------------------------------------------------------------

export async function pullProgressions(): Promise<CloudProgression[]> {
  const deviceId = getDeviceId();
  const res = await fetch(
    `${API_BASE}/progressions?device_id=${encodeURIComponent(deviceId)}`,
  );
  if (!res.ok) return [];
  return res.json();
}

export async function pullSongs(): Promise<CloudSong[]> {
  const deviceId = getDeviceId();
  const res = await fetch(
    `${API_BASE}/songs?device_id=${encodeURIComponent(deviceId)}`,
  );
  if (!res.ok) return [];
  return res.json();
}

export async function pullStructures(): Promise<CloudStructure[]> {
  const res = await fetch(`${API_BASE}/structures`);
  if (!res.ok) return [];
  return res.json();
}

// ---------------------------------------------------------------------------
// Full sync (called on init)
// ---------------------------------------------------------------------------

export async function syncAll(deps: {
  getAllProgressions: () => SavedProgression[];
  getAllSongs: () => Song[];
  getAllStructures: () => SongStructure[];
  upsertProgressionLocal: (r: CloudProgression) => void;
  upsertSongLocal: (r: CloudSong) => void;
  upsertStructureLocal: (r: CloudStructure) => void;
  persistDB: () => void;
}): Promise<void> {
  const [cloudProgs, cloudSongs, cloudStructures] = await Promise.all([
    pullProgressions(),
    pullSongs(),
    pullStructures(),
  ]);

  // --- Progressions ---
  const localProgs = deps.getAllProgressions();
  const progressionMerge = mergeProgressions(localProgs, cloudProgs);

  // Cloud-only: insert locally
  for (const cp of progressionMerge.cloudOnly) {
    deps.upsertProgressionLocal(cp);
  }
  // Local-only: push to cloud
  for (const lp of progressionMerge.localOnly) {
    pushProgression(lp).catch(() => {});
  }

  // --- Songs (server wins by updated_at) ---
  const localSongs = deps.getAllSongs();
  const songMerge = mergeLastWriteWins(localSongs, cloudSongs);
  for (const cs of songMerge.cloudToApply) {
    deps.upsertSongLocal(cs);
  }
  for (const ls of songMerge.localToPush) {
    pushSong(ls).catch(() => {});
  }

  // --- Structures (server wins by updated_at) ---
  const localStructures = deps.getAllStructures();
  const structureMerge = mergeLastWriteWins(localStructures, cloudStructures);
  for (const cs of structureMerge.cloudToApply) {
    deps.upsertStructureLocal(cs);
  }
  for (const ls of structureMerge.localToPush) {
    pushStructure(ls).catch(() => {});
  }

  // Single persist after all upserts (instead of per-upsert)
  deps.persistDB();
}
