export async function registerOfflineWorker(): Promise<void> {
  if (!import.meta.env.PROD || !globalThis.navigator?.serviceWorker) return;
  try {
    await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    });
  } catch {
    console.info('Cache offline: indisponível');
  }
}
