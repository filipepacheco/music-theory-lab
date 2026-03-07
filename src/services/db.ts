import initSqlJs, { type Database } from 'sql.js';
import {
  PROGRESSION_EXAMPLES,
  type ProgressionStep,
} from '@/constants/progressions';
import type {
  Song,
  SongSection,
  SongStructure,
  StructureBar,
  StructureSection,
} from '@/types';
import { STRUCTURE_PALETTE } from '@/constants/structureColors';
import { SECTION_LABELS, SECTION_COLORS } from '@/constants/songSections';
import {
  pushProgression,
  pushSong,
  pushStructure,
  pushDeleteProgression,
  pushDeleteSong,
  pushDeleteStructure,
  syncAll,
} from '@/services/sync';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SavedProgression {
  id: string;
  name: string;
  description: string;
  steps: ProgressionStep[];
  mode: 'major' | 'minor';
  presetId: string;
  bpm: number;
  isExample: boolean;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// IndexedDB helpers (raw Uint8Array storage)
// ---------------------------------------------------------------------------

const IDB_NAME = 'music-theory-lab';
const IDB_STORE = 'db';
const IDB_KEY = 'sqlite';

function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function loadFromIDB(): Promise<Uint8Array | null> {
  return new Promise((resolve, reject) => {
    openIDB().then((idb) => {
      const tx = idb.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(IDB_KEY);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    }, reject);
  });
}

function saveToIDB(data: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    openIDB().then((idb) => {
      const tx = idb.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      store.put(data, IDB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    }, reject);
  });
}

// ---------------------------------------------------------------------------
// Module-level singleton
// ---------------------------------------------------------------------------

let db: Database | null = null;
let initPromise: Promise<void> | null = null;
let syncPromise: Promise<void> | null = null;

