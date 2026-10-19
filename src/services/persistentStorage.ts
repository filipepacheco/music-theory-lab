export async function requestPersistentStorage(
  storage: Partial<Pick<StorageManager, 'persist'>> | undefined = globalThis
    .navigator?.storage,
): Promise<void> {
  try {
    if (typeof storage?.persist !== 'function') {
      console.info('Armazenamento persistente: indisponível');
      return;
    }
    const persistent = await storage.persist();
    console.info('Armazenamento persistente:', persistent);
  } catch {
    console.info('Armazenamento persistente: indisponível');
  }
}
