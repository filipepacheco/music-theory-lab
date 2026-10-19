// @vitest-environment happy-dom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import GpImportPanel from '@/components/transcription/GpImportPanel';
vi.mock('framer-motion', () => ({
  motion: {
    div: ({
      initial,
      animate,
      transition,
      ...props
    }: Record<string, unknown>) => createElement('div', props),
  },
}));
vi.mock('@/hooks/useSongs', () => ({
  useSongs: () => ({ songs: [], save: vi.fn() }),
}));
afterEach(cleanup);
it('lets Files choose any type but rejects unsupported names before reading bytes', async () => {
  const { getByRole, container } = render(<GpImportPanel />);
  fireEvent.click(getByRole('button', { name: /Importar do Guitar Pro/ }));
  const input = container.querySelector('input[type=file]')!;
  expect(input.getAttribute('accept')).toBeNull();
  const file = new File(['invalid'], 'song.mid');
  const read = vi.fn();
  Object.defineProperty(file, 'arrayBuffer', { value: read });
  fireEvent.change(input, { target: { files: [file] } });
  await waitFor(() =>
    expect(getByRole('alert').textContent).toContain('Guitar Pro 7/8 (.gp)'),
  );
  expect(read).not.toHaveBeenCalled();
  expect(getByRole('alert').className).toContain('lh-callout');
});
