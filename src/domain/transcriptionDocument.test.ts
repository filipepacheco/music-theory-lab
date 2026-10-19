import { describe, expect, it } from 'vitest';
import { transcriptionDocument } from './transcriptionDocument';
import type { TranscriptionDocument } from './transcriptionDocument';
import type { ProgressionStep } from '@/constants/progressions';
import type { Song } from '@/types';

const step = (label: string): ProgressionStep => ({
  degree: null,
  label,
});

const doc: TranscriptionDocument = transcriptionDocument.create();

describe('transcriptionDocument', () => {
  it('adds a section and activates it', () => {
    const next = transcriptionDocument.addSection(
      doc,
      'verso',
      undefined,
      { createId: () => 'sec-1' },
    );

    expect(next.activeSectionIndex).toBe(0);
    expect(next.sections).toEqual([
      { id: 'sec-1', type: 'verso', customLabel: undefined, steps: [] },
    ]);
  });

  it('removes a section and clamps the active index', () => {
    const two = transcriptionDocument.addSection(
      transcriptionDocument.addSection(doc, 'verso', undefined, {
        createId: () => 'a',
      }),
      'refrao',
      undefined,
      { createId: () => 'b' },
    );
    const removed = transcriptionDocument.removeSection(two, 1);

    expect(removed.sections.map((s) => s.id)).toEqual(['a']);
    expect(removed.activeSectionIndex).toBe(0);
  });

  it('clears sections when the last one is removed', () => {
    const one = transcriptionDocument.addSection(doc, 'verso', undefined, {
      createId: () => 'a',
    });
    const removed = transcriptionDocument.removeSection(one, 0);

    expect(removed.sections).toEqual([]);
    expect(removed.activeSectionIndex).toBe(0);
  });

  it('adds and removes steps inside a section', () => {
    const withSection = transcriptionDocument.addSection(
      doc,
      'verso',
      undefined,
      { createId: () => 'a' },
    );
    const added = transcriptionDocument.addStepToSection(
      withSection,
      0,
      step('I'),
    );

    expect(added.sections[0].steps).toEqual([step('I')]);

    const removed = transcriptionDocument.removeStepFromSection(added, 0, 0);
    expect(removed.sections[0].steps).toEqual([]);
  });

  it('clamps beats inside a section', () => {
    const withSection = transcriptionDocument.addSection(
      doc,
      'verso',
      undefined,
      { createId: () => 'a' },
    );
    const added = transcriptionDocument.addStepToSection(
      withSection,
      0,
      step('I'),
    );
    const updated = transcriptionDocument.setStepBeatsInSection(
      added,
      0,
      0,
      9.9,
    );

    expect(updated.sections[0].steps[0].beats).toBe(8);
  });

  it('sets step confidence', () => {
    const withSection = transcriptionDocument.addSection(
      doc,
      'verso',
      undefined,
      { createId: () => 'a' },
    );
    const added = transcriptionDocument.addStepToSection(
      withSection,
      0,
      step('I'),
    );
    const updated = transcriptionDocument.setStepConfidenceInSection(
      added,
      0,
      0,
      'sure',
    );

    expect(updated.sections[0].steps[0].confidence).toBe('sure');
  });
});

