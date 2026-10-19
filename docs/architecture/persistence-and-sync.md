# Persistence and cloud sync

## Local database (sql.js)

- `src/services/db.ts` manages a sql.js SQLite database. It is stored in IndexedDB as one binary blob.
- `src/services/savedLibrary.ts` is the stable CRUD façade. Hooks and the store use the façade, never `db.ts`.
- `initDB()` is a module-level singleton. It initializes lazily and seeds the example progressions from `PROGRESSION_EXAMPLES`.
- The WASM binary is served from `/sql-wasm.wasm`. The `postinstall` script copies it to `public/`.

| Table | Content | Access |
|---|---|---|
| progressions | Saved progressions. Examples are seeded one time with `is_example = 1`, and users cannot delete them. | `useSavedProgressions` |
| `songs` | Transcriptions: title, artist, key, mode, BPM, preset ID, sections as JSON. | `useSongs` |
| structures | Arrangements: title, artist, bars as JSON, sections as JSON. | The structures façade, called from the store. |

## API routes (`api/`, Vercel serverless, Turso/LibSQL)

| Route | Methods | Scope |
|---|---|---|
| `api/progressions.ts` | GET, POST, DELETE | Device: rows are owned by `device_id`. |
| `api/songs.ts` | GET, POST, DELETE | Global: `GET` returns the rows of each device, `DELETE` removes by id only. |
| `api/structures.ts` | GET, POST, DELETE | Global, same as songs. |

- Each route inlines its Turso client. There is no shared module.
- POST is a batch upsert.
- The routes need `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`.
- Songs and structures have no authentication: all devices see and manage the same libraries.

## Client sync (`src/services/sync.ts`)

- `syncAll()` runs on the first library use, and again when the tab gets focus, with a 30 s cooldown.
- Each upsert and push is an idempotent `INSERT OR REPLACE`. A second run is safe and retries a push that failed.
- `useCollection` hooks read their lists again on the same focus event, so a mounted list updates without a reload.

| Collection | Merge | Pull |
|---|---|---|
| Progressions | Union: each side pushes its local-only records. | Scoped by `device_id`. |
| Songs | Last write wins by `updated_at`. | `pullSongs` sends no `device_id`. |
| Structures | Last write wins by `updated_at`. | `pullStructures` sends no `device_id`. |

The push helpers (`pushProgression`, `pushSong`, `pushStructure`, `pushDelete*`) are fire-and-forget. They swallow errors, so a sync failure never blocks the UI.
