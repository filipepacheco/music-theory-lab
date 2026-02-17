import type { Song, SongStructure } from '@/types';
import type { SavedProgression } from '@/services/db';
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

export async function pushStructure(
  structure: SongStructure
): Promise<void> {
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
    { method: 'DELETE' }
  );
}

export async function pushDeleteSong(id: string): Promise<void> {
  const deviceId = getDeviceId();
  await fetch(
    `${API_BASE}/songs?id=${encodeURIComponent(id)}&device_id=${encodeURIComponent(deviceId)}`,
    { method: 'DELETE' }
  );
}

export async function pushDeleteStructure(id: string): Promise<void> {
  const deviceId = getDeviceId();
  await fetch(
    `${API_BASE}/structures?id=${encodeURIComponent(id)}&device_id=${encodeURIComponent(deviceId)}`,
    { method: 'DELETE' }
  );
}

// ---------------------------------------------------------------------------
// Pull
// ---------------------------------------------------------------------------

interface CloudProgression {
  id: string;
  name: string;
  description: string;
  steps: string;
  mode: string;
  preset_id: string;
  bpm: number;
  is_example: number;
  created_at: string;
}

interface CloudSong {
  id: string;
  title: string;
  artist: string;
  key_note: number;
  mode: string;
  original_bpm: number;
  preset_id: string;
  sections: string;
  created_at: string;
  updated_at: string;
}

interface CloudStructure {
  id: string;
  title: string;
  artist: string;
  bars: string;
  sections: string;
  created_at: string;
  updated_at: string;
}

export async function pullProgressions(): Promise<CloudProgression[]> {
  const deviceId = getDeviceId();
  const res = await fetch(
    `${API_BASE}/progressions?device_id=${encodeURIComponent(deviceId)}`
  );
  if (!res.ok) return [];
  return res.json();
}

export async function pullSongs(): Promise<CloudSong[]> {
  const deviceId = getDeviceId();
  const res = await fetch(
    `${API_BASE}/songs?device_id=${encodeURIComponent(deviceId)}`
  );
  if (!res.ok) return [];
  return res.json();
}

export async function pullStructures(): Promise<CloudStructure[]> {
  const deviceId = getDeviceId();
  const res = await fetch(
    `${API_BASE}/structures?device_id=${encodeURIComponent(deviceId)}`
  );
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
}): Promise<void> {
  const [cloudProgs, cloudSongs, cloudStructures] = await Promise.all([
    pullProgressions(),
    pullSongs(),
    pullStructures(),
  ]);

  // --- Progressions ---
  const localProgs = deps.getAllProgressions();
  const localProgIds = new Set(localProgs.map((p) => p.id));
  const cloudProgIds = new Set(cloudProgs.map((p) => p.id));

  // Cloud-only: insert locally
  for (const cp of cloudProgs) {
    if (!localProgIds.has(cp.id)) {
      deps.upsertProgressionLocal(cp);
    }
  }
  // Local-only: push to cloud
  for (const lp of localProgs) {
    if (!cloudProgIds.has(lp.id)) {
      pushProgression(lp).catch(() => {});
    }
  }

  // --- Songs (server wins by updated_at) ---
  const localSongs = deps.getAllSongs();
  const localSongMap = new Map(localSongs.map((s) => [s.id, s]));
  const cloudSongIds = new Set(cloudSongs.map((s) => s.id));

  for (const cs of cloudSongs) {
    const local = localSongMap.get(cs.id);
    if (!local) {
      deps.upsertSongLocal(cs);
    } else if (cs.updated_at > local.updatedAt) {
      deps.upsertSongLocal(cs);
    }
  }
  for (const ls of localSongs) {
    if (!cloudSongIds.has(ls.id)) {
      pushSong(ls).catch(() => {});
    }
  }

  // --- Structures (server wins by updated_at) ---
  const localStructures = deps.getAllStructures();
  const localStructMap = new Map(localStructures.map((s) => [s.id, s]));
  const cloudStructIds = new Set(cloudStructures.map((s) => s.id));

  for (const cs of cloudStructures) {
    const local = localStructMap.get(cs.id);
    if (!local) {
      deps.upsertStructureLocal(cs);
    } else if (cs.updated_at > local.updatedAt) {
      deps.upsertStructureLocal(cs);
    }
  }
  for (const ls of localStructures) {
    if (!cloudStructIds.has(ls.id)) {
      pushStructure(ls).catch(() => {});
    }
  }
}
