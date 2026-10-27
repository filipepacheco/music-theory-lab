// @vitest-environment happy-dom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import RocksmithChartList from '@/components/library/RocksmithChartList';
import { DEFAULT_LIST_VIEW } from '@/domain/libraryListView';

afterEach(cleanup);

it.each(['song.gp', 'song.psarc', 'song.mid', 'song.midi'])(
  'allows the picker to pass %s to Library import',
  (name) => {
    const onImport = vi.fn();
    const { getByLabelText } = render(
      <RocksmithChartList
        songs={[]}
        view={DEFAULT_LIST_VIEW}
        onViewChange={vi.fn()}
        linkedChartIds={new Set()}
        importStatus={{ state: 'idle' }}
        onSelect={vi.fn()}
        onImport={onImport}
      />,
    );
    const input = getByLabelText('Importar .psarc / .mid / .gp');
    expect(input.getAttribute('accept')).toBeNull();
    const file = new File(['score'], name);
    fireEvent.change(input, { target: { files: [file] } });
    expect(onImport).toHaveBeenCalledWith([file]);
  },
);

it('lets the picker take many files and passes them in the order of the selection', () => {
  const onImport = vi.fn();
  const { getByLabelText } = render(
    <RocksmithChartList
      songs={[]}
      view={DEFAULT_LIST_VIEW}
      onViewChange={vi.fn()}
      linkedChartIds={new Set()}
      importStatus={{ state: 'idle' }}
      onSelect={vi.fn()}
      onImport={onImport}
    />,
  );
  const input = getByLabelText('Importar .psarc / .mid / .gp');
  expect(input.hasAttribute('multiple')).toBe(true);
  const files = [
    new File(['a'], 'a.gp'),
    new File(['b'], 'b.mid'),
    new File(['c'], 'c.psarc'),
  ];
  fireEvent.change(input, { target: { files } });
  expect(onImport).toHaveBeenCalledWith(files);
});

it('shows supported-type guidance through the shared danger callout', () => {
  const message = 'Selecione um arquivo .gp, .psarc, .mid ou .midi.';
  const { getByRole } = render(
    <RocksmithChartList
      songs={[]}
      view={DEFAULT_LIST_VIEW}
      onViewChange={vi.fn()}
      linkedChartIds={new Set()}
      importStatus={{ state: 'error', message }}
      onSelect={vi.fn()}
      onImport={vi.fn()}
    />,
  );
  expect(getByRole('alert').textContent).toBe(message);
  expect(getByRole('alert').className).toContain('lh-callout is-wreck');
});
