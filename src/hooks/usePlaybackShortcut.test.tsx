// @vitest-environment happy-dom
import { act, cleanup, fireEvent, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { usePlaybackShortcut } from '@/hooks/usePlaybackShortcut';
import { createPlaybackSession } from '@/services/playbackSession';
afterEach(cleanup);
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
    fireEvent.keyDown(
      container.querySelector('span') ?? container.firstElementChild!,
      { key: ' ', code: 'Space' },
    );
    container.remove();
  }
  fireEvent.keyDown(window, { key: ' ', code: 'Space', repeat: true });
  fireEvent.keyDown(window, { key: ' ', code: 'Space', ctrlKey: true });
  expect(toggle).not.toHaveBeenCalled();
  unmount();
  fireEvent.keyDown(window, { key: ' ', code: 'Space' });
  expect(toggle).not.toHaveBeenCalled();
});
