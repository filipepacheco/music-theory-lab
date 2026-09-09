import { describe, expect, it } from 'vitest';
import {
  attachLocalAudio,
  createIndexedDbLocalAudioRepository,
  hashLocalAudio,
  type LocalAudioFile,
  type LocalAudioRepository,
  type StoredLocalAudio,
} from '@/services/localAudioSource';

function audioFile(name = 'gravacao.mp3'): LocalAudioFile {
  return Object.assign(new Blob(['audio'], { type: 'audio/mpeg' }), { name });
}

function memoryRepository(): LocalAudioRepository {
  const records = new Map<string, StoredLocalAudio>();
  return {
    get: async (sourceSha256) => records.get(sourceSha256) ?? null,
    put: async (association) => {
      records.set(association.sourceSha256, association);
    },
  };
}

function persistentIndexedDbFactory(): IDBFactory {
  const records = new Map<IDBValidKey, StoredLocalAudio>();
  let storeCreated = false;

  const database = {
    objectStoreNames: {
      contains: () => storeCreated,
    },
    createObjectStore: () => {
      storeCreated = true;
      return {} as IDBObjectStore;
    },
    close: () => {},
    transaction: () => {
      let transaction: IDBTransaction;
      transaction = {
        error: null,
        oncomplete: null,
        onerror: null,
        onabort: null,
        objectStore: () => ({
          get: (key: IDBValidKey) => {
            const request = {
              result: records.get(key),
              error: null,
              onsuccess: null,
              onerror: null,
            } as unknown as IDBRequest<StoredLocalAudio | undefined>;
            queueMicrotask(() =>
              request.onsuccess?.call(request, new Event('success')),
            );
            return request;
          },
          put: (association: StoredLocalAudio) => {
            records.set(association.sourceSha256, association);
            queueMicrotask(() =>
              transaction.oncomplete?.call(transaction, new Event('complete')),
            );
            return {} as IDBRequest<IDBValidKey>;
          },
        }),
      } as unknown as IDBTransaction;
      return transaction;
    },
  } as unknown as IDBDatabase;

  return {
    open: () => {
      const needsUpgrade = !storeCreated;
      const request = {
        result: database,
        error: null,
        onsuccess: null,
        onerror: null,
        onblocked: null,
        onupgradeneeded: null,
      } as unknown as IDBOpenDBRequest;
      queueMicrotask(() => {
        if (needsUpgrade) {
          request.onupgradeneeded?.call(
            request,
            new Event('upgradeneeded') as IDBVersionChangeEvent,
          );
        }
        request.onsuccess?.call(request, new Event('success'));
      });
      return request;
    },
  } as unknown as IDBFactory;
}

describe('attachLocalAudio', () => {
  it('associates and stores a file whose SHA-256 matches the indexed track', async () => {
    const expectedSha = 'a'.repeat(64);
    const repository = memoryRepository();
    const file = audioFile();

    const result = await attachLocalAudio(
      file,
      expectedSha,
      repository,
      async () => expectedSha,
    );

    expect(result).toEqual({
      status: 'attached',
      association: {
        sourceSha256: expectedSha,
        fileName: 'gravacao.mp3',
        mimeType: 'audio/mpeg',
        blob: file,
      },
    });
    await expect(repository.get(expectedSha)).resolves.toEqual(
      result.status === 'attached' ? result.association : null,
    );
  });

  it('rejects a mismatched file without altering the stored association', async () => {
    const expectedSha = 'a'.repeat(64);
    const repository = memoryRepository();
    const original = audioFile('original.mp3');
    await attachLocalAudio(
      original,
      expectedSha,
      repository,
      async () => expectedSha,
    );

    const result = await attachLocalAudio(
      audioFile('outra.mp3'),
      expectedSha,
      repository,
      async () => 'b'.repeat(64),
    );

    expect(result).toEqual({ status: 'mismatch' });
    await expect(repository.get(expectedSha)).resolves.toMatchObject({
      fileName: 'original.mp3',
      blob: original,
    });
  });

  it('reports an unreadable file without altering the stored association', async () => {
    const expectedSha = 'a'.repeat(64);
    const repository = memoryRepository();

    const result = await attachLocalAudio(
      audioFile(),
      expectedSha,
      repository,
      async () => {
        throw new Error('read failed');
      },
    );

    expect(result).toEqual({ status: 'unreadable' });
    await expect(repository.get(expectedSha)).resolves.toBeNull();
  });
});

describe('hashLocalAudio', () => {
  it('returns the browser SHA-256 digest for the selected file bytes', async () => {
    await expect(hashLocalAudio(new Blob(['abc']))).resolves.toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('restoreLocalAudio', () => {
  it('restores an association from the repository used across page loads', async () => {
    const expectedSha = 'a'.repeat(64);
    const repository = memoryRepository();
    const file = audioFile();
    await attachLocalAudio(
      file,
      expectedSha,
      repository,
      async () => expectedSha,
    );

    await expect(repository.get(expectedSha)).resolves.toEqual({
      sourceSha256: expectedSha,
      fileName: 'gravacao.mp3',
      mimeType: 'audio/mpeg',
      blob: file,
    });
  });

  it('restores the blob after reopening the IndexedDB repository', async () => {
    const sourceSha256 = 'c'.repeat(64);
    const databaseFactory = persistentIndexedDbFactory();
    const firstPageRepository =
      createIndexedDbLocalAudioRepository(databaseFactory);
    await firstPageRepository.put({
      sourceSha256,
      fileName: 'original.wav',
      mimeType: 'audio/wav',
      blob: new Blob(['persisted audio'], { type: 'audio/wav' }),
    });

    const reloadedPageRepository =
      createIndexedDbLocalAudioRepository(databaseFactory);
    const restored = await reloadedPageRepository.get(sourceSha256);

    expect(restored).toMatchObject({
      sourceSha256,
      fileName: 'original.wav',
      mimeType: 'audio/wav',
    });
    await expect(restored?.blob.text()).resolves.toBe('persisted audio');
  });
});
