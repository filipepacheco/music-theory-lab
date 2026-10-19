// @vitest-environment happy-dom
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import AnalyzeModule from '@/components/analyze/AnalyzeModule';

it('groups the upload form and queue in a container-adaptive layout', () => {
  const root = document.createElement('div');
  root.innerHTML = renderToStaticMarkup(<AnalyzeModule />);
  const columns = root.querySelector('.analyze-columns');
  expect(columns).not.toBeNull();
  expect(columns?.querySelector('form')).not.toBeNull();
  expect(columns?.textContent).toContain('Fila');
  expect(root.querySelector('.lh-frame')).not.toBeNull();
});