function persist() {
  if (!db) return;
  const data = db.export();
  saveToIDB(data);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function initDB(): Promise<void> {
  if (db) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const SQL = await initSqlJs({
      locateFile: () => '/sql-wasm.wasm',
    });

    const saved = await loadFromIDB();
    db = saved ? new SQL.Database(saved) : new SQL.Database();

    db.run(`
      CREATE TABLE IF NOT EXISTS saved_progressions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        steps TEXT NOT NULL,
        mode TEXT NOT NULL CHECK(mode IN ('major', 'minor')),
        preset_id TEXT NOT NULL,
        bpm INTEGER NOT NULL,
        is_example INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS songs (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        artist TEXT NOT NULL DEFAULT '',
        key_note INTEGER NOT NULL DEFAULT 0,
        mode TEXT NOT NULL CHECK(mode IN ('major', 'minor')),
        original_bpm INTEGER NOT NULL DEFAULT 120,
        preset_id TEXT NOT NULL DEFAULT 'piano',
        sections TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS structures (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        artist TEXT NOT NULL DEFAULT '',
        bars TEXT NOT NULL DEFAULT '[]',
        sections TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    // Seed examples on first run
    const [{ values }] = db.exec(
      "SELECT COUNT(*) FROM saved_progressions WHERE is_example = 1"
    );
    const exampleCount = (values[0]?.[0] as number) ?? 0;

    if (exampleCount === 0) {
      const stmt = db.prepare(
        `INSERT INTO saved_progressions (id, name, description, steps, mode, preset_id, bpm, is_example)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)`
      );
      for (const ex of PROGRESSION_EXAMPLES) {
        stmt.run([
          ex.id,
          ex.name,
          ex.description,
          JSON.stringify(ex.steps),
          ex.mode,
          ex.presetId,
          ex.bpm,
        ]);
      }
      stmt.free();
      persist();
    }

    // Background sync (does not block init)
    syncPromise = syncAll({
      getAllProgressions,
      getAllSongs,
      getAllStructures,
      upsertProgressionLocal,
      upsertSongLocal,
      upsertStructureLocal,
      persistDB: persist,
    }).catch(() => {});
  })();

  return initPromise;
}

/** Resolves when background cloud sync is done (or immediately if no sync). */
export function waitForSync(): Promise<void> {
  return syncPromise ?? Promise.resolve();
}

export function getAllProgressions(
  mode?: 'major' | 'minor'
): SavedProgression[] {
  if (!db) return [];

  const sql = mode
    ? `SELECT * FROM saved_progressions WHERE mode = ? ORDER BY is_example DESC, created_at ASC`
    : `SELECT * FROM saved_progressions ORDER BY is_example DESC, created_at ASC`;

  const stmt = db.prepare(sql);
  if (mode) stmt.bind([mode]);
  const results: SavedProgression[] = [];

  while (stmt.step()) {
    const row = stmt.getAsObject();
    results.push({
      id: row.id as string,
      name: row.name as string,
      description: row.description as string,
      steps: JSON.parse(row.steps as string) as ProgressionStep[],
      mode: row.mode as 'major' | 'minor',
      presetId: row.preset_id as string,
      bpm: row.bpm as number,
      isExample: row.is_example === 1,
      createdAt: row.created_at as string,
    });
  }
  stmt.free();
  return results;
}

export function saveProgression(prog: {
  name: string;
  description: string;
  steps: ProgressionStep[];
  mode: 'major' | 'minor';
  presetId: string;
  bpm: number;
}): void {
  if (!db) return;

  const id = crypto.randomUUID();
  const stmt = db.prepare(
    `INSERT INTO saved_progressions (id, name, description, steps, mode, preset_id, bpm, is_example)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0)`
  );
  try {
    stmt.run([
      id,
      prog.name,
      prog.description || '',
      JSON.stringify(prog.steps),
      prog.mode,
      prog.presetId,
      prog.bpm,
    ]);
  } finally {
    stmt.free();
  }
  persist();

  // Fire-and-forget cloud sync
  const saved = getProgressionById(id);
  if (saved) pushProgression(saved).catch(() => {});
}

export function deleteProgression(id: string): void {
  if (!db) return;
  const stmt = db.prepare(
    `DELETE FROM saved_progressions WHERE id = ? AND is_example = 0`
  );
  try {
    stmt.run([id]);
  } finally {
    stmt.free();
  }
  persist();

  // Fire-and-forget cloud sync
  pushDeleteProgression(id).catch(() => {});
}

// ---------------------------------------------------------------------------
// Songs CRUD
// ---------------------------------------------------------------------------

export function getAllSongs(): Song[] {
  if (!db) return [];

  const stmt = db.prepare(
    `SELECT * FROM songs ORDER BY updated_at DESC`
  );
  const results: Song[] = [];

  while (stmt.step()) {
    const row = stmt.getAsObject();
    results.push({
      id: row.id as string,
      title: row.title as string,
      artist: row.artist as string,
      key: row.key_note as number,
      mode: row.mode as 'major' | 'minor',
      originalBpm: row.original_bpm as number,
      presetId: row.preset_id as string,
      sections: JSON.parse(row.sections as string) as SongSection[],
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    });
  }
  stmt.free();
  return results;
}

export function saveSong(song: {
  title: string;
  artist: string;
  key: number;
  mode: 'major' | 'minor';
  originalBpm: number;
  presetId: string;
  sections: SongSection[];
}): string {
  if (!db) return '';

  const id = crypto.randomUUID();
  const stmt = db.prepare(
    `INSERT INTO songs (id, title, artist, key_note, mode, original_bpm, preset_id, sections)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  try {
    stmt.run([
      id,
      song.title,
      song.artist || '',
      song.key,
      song.mode,
      song.originalBpm,
      song.presetId,
      JSON.stringify(song.sections),
    ]);
  } finally {
    stmt.free();
  }
  persist();

  // Fire-and-forget cloud sync
  const saved = getSongById(id);
  if (saved) pushSong(saved).catch(() => {});

  return id;
}

export function updateSong(
  id: string,
  updates: Partial<{
    title: string;
    artist: string;
    key: number;
    mode: 'major' | 'minor';
    originalBpm: number;
    presetId: string;
    sections: SongSection[];
  }>
): void {
  if (!db) return;

  const fields: string[] = [];
  const values: (string | number)[] = [];

  if (updates.title !== undefined) {
    fields.push('title = ?');
    values.push(updates.title);
  }
  if (updates.artist !== undefined) {
    fields.push('artist = ?');
    values.push(updates.artist);
  }
  if (updates.key !== undefined) {
    fields.push('key_note = ?');
    values.push(updates.key);
  }
  if (updates.mode !== undefined) {
    fields.push('mode = ?');
    values.push(updates.mode);
  }
  if (updates.originalBpm !== undefined) {
    fields.push('original_bpm = ?');
    values.push(updates.originalBpm);
  }
  if (updates.presetId !== undefined) {
    fields.push('preset_id = ?');
    values.push(updates.presetId);
  }
  if (updates.sections !== undefined) {
    fields.push('sections = ?');
    values.push(JSON.stringify(updates.sections));
  }

  if (fields.length === 0) return;

  fields.push("updated_at = datetime('now')");
  values.push(id);

  const stmt = db.prepare(
    `UPDATE songs SET ${fields.join(', ')} WHERE id = ?`
  );
  try {
    stmt.run(values);
  } finally {
    stmt.free();
  }
  persist();

  // Fire-and-forget cloud sync
  const saved = getSongById(id);
  if (saved) pushSong(saved).catch(() => {});
}

