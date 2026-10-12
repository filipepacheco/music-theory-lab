// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PartMuteControls from '@/components/library/PartMuteControls';

afterEach(cleanup);

describe('PartMuteControls', () => {
  it('has one mute button for each part and toggles only that part', () => {
    const onToggle = vi.fn();
    render(
      <PartMuteControls
        mutes={{ bass: false, drums: true }}
        onToggle={onToggle}
      />,
    );
    const bass = screen.getByRole('button', { name: 'Silenciar baixo' });
    const drums = screen.getByRole('button', { name: 'Silenciar bateria' });
    expect(bass.getAttribute('aria-pressed')).toBe('false');
    expect(drums.getAttribute('aria-pressed')).toBe('true');
    expect(drums.textContent).toBe('Bateria mudo');
    fireEvent.click(bass);
    expect(onToggle).toHaveBeenCalledWith('bass');
    fireEvent.click(drums);
    expect(onToggle).toHaveBeenLastCalledWith('drums');
  });
});
