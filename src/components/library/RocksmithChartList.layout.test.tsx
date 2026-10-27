// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import RocksmithChartList from '@/components/library/RocksmithChartList';
import { fixtureChart } from '@/domain/bassChartFixture';
import { summarizeChart } from '@/domain/chartSummary';
import { groupLibrarySongs } from '@/domain/librarySong';
import { DEFAULT_LIST_VIEW } from '@/domain/libraryListView';

afterEach(cleanup);

it('keeps filters beside the results without separating the import feedback', () => {
  const onImport = vi.fn();
  const songs = groupLibrarySongs([summarizeChart(fixtureChart(1, []))], []);
  const { container } = render(
    <RocksmithChartList
      songs={songs}
      view={DEFAULT_LIST_VIEW}
      onViewChange={vi.fn()}
      linkedChartIds={new Set()}
      importStatus={{ state: 'error', message: 'Use Guitar Pro 7/8 (.gp).' }}
      onSelect={vi.fn()}
      onImport={onImport}
    />,
  );
  const columns = container.querySelector('.library-list-columns');
  expect(columns).not.toBeNull();
  expect(columns?.contains(screen.getByRole('search'))).toBe(true);
  expect(columns?.querySelector('table')).not.toBeNull();
  expect(screen.getByRole('alert').textContent).toContain('Guitar Pro 7/8');
  const input = container.querySelector('input[type=file]')!;
  const file = new File(['invalid'], 'unsupported.gp5');
  fireEvent.change(input, { target: { files: [file] } });
  expect(onImport).toHaveBeenCalledWith([file]);
});