export function deleteSong(id: string): void {
  if (!db) return;
  const stmt = db.prepare(`DELETE FROM songs WHERE id = ?`);
  try {
    stmt.run([id]);
  } finally {
    stmt.free();
  }
  persist();

  // Fire-and-forget cloud sync
  pushDeleteSong(id).catch(() => {});
}

// ---------------------------------------------------------------------------
// Structures CRUD
// ---------------------------------------------------------------------------

/** Migrate legacy section format (type+customLabel) to new (name+color) */
interface LegacySection {
  id: string;
  type?: string;
  customLabel?: string;
  name?: string;
  color?: string;
  barIds: string[];
  repeatOf?: string;
  comment?: string;
}

function migrateSection(raw: LegacySection): StructureSection {
  if (raw.name !== undefined && raw.color !== undefined) {
    return raw as StructureSection;
  }
  const sectionType = raw.type ?? 'custom';
  return {
    id: raw.id,
    name: sectionType === 'custom' && raw.customLabel
      ? raw.customLabel
      : (SECTION_LABELS[sectionType as keyof typeof SECTION_LABELS] ?? sectionType),
    color: SECTION_COLORS[sectionType as keyof typeof SECTION_COLORS] ?? STRUCTURE_PALETTE[0],
    barIds: raw.barIds,
    repeatOf: raw.repeatOf,
    comment: raw.comment,
  };
}

function migrateStructureData(
  bars: StructureBar[],
  rawSections: LegacySection[],
): { bars: StructureBar[]; sections: StructureSection[] } {
  const sections = rawSections.map(migrateSection);
  const assignedIds = new Set(sections.flatMap((s) => s.barIds));
  const unassigned = bars.filter((b) => !assignedIds.has(b.id));
  if (unassigned.length > 0) {
    sections.push({
      id: crypto.randomUUID(),
      name: 'Sem secao',
      color: '#9ca3af',
      barIds: unassigned.map((b) => b.id),
    });
  }
  return { bars, sections };
}

export function getAllStructures(): SongStructure[] {
  if (!db) return [];

  const stmt = db.prepare(
    `SELECT * FROM structures ORDER BY updated_at DESC`
  );
  const results: SongStructure[] = [];

  while (stmt.step()) {
    const row = stmt.getAsObject();
    const rawBars = JSON.parse(row.bars as string) as StructureBar[];
    const rawSections = JSON.parse(row.sections as string) as LegacySection[];
    const migrated = migrateStructureData(rawBars, rawSections);
    results.push({
      id: row.id as string,
      title: row.title as string,
      artist: row.artist as string,
      bars: migrated.bars,
      sections: migrated.sections,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    });
  }
  stmt.free();
  return results;
}

export function saveStructure(structure: {
  title: string;
  artist: string;
  bars: StructureBar[];
  sections: StructureSection[];
}): string {
  if (!db) return '';

  const id = crypto.randomUUID();
  const stmt = db.prepare(
    `INSERT INTO structures (id, title, artist, bars, sections)
     VALUES (?, ?, ?, ?, ?)`
  );
  try {
    stmt.run([
      id,
      structure.title,
      structure.artist || '',
      JSON.stringify(structure.bars),
      JSON.stringify(structure.sections),
    ]);
  } finally {
    stmt.free();
  }
  persist();

  // Fire-and-forget cloud sync
  const saved = getStructureById(id);
  if (saved) pushStructure(saved).catch(() => {});

  return id;
}

