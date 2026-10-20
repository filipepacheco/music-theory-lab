import { useEffect, useRef } from 'react';

export function usePlaybackShortcut(toggle: () => void, enabled = true) {
  const current = useRef(toggle);
  current.current = toggle;
  useEffect(() => {
    if (!enabled) return;
    const keydown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.repeat ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        (event.code !== 'Space' && event.key !== ' ')
      )
        return;
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(
          'input, textarea, select, button, a, [contenteditable]:not([contenteditable="false"]), [role="textbox"], dialog',
        )
      )
        return;
      event.preventDefault();
      current.current();
    };
    // Playback claims Space before the structure recorder's bubble listener.
    window.addEventListener('keydown', keydown, true);
    return () => window.removeEventListener('keydown', keydown, true);
  }, [enabled]);
}
