import { afterEach, expect, it, vi } from 'vitest';
import { requestPersistentStorage } from '@/services/persistentStorage';

afterEach(() => vi.restoreAllMocks());

it('asks the browser to keep storage and logs the answer', async () => {
  const log = vi.spyOn(console, 'info').mockImplementation(() => {});
  const storage = { persist: vi.fn().mockResolvedValue(true) };
  await requestPersistentStorage(storage);
  expect(storage.persist).toHaveBeenCalledOnce();
  expect(log).toHaveBeenCalledWith('Armazenamento persistente:', true);
});

it('logs a refusal without failing', async () => {
  const log = vi.spyOn(console, 'info').mockImplementation(() => {});
  const storage = { persist: vi.fn().mockResolvedValue(false) };
  await expect(requestPersistentStorage(storage)).resolves.toBeUndefined();
  expect(storage.persist).toHaveBeenCalledOnce();
  expect(log).toHaveBeenCalledWith('Armazenamento persistente:', false);
});

it('ignores unavailable storage or persist support without failing', async () => {
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.stubGlobal('navigator', {});
  try {
    await expect(requestPersistentStorage()).resolves.toBeUndefined();
    await expect(requestPersistentStorage({})).resolves.toBeUndefined();
  } finally {
    vi.unstubAllGlobals();
  }
});

it('logs a rejected browser request without failing startup', async () => {
  const log = vi.spyOn(console, 'info').mockImplementation(() => {});
  const storage = {
    persist: vi.fn().mockRejectedValue(new Error('Unavailable')),
  };
  await expect(requestPersistentStorage(storage)).resolves.toBeUndefined();
  expect(log).toHaveBeenCalledWith('Armazenamento persistente: indisponível');
});

it('requests persistence without reading or writing the database', async () => {
  vi.spyOn(console, 'info').mockImplementation(() => {});
  const open = vi.fn(() => {
    throw new Error('Unexpected database access');
  });
  vi.stubGlobal('indexedDB', { open });
  try {
    await requestPersistentStorage({
      persist: vi.fn().mockResolvedValue(true),
    });
    expect(open).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
  }
});
