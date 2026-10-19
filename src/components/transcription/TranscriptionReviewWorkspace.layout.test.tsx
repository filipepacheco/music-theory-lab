// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import TranscriptionReviewWorkspace from '@/components/transcription/TranscriptionReviewWorkspace';
import { useAppStore } from '@/store/useAppStore';

afterEach(cleanup);

it('keeps chord review and its editable details in adaptive sibling panels', () => {
  useAppStore.getState().clearSong();
  useAppStore.getState().addSection('intro');
  useAppStore.getState().addSongStep(0, {
    degree: 0,
    label: 'C',
    beats: 4,
    confidence: 'unsure',
  });
  const { container } = render(<TranscriptionReviewWorkspace />);
  const panels = container.querySelector('.transcription-review-columns');
  expect(panels).not.toBeNull();
  expect(panels?.querySelector(':scope > main')).not.toBeNull();
  expect(panels?.querySelector(':scope > aside')).not.toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /Confirmar/ }));
  expect(useAppStore.getState().songSections[0].steps[0].confidence).toBe(
    'sure',
  );
});