export function updateStructure(
  id: string,
  updates: Partial<{
    title: string;
    artist: string;
    bars: StructureBar[];
    sections: StructureSection[];
  }>
): void {
  if (!db) return;

  const fields: string[] = [];
  const values: (string | number)[] = [];

  if (updates.title !== undefined) {
    fields.push('title = ?');
    values.push(updates.title);
  }
  if (updates.artist !== undefined) {
    fields.push('artist = ?');
    values.push(updates.artist);
  }
  if (updates.bars !== undefined) {
    fields.push('bars = ?');
    values.push(JSON.stringify(updates.bars));
  }
  if (updates.sections !== undefined) {
    fields.push('sections = ?');
    values.push(JSON.stringify(updates.sections));
  }

  if (fields.length === 0) return;

  fields.push("updated_at = datetime('now')");
  values.push(id);

  const stmt = db.prepare(
    `UPDATE structures SET ${fields.join(', ')} WHERE id = ?`
  );
  try {
    stmt.run(values);
  } finally {
    stmt.free();
  }
  persist();

  // Fire-and-forget cloud sync
  const saved = getStructureById(id);
  if (saved) pushStructure(saved).catch(() => {});
}

export function deleteStructure(id: string): void {
  if (!db) return;
  const stmt = db.prepare(`DELETE FROM structures WHERE id = ?`);
  try {
    stmt.run([id]);
  } finally {
    stmt.free();
  }
  persist();

  // Fire-and-forget cloud sync
  pushDeleteStructure(id).catch(() => {});
}

// ---------------------------------------------------------------------------
// Single-record helpers (used by sync)
// ---------------------------------------------------------------------------

function getProgressionById(id: string): SavedProgression | null {
  if (!db) return null;
  const stmt = db.prepare(
    `SELECT * FROM saved_progressions WHERE id = ?`
  );
  stmt.bind([id]);
  if (!stmt.step()) {
    stmt.free();
    return null;
  }
  const row = stmt.getAsObject();
  stmt.free();
  return {
    id: row.id as string,
    name: row.name as string,
    description: row.description as string,
    steps: JSON.parse(row.steps as string) as ProgressionStep[],
    mode: row.mode as 'major' | 'minor',
    presetId: row.preset_id as string,
    bpm: row.bpm as number,
    isExample: row.is_example === 1,
    createdAt: row.created_at as string,
  };
}

function getSongById(id: string): Song | null {
  if (!db) return null;
  const stmt = db.prepare(`SELECT * FROM songs WHERE id = ?`);
  stmt.bind([id]);
  if (!stmt.step()) {
    stmt.free();
    return null;
  }
  const row = stmt.getAsObject();
  stmt.free();
  return {
    id: row.id as string,
    title: row.title as string,
    artist: row.artist as string,
    key: row.key_note as number,
    mode: row.mode as 'major' | 'minor',
    originalBpm: row.original_bpm as number,
    presetId: row.preset_id as string,
    sections: JSON.parse(row.sections as string) as SongSection[],
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function getStructureById(id: string): SongStructure | null {
  if (!db) return null;
  const stmt = db.prepare(`SELECT * FROM structures WHERE id = ?`);
  stmt.bind([id]);
  if (!stmt.step()) {
    stmt.free();
    return null;
  }
  const row = stmt.getAsObject();
  stmt.free();
  const rawBars = JSON.parse(row.bars as string) as StructureBar[];
  const rawSections = JSON.parse(row.sections as string) as LegacySection[];
  const migrated = migrateStructureData(rawBars, rawSections);
  return {
    id: row.id as string,
    title: row.title as string,
    artist: row.artist as string,
    bars: migrated.bars,
    sections: migrated.sections,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

// ---------------------------------------------------------------------------
// Upsert helpers (used by syncAll merge)
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

function upsertProgressionLocal(r: CloudProgression): void {
  if (!db) return;
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO saved_progressions
     (id, name, description, steps, mode, preset_id, bpm, is_example, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  stmt.run([
    r.id,
    r.name,
    r.description,
    r.steps,
    r.mode,
    r.preset_id,
    r.bpm,
    r.is_example,
    r.created_at,
  ]);
  stmt.free();
}

function upsertSongLocal(r: CloudSong): void {
  if (!db) return;
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO songs
     (id, title, artist, key_note, mode, original_bpm, preset_id, sections, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  stmt.run([
    r.id,
    r.title,
    r.artist,
    r.key_note,
    r.mode,
    r.original_bpm,
    r.preset_id,
    r.sections,
    r.created_at,
    r.updated_at,
  ]);
  stmt.free();
}

function upsertStructureLocal(r: CloudStructure): void {
  if (!db) return;
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO structures
     (id, title, artist, bars, sections, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  stmt.run([
    r.id,
    r.title,
    r.artist,
    r.bars,
    r.sections,
    r.created_at,
    r.updated_at,
  ]);
  stmt.free();
}

