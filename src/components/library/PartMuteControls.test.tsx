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

  it('has one control for each chart, labelled with its part name', () => {
    const onToggle = vi.fn();
    render(
      <PartMuteControls
        mutes={{ bass: false, drums: false, g2: true }}
        onToggle={onToggle}
        controls={[
          { key: 'bass', label: 'Baixo' },
          { key: 'drums', label: 'Bateria' },
          { key: 'g1', label: 'Guitarra 1 - Rhythm' },
          { key: 'g2', label: 'Guitarra 2 - Lead' },
        ]}
      />,
    );
    expect(screen.getAllByRole('button')).toHaveLength(4);
    const first = screen.getByRole('button', {
      name: 'Silenciar guitarra 1 - rhythm',
    });
    const second = screen.getByRole('button', {
      name: 'Silenciar guitarra 2 - lead',
    });
    expect(first.textContent).toBe('Guitarra 1 - Rhythm');
    expect(second.textContent).toBe('Guitarra 2 - Lead mudo');
    expect(second.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(first);
    expect(onToggle).toHaveBeenCalledWith('g1');
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
