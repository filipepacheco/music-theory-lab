// @vitest-environment happy-dom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { GrooveEditor } from '@/components/structure/GrooveEditor';

afterEach(cleanup);

it('shows full drum names before and after tapping the groove grid', () => {
  const view = render(
    <GrooveEditor
      section={{ id: 'section', name: 'Parte 1', color: 'blue', barIds: [] }}
      color="var(--color-accent)"
      groovePlayer={{
        play: vi.fn(),
        stop: vi.fn(),
        isPlaying: false,
        playingSectionId: null,
        currentTick: 0,
      }}
    />,
  );
  for (const name of ['Bumbo', 'Caixa', 'Chimbal']) {
    const label = view.getByText(name);
    expect(label.closest('[hidden], [aria-hidden="true"]')).toBeNull();
    fireEvent.click(view.getByRole('button', { name: `${name} 1` }));
    expect(view.getByText(name).isConnected).toBe(true);
  }
});
