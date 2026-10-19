import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Song } from '@/types';
import { transcriptionDocument } from '@/domain/transcriptionDocument';

let useAppStore: typeof import('./useAppStore').useAppStore;
let selectTranscriptionDocument: typeof import('./useAppStore').selectTranscriptionDocument;

beforeAll(async () => {
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  });
  ({ useAppStore, selectTranscriptionDocument } = await import(
    './useAppStore'
  ));
});

describe('setIsMinor', () => {
  it('clears both scale selections on a mode change', () => {
    useAppStore.setState({
      selectedScaleId: 'major',
      comparisonScaleId: 'minor',
    });
    useAppStore.getState().setIsMinor(true);
    const s = useAppStore.getState();
    expect(s.selectedScaleId).toBeNull();
    expect(s.comparisonScaleId).toBeNull();
  });
});

describe('the key and mode of the open song', () => {
  const song: Song = {
    id: 'song-1',
    title: 'Garota',
    artist: 'Tom',
    key: 5,
    mode: 'minor',
    originalBpm: 120,
    presetId: 'rhodes',
    sections: [{ id: 's1', type: 'verso', steps: [] }],
    createdAt: 'x',
    updatedAt: 'x',
  };

  beforeEach(() => {
    const s = useAppStore.getState();
    s.setActiveModule('harmonicField');
    s.setRootNote(0);
    s.setIsMinor(false);
    s.setActiveModule('transcription');
    s.clearSong();
    useAppStore.setState({ songKey: 0, songMode: 'major' });
  });

  it('holds the key and the mode in the transcription document', () => {
    useAppStore.getState().loadSong(song);
    const s = useAppStore.getState();
    expect(s.songKey).toBe(5);
    expect(s.songMode).toBe('minor');
    const doc = selectTranscriptionDocument(s);
    expect(doc.key).toBe(5);
    expect(doc.mode).toBe('minor');
  });

  it('lets the key and mode controls change the document in the transcription module', () => {
    useAppStore.getState().loadSong(song);
    useAppStore.getState().setRootNote(2);
    useAppStore.getState().setIsMinor(false);
    const s = useAppStore.getState();
    expect(s.songKey).toBe(2);
    expect(s.songMode).toBe('major');
    expect(
      transcriptionDocument.hasUnsavedChanges(selectTranscriptionDocument(s)),
    ).toBe(true);
  });

  it('makes the app-wide key follow the document in the transcription module', () => {
    useAppStore.getState().loadSong(song);
    let s = useAppStore.getState();
    expect(s.rootNote).toBe(5);
    expect(s.isMinor).toBe(true);
    expect(s.harmonicField[0].notes[0]).toBe(5);

    // Leave, change the app-wide key, and come back.
    s.setActiveModule('harmonicField');
    useAppStore.getState().setRootNote(9);
    useAppStore.getState().setIsMinor(false);
    useAppStore.getState().setActiveModule('transcription');
    s = useAppStore.getState();
    expect(s.rootNote).toBe(5);
    expect(s.isMinor).toBe(true);
    expect(s.harmonicField[0].notes[0]).toBe(5);
  });

  it('keeps the key of the transcription document when a different module changes the key', () => {
    useAppStore.getState().loadSong(song);
    useAppStore.getState().setActiveModule('scales');
    useAppStore.getState().setRootNote(9);
    useAppStore.getState().setIsMinor(false);
    const s = useAppStore.getState();
    expect(s.rootNote).toBe(9);
    expect(s.songKey).toBe(5);
    expect(s.songMode).toBe('minor');
    expect(selectTranscriptionDocument(s).key).toBe(5);
    expect(
      transcriptionDocument.hasUnsavedChanges(selectTranscriptionDocument(s)),
    ).toBe(false);
  });

  it('gives a new, empty song the app-wide key when the module opens', () => {
    useAppStore.getState().setActiveModule('harmonicField');
    useAppStore.getState().setRootNote(7);
    useAppStore.getState().setIsMinor(true);
    useAppStore.getState().setActiveModule('transcription');
    const s = useAppStore.getState();
    expect(s.songKey).toBe(7);
    expect(s.songMode).toBe('minor');
    expect(s.rootNote).toBe(7);
  });

  it('restores the key, the mode, the base tempo, and the preset of the song together after a save and a load', () => {
    const store = useAppStore.getState();
    store.loadSong(song);
    store.setRootNote(10);
    store.setIsMinor(false);
    store.setSongBaseBpm(140);
    store.setSongPresetId('piano');
    store.setPracticeSpeed(50);

    const record = transcriptionDocument.toSongRecord(
      selectTranscriptionDocument(useAppStore.getState()),
    );
    useAppStore.getState().markSongSaved('song-1', record);

    // Something else changes, then the saved song loads again.
    useAppStore.getState().loadSong({ ...song, id: 'other' });
    useAppStore.getState().loadSong({
      id: 'song-1',
      ...record,
      createdAt: 'x',
      updatedAt: 'y',
    });
    const s = useAppStore.getState();
    expect(s.songKey).toBe(10);
    expect(s.songMode).toBe('major');
    expect(s.rootNote).toBe(10);
    expect(s.isMinor).toBe(false);
    expect(s.songBaseBpm).toBe(140);
    expect(s.songPresetId).toBe('piano');
    expect(s.practiceSpeed).toBe(100);
    expect(
      transcriptionDocument.hasUnsavedChanges(selectTranscriptionDocument(s)),
    ).toBe(false);
  });

  it('loads a Guitar Pro import with the mode chosen in the import panel', () => {
    // The app-wide mode is major; the import panel chose minor.
    const record = transcriptionDocument.importRecord(
      selectTranscriptionDocument(useAppStore.getState()),
      { title: 'GP', artist: '', key: 9, mode: 'minor', sections: [] },
    );
    useAppStore
      .getState()
      .loadSong({ id: 'gp', ...record, createdAt: 'x', updatedAt: 'x' });
    const s = useAppStore.getState();
    expect(s.songMode).toBe('minor');
    expect(s.isMinor).toBe(true);
    expect(s.songKey).toBe(9);

    useAppStore.getState().loadImportedSong({
      title: 'GP 2',
      artist: '',
      key: 4,
      mode: 'minor',
      sections: [],
    });
    expect(useAppStore.getState().songMode).toBe('minor');
    expect(useAppStore.getState().songKey).toBe(4);
  });
});
