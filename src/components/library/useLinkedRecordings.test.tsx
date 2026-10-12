// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useLinkedRecordings } from '@/components/library/useLinkedRecordings';

const library = vi.hoisted(() => ({ listAudioIds: vi.fn() }));
vi.mock('@/services/rocksmithLibrary', () => ({ rocksmithLibrary: library }));

describe('useLinkedRecordings', () => {
  it('gives the ids that the browser holds', async () => {
    library.listAudioIds.mockResolvedValue(['a', 'b']);
    const { result } = renderHook(() => useLinkedRecordings(true));
    await waitFor(() => expect(result.current.has('a')).toBe(true));
  });

  it('gives an empty set when the database call throws at once', () => {
    library.listAudioIds.mockImplementation(() => {
      throw new ReferenceError('indexedDB is not defined');
    });
    const { result } = renderHook(() => useLinkedRecordings(true));
    expect(result.current.size).toBe(0);
  });

  it('gives an empty set when the database refuses', async () => {
    library.listAudioIds.mockRejectedValue(new DOMException('denied'));
    const { result } = renderHook(() => useLinkedRecordings(true));
    await waitFor(() => expect(library.listAudioIds).toHaveBeenCalled());
    expect(result.current.size).toBe(0);
  });
});
