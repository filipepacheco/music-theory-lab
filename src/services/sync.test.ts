import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LibraryAnnotationDocument } from '@/domain/libraryAnnotation';
import { pushLibraryAnnotation, syncAll, type SyncDeps } from '@/services/sync';

vi.mock('@/services/deviceId', () => ({ getDeviceId: () => 'device-1' }));

function annotation(
  sourceSha256: string,
  updatedAt: string,
): LibraryAnnotationDocument {
  return {
    schemaVersion: 2,
    sourceSha256,
    barCount: 4,
    reviewRequired: false,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt,
    sections: [
      {
        id: 'section-1',
        name: 'Parte 1',
        startBar: 0,
        endBar: 4,
        origin: 'manual',
      },
    ],
  };
}

function cloud(document: LibraryAnnotationDocument) {
  return {
    source_sha256: document.sourceSha256,
    schema_version: document.schemaVersion,
    bar_count: document.barCount,
    review_required: document.reviewRequired ? 1 : 0,
    sections: JSON.stringify(document.sections),
    created_at: document.createdAt,
    updated_at: document.updatedAt,
  };
}

function emptyCollection() {
  return {
    listLocal: () => [],
    applyCloud: vi.fn(),
    push: vi.fn().mockResolvedValue(undefined),
  };
}

describe('Library annotation cloud sync', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('pushes only the annotation JSON contract, never original audio bytes', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    const document = annotation('source-sha', '2026-09-09T12:00:00.000Z');

    await pushLibraryAnnotation(document);

    const [, init] = vi.mocked(fetch).mock.calls[0];
    const payload = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(payload).toMatchObject({ records: [cloud(document)] });
    expect(JSON.stringify(payload)).not.toContain('audio');
  });

  it('converges cloud-only and differing copies with last-write-wins', async () => {
    const cloudNewer = annotation('cloud-newer', '2026-09-09T13:00:00.000Z');
    const cloudOnly = annotation('cloud-only', '2026-09-09T12:00:00.000Z');
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      const records = url.includes('/api/library-annotations')
        ? [
            cloud(cloudNewer),
            cloud(cloudOnly),
            {
              ...cloud(localNewer),
              source_sha256: 'local-newer',
              sections: '[]',
            },
          ]
        : [];
      return new Response(JSON.stringify(records), { status: 200 });
    });
    const localOlder = annotation('cloud-newer', '2026-09-09T12:00:00.000Z');
    const localNewer = annotation('local-newer', '2026-09-09T14:00:00.000Z');
    const localOnly = annotation('local-only', '2026-09-09T12:00:00.000Z');
    const annotations = {
      listLocal: () => [localOlder, localNewer, localOnly],
      applyCloud: vi.fn(),
      push: vi.fn().mockResolvedValue(undefined),
    };
    const deps: SyncDeps = {
      progressions: emptyCollection(),
      songs: emptyCollection(),
      structures: emptyCollection(),
      annotations,
      persist: vi.fn(),
    };

    await syncAll(deps);

    expect(annotations.applyCloud).toHaveBeenCalledTimes(2);
    expect(annotations.applyCloud).toHaveBeenCalledWith(cloudNewer);
    expect(annotations.applyCloud).toHaveBeenCalledWith(cloudOnly);
    expect(annotations.applyCloud).not.toHaveBeenCalledWith(
      expect.objectContaining({ sourceSha256: 'local-newer' }),
    );
    expect(
      annotations.push.mock.calls.map(([record]) => record.sourceSha256),
    ).toEqual(['local-newer', 'local-only']);
  });

  it('retries an offline local edit on the next synchronization', async () => {
    vi.mocked(fetch).mockImplementation(
      async () => new Response(JSON.stringify([]), { status: 200 }),
    );
    const local = annotation('offline-edit', '2026-09-09T14:00:00.000Z');
    const annotations = {
      listLocal: () => [local],
      applyCloud: vi.fn(),
      push: vi
        .fn()
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValueOnce(undefined),
    };
    const deps: SyncDeps = {
      progressions: emptyCollection(),
      songs: emptyCollection(),
      structures: emptyCollection(),
      annotations,
      persist: vi.fn(),
    };

    await syncAll(deps);
    await syncAll(deps);

    expect(annotations.push).toHaveBeenCalledTimes(2);
  });
});