describe('transcriptionDocument song record', () => {
  const savedSong: Song = {
    id: 'song-1',
    title: 'Garota',
    artist: 'Tom',
    key: 5,
    mode: 'minor',
    originalBpm: 120,
    presetId: 'rhodes',
    sections: [
      { id: 's1', type: 'verso', customLabel: undefined, steps: [step('i')] },
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
  };

  it('plays at the base tempo multiplied by the practice speed', () => {
    const loaded = transcriptionDocument.load(savedSong);
    const slow = transcriptionDocument.setPracticeSpeed(loaded, 50);

    expect(transcriptionDocument.playbackBpm(loaded)).toBe(120);
    expect(transcriptionDocument.playbackBpm(slow)).toBe(60);
    expect(
      transcriptionDocument.playbackBpm(
        transcriptionDocument.setPracticeSpeed(loaded, 75),
      ),
    ).toBe(90);
  });

  it('keeps the base tempo when the practice speed changes', () => {
    let current = transcriptionDocument.load(savedSong);
    // Many plays and speed changes in a row never compound.
    for (const percent of [80, 50, 50, 65, 50]) {
      current = transcriptionDocument.setPracticeSpeed(current, percent);
      expect(current.baseBpm).toBe(120);
    }
    expect(transcriptionDocument.playbackBpm(current)).toBe(60);
  });

  it('clamps the practice speed to 50-150', () => {
    const loaded = transcriptionDocument.load(savedSong);
    expect(
      transcriptionDocument.setPracticeSpeed(loaded, 10).practiceSpeed,
    ).toBe(50);
    expect(
      transcriptionDocument.setPracticeSpeed(loaded, 400).practiceSpeed,
    ).toBe(150);
  });

  it('loads the base tempo, the preset, and every saved field', () => {
    const loaded = transcriptionDocument.load(savedSong);

    expect(loaded.baseBpm).toBe(120);
    expect(loaded.presetId).toBe('rhodes');
    expect(loaded.practiceSpeed).toBe(100);
    expect(loaded.title).toBe('Garota');
    expect(loaded.artist).toBe('Tom');
    expect(loaded.key).toBe(5);
    expect(loaded.mode).toBe('minor');
    expect(loaded.sections).toEqual(savedSong.sections);
    expect(loaded.activeSectionIndex).toBe(0);
    expect(transcriptionDocument.hasUnsavedChanges(loaded)).toBe(false);
  });

  it('builds a song record with the same fields as before', () => {
    const loaded = transcriptionDocument.load(savedSong);
    const record = transcriptionDocument.toSongRecord(loaded);

    expect(Object.keys(record).sort()).toEqual(
      [
        'title',
        'artist',
        'key',
        'mode',
        'originalBpm',
        'presetId',
        'sections',
      ].sort(),
    );
    expect(record).toEqual({
      title: 'Garota',
      artist: 'Tom',
      key: 5,
      mode: 'minor',
      originalBpm: 120,
      presetId: 'rhodes',
      sections: savedSong.sections,
    });
  });

  it('trims the title and the artist of the record', () => {
    const draft = {
      ...transcriptionDocument.load(savedSong),
      title: '  Garota  ',
      artist: ' Tom ',
    };
    const record = transcriptionDocument.toSongRecord(draft);
    expect(record.title).toBe('Garota');
    expect(record.artist).toBe('Tom');
  });

  it('runs save, load, practice speed change, and save again', () => {
    // A new song, edited and saved.
    let current = transcriptionDocument.setBaseBpm(
      transcriptionDocument.addSection(
        { ...transcriptionDocument.create(), title: 'Nova' },
        'verso',
        undefined,
        { createId: () => 'a' },
      ),
      100,
    );
    current = transcriptionDocument.setPreset(current, 'rhodes');
    expect(transcriptionDocument.hasUnsavedChanges(current)).toBe(true);

    const firstSave = transcriptionDocument.toSongRecord(current);
    current = transcriptionDocument.markSaved(current, firstSave);
    expect(firstSave.originalBpm).toBe(100);
    expect(firstSave.presetId).toBe('rhodes');
    expect(transcriptionDocument.hasUnsavedChanges(current)).toBe(false);

    // Load it back.
    current = transcriptionDocument.load({
      id: 'id-1',
      ...firstSave,
      createdAt: 'x',
      updatedAt: 'x',
    });
    expect(current.baseBpm).toBe(100);
    expect(current.presetId).toBe('rhodes');
    expect(transcriptionDocument.hasUnsavedChanges(current)).toBe(false);

    // Practice slowly: not an unsaved change.
    current = transcriptionDocument.setPracticeSpeed(current, 50);
    expect(transcriptionDocument.playbackBpm(current)).toBe(50);
    expect(transcriptionDocument.hasUnsavedChanges(current)).toBe(false);

    // Save again: the base tempo is stored, not the tempo that plays.
    const secondSave = transcriptionDocument.toSongRecord(current);
    current = transcriptionDocument.markSaved(current, secondSave);
    expect(secondSave.originalBpm).toBe(100);
    expect(secondSave.presetId).toBe('rhodes');
    expect(current.baseBpm).toBe(100);
    expect(transcriptionDocument.hasUnsavedChanges(current)).toBe(false);

    // A real change is an unsaved change.
    const edited = transcriptionDocument.addStepToSection(current, 0, step('I'));
    expect(transcriptionDocument.hasUnsavedChanges(edited)).toBe(true);
    expect(
      transcriptionDocument.hasUnsavedChanges(
        transcriptionDocument.setBaseBpm(current, 110),
      ),
    ).toBe(true);
    expect(
      transcriptionDocument.hasUnsavedChanges(
        transcriptionDocument.setPreset(current, 'piano'),
      ),
    ).toBe(true);
  });

  it('treats an empty new song as saved, and a started one as unsaved', () => {
    const fresh = transcriptionDocument.create();
    expect(transcriptionDocument.hasUnsavedChanges(fresh)).toBe(false);
    expect(
      transcriptionDocument.hasUnsavedChanges({ ...fresh, title: 'x' }),
    ).toBe(true);
    expect(
      transcriptionDocument.hasUnsavedChanges(
        transcriptionDocument.addSection(fresh, 'verso', undefined, {
          createId: () => 'a',
        }),
      ),
    ).toBe(true);
    expect(
      transcriptionDocument.hasUnsavedChanges(
        transcriptionDocument.setPracticeSpeed(fresh, 50),
      ),
    ).toBe(false);
  });

  it('builds an import record that keeps the base tempo and preset', () => {
    const current = transcriptionDocument.setPracticeSpeed(
      transcriptionDocument.load(savedSong),
      50,
    );
    const record = transcriptionDocument.importRecord(current, {
      title: 'Importada',
      artist: 'GP',
      key: 2,
      mode: 'major',
      sections: [],
    });

    expect(record).toEqual({
      title: 'Importada',
      artist: 'GP',
      key: 2,
      mode: 'major',
      originalBpm: 120,
      presetId: 'rhodes',
      sections: [],
    });
  });

  it('builds an import record with the mode chosen in the import panel', () => {
    // The open song is major; the import panel chose minor.
    const current = transcriptionDocument.create({ key: 0, mode: 'major' });
    const record = transcriptionDocument.importRecord(current, {
      title: 'Importada',
      artist: 'GP',
      key: 9,
      mode: 'minor',
      sections: [],
    });
    expect(record.key).toBe(9);
    expect(record.mode).toBe('minor');

    const loaded = transcriptionDocument.load({
      id: 'gp-1',
      ...record,
      createdAt: 'x',
      updatedAt: 'x',
    });
    expect(loaded.key).toBe(9);
    expect(loaded.mode).toBe('minor');
  });

  it('sets the key and the mode of the song', () => {
    const loaded = transcriptionDocument.load(savedSong);
    const inD = transcriptionDocument.setKey(loaded, 2);
    expect(inD.key).toBe(2);
    expect(inD.mode).toBe('minor');
    expect(transcriptionDocument.setKey(loaded, 14).key).toBe(2);
    expect(transcriptionDocument.setKey(loaded, -1).key).toBe(11);

    const major = transcriptionDocument.setMode(loaded, 'major');
    expect(major.mode).toBe('major');
    expect(major.key).toBe(5);

    expect(transcriptionDocument.hasUnsavedChanges(inD)).toBe(true);
    expect(transcriptionDocument.hasUnsavedChanges(major)).toBe(true);
    expect(
      transcriptionDocument.hasUnsavedChanges(
        transcriptionDocument.setKey(loaded, 5),
      ),
    ).toBe(false);
  });

  it('restores the key, the mode, the base tempo, and the preset after a save and a load', () => {
    let current = transcriptionDocument.addSection(
      { ...transcriptionDocument.create(), title: 'Nova' },
      'verso',
      undefined,
      { createId: () => 'a' },
    );
    current = transcriptionDocument.setKey(current, 7);
    current = transcriptionDocument.setMode(current, 'minor');
    current = transcriptionDocument.setBaseBpm(current, 132);
    current = transcriptionDocument.setPreset(current, 'rhodes');
    current = transcriptionDocument.setPracticeSpeed(current, 60);

    const record = transcriptionDocument.toSongRecord(current);
    expect(record.key).toBe(7);
    expect(record.mode).toBe('minor');
    expect(record.originalBpm).toBe(132);
    expect(record.presetId).toBe('rhodes');

    const loaded = transcriptionDocument.load({
      id: 'id-1',
      ...record,
      createdAt: 'x',
      updatedAt: 'x',
    });
    expect(loaded.key).toBe(7);
    expect(loaded.mode).toBe('minor');
    expect(loaded.baseBpm).toBe(132);
    expect(loaded.presetId).toBe('rhodes');
    expect(loaded.practiceSpeed).toBe(100);
    expect(transcriptionDocument.hasUnsavedChanges(loaded)).toBe(false);
  });
});
