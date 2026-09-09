const DATABASE_NAME = 'music-theory-lab-local-audio';
const DATABASE_VERSION = 1;
const STORE_NAME = 'track-audio';

export type LocalAudioFile = Blob & { name: string };

export interface StoredLocalAudio {
  sourceSha256: string;
  fileName: string;
  mimeType: string;
  blob: Blob;
}

export interface LocalAudioRepository {
  get(sourceSha256: string): Promise<StoredLocalAudio | null>;
  put(association: StoredLocalAudio): Promise<void>;
}

export type AttachLocalAudioResult =
  | { status: 'attached'; association: StoredLocalAudio }
  | { status: 'mismatch' }
  | { status: 'unreadable' }
  | { status: 'storage-error' };

export type LocalAudioHasher = (file: Blob) => Promise<string>;

export async function hashLocalAudio(file: Blob): Promise<string> {
  const bytes = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

export async function attachLocalAudio(
  file: LocalAudioFile,
  expectedSha256: string,
  repository: LocalAudioRepository,
  hash: LocalAudioHasher = hashLocalAudio,
): Promise<AttachLocalAudioResult> {
  let actualSha256: string;
  try {
    actualSha256 = await hash(file);
  } catch {
    return { status: 'unreadable' };
  }

  if (actualSha256.toLowerCase() !== expectedSha256.toLowerCase()) {
    return { status: 'mismatch' };
  }

  const association: StoredLocalAudio = {
    sourceSha256: expectedSha256,
    fileName: file.name,
    mimeType: file.type,
    blob: file,
  };
  try {
    await repository.put(association);
  } catch {
    return { status: 'storage-error' };
  }
  return { status: 'attached', association };
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function openDatabase(databaseFactory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = databaseFactory.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'sourceSha256' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('IndexedDB open blocked'));
  });
}

export function createIndexedDbLocalAudioRepository(
  databaseFactory: IDBFactory,
): LocalAudioRepository {
  return {
    async get(sourceSha256) {
      const database = await openDatabase(databaseFactory);
      try {
        const transaction = database.transaction(STORE_NAME, 'readonly');
        const result = await requestResult<StoredLocalAudio | undefined>(
          transaction.objectStore(STORE_NAME).get(sourceSha256),
        );
        return result ?? null;
      } finally {
        database.close();
      }
    },

    async put(association) {
      const database = await openDatabase(databaseFactory);
      try {
        const transaction = database.transaction(STORE_NAME, 'readwrite');
        transaction.objectStore(STORE_NAME).put(association);
        await transactionComplete(transaction);
      } finally {
        database.close();
      }
    },
  };
}

export const indexedDbLocalAudioRepository: LocalAudioRepository = {
  get: (sourceSha256) =>
    createIndexedDbLocalAudioRepository(indexedDB).get(sourceSha256),
  put: (association) =>
    createIndexedDbLocalAudioRepository(indexedDB).put(association),
};
