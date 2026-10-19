// @vitest-environment happy-dom
import { act, cleanup, fireEvent, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { usePlaybackShortcut } from '@/hooks/usePlaybackShortcut';
import { createPlaybackSession } from '@/services/playbackSession';
afterEach(cleanup);
it('gives playback priority over structure recording regardless of mount order', async () => {
  const { useStructureRecorder } = await import('@/hooks/useStructureRecorder');
  const { useAppStore } = await import('@/store/useAppStore');
  const addBar = vi.fn();
  const original = useAppStore.getState().addBarToSection;
  useAppStore.setState({ focusedSectionId: 'verse', addBarToSection: addBar });
  const toggle = vi.fn();
  try {
    renderHook(useStructureRecorder);
    const player = renderHook(() => usePlaybackShortcut(toggle));
    fireEvent.keyDown(document.body, { key: ' ', code: 'Space' });
    expect(toggle).toHaveBeenCalledOnce();
    expect(addBar).not.toHaveBeenCalled();
    player.unmount();
    fireEvent.keyDown(document.body, { key: ' ', code: 'Space' });
    expect(addBar).toHaveBeenCalledWith('verse');
  } finally {
    useAppStore.setState({ focusedSectionId: null, addBarToSection: original });
  }
});
it('starts and stops the registered player and its screen lock with Space', async () => {
  const release = vi.fn(async () => {});
  const requestScreenLock = vi.fn(async () => ({ released: false, release }));
  const session = createPlaybackSession({ requestScreenLock });
  const id = Symbol('player');
  let playing = false;
  const toggle = vi.fn(() => {
    playing = !playing;
    if (playing) session.start(id);
    else session.stop(id);
  });
  renderHook(() => usePlaybackShortcut(toggle));
  await act(async () => {
    fireEvent.keyDown(window, { key: ' ', code: 'Space' });
  });
  expect(requestScreenLock).toHaveBeenCalledOnce();
  await act(async () => {
    fireEvent.keyDown(window, { key: ' ', code: 'Space' });
  });
  expect(release).toHaveBeenCalledOnce();
  expect(toggle).toHaveBeenCalledTimes(2);
});
it('does not hijack text fields, editable descendants, native buttons, modifiers or repeats', () => {
  const toggle = vi.fn();
  const { unmount } = renderHook(() => usePlaybackShortcut(toggle));
  for (const markup of [
    '<input>',
    '<textarea></textarea>',
    '<select></select>',
    '<button>Play</button>',
    '<div contenteditable="true"><span>text</span></div>',
  ]) {
    const container = document.createElement('div');
    container.innerHTML = markup;
    document.body.append(container);
    const target =
      container.querySelector('span') ?? container.firstElementChild!;
    (target as HTMLElement).focus();
    expect(
      fireEvent.keyDown(target, {
        key: ' ',
        code: 'Space',
        cancelable: true,
      }),
    ).toBe(true);
    container.remove();
  }
  fireEvent.keyDown(window, { key: ' ', code: 'Space', repeat: true });
  fireEvent.keyDown(window, { key: ' ', code: 'Space', ctrlKey: true });
  expect(toggle).not.toHaveBeenCalled();
  unmount();
  fireEvent.keyDown(window, { key: ' ', code: 'Space' });
  expect(toggle).not.toHaveBeenCalled();
});
