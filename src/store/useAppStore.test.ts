import { beforeAll, describe, expect, it, vi } from 'vitest';

let useAppStore: typeof import('./useAppStore').useAppStore;

beforeAll(async () => {
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  });
  ({ useAppStore } = await import('./useAppStore'));
});

describe('setIsMinor', () => {
  it('clears both scale selections on a mode change', () => {
    useAppStore.setState({
      selectedScaleId: 'major',
      comparisonScaleId: 'minor',
    });
    useAppStore.getState().setIsMinor(true);
    const s = useAppStore.getState();
    expect(s.selectedScaleId).toBeNull();
    expect(s.comparisonScaleId).toBeNull();
  });
});
