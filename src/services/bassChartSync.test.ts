import { describe, expect, it, vi, afterEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { fixtureChart } from '@/domain/bassChartFixture';
import {
  parseBassChartRecord,
  type BassChartRecord,
} from '@/domain/bassChartRecord';
import { createIndexedDbRocksmithLibrary } from '@/services/rocksmithLibrary';
import {
  synchronizeBassCharts,
  chartCloud,
  type ChartCloud,
} from '@/services/bassChartSync';

const chart = {
  ...fixtureChart(2, [{ bar: 0, beat: 0, midi: 33 }]),
  id: 'a'.repeat(64),
  source: 'gp' as const,
  originalFingering: [{ string: 1, fret: 0 }],
};

function cloud(
  records: BassChartRecord[] = [],
): ChartCloud & { records: Map<string, BassChartRecord> } {
  const stored = new Map(records.map((r) => [r.id, r]));
  return {
    records: stored,
    pull: async () => [...stored.values()],
    push: async (record) => {
      stored.set(record.id, record);
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('bass chart persistence and sync', () => {
  it('makes a GP import available on a second device without its audio', async () => {
    const first = createIndexedDbRocksmithLibrary(new IDBFactory());
    const second = createIndexedDbRocksmithLibrary(new IDBFactory());
    const remote = cloud();
    await first.save(chart, {
      chartId: chart.id,
      fileName: 'local.mp3',
      blob: new Blob(['audio']),
      origin: 'local',
    });
    await synchronizeBassCharts(first, remote);
    await synchronizeBassCharts(second, remote);
    expect(await second.listCharts()).toEqual([chart]);
    expect(await second.getAudio(chart.id)).toBeNull();
    expect(await first.getAudio(chart.id)).not.toBeNull();
  });

  it('keeps deletions after an offline device reconnects', async () => {
    const first = createIndexedDbRocksmithLibrary(new IDBFactory());
    const second = createIndexedDbRocksmithLibrary(new IDBFactory());
    const remote = cloud();
    await first.save(chart, null);
    await synchronizeBassCharts(first, remote);
    await synchronizeBassCharts(second, remote);
    await first.remove(chart.id);
    await synchronizeBassCharts(first, remote);
    await synchronizeBassCharts(second, remote);
    expect(await second.listCharts()).toEqual([]);
    expect(remote.records.get(chart.id)?.chart).toBeNull();
  });

  it('retries failed uploads while keeping the local import', async () => {
    const local = createIndexedDbRocksmithLibrary(new IDBFactory());
    const remote = cloud();
    await local.save(chart, null);
    await expect(
      synchronizeBassCharts(local, {
        ...remote,
        push: async () => {
          throw new Error('offline');
        },
      }),
    ).rejects.toThrow('offline');
    expect(await local.listCharts()).toEqual([chart]);
    await synchronizeBassCharts(local, remote);
    expect(remote.records.get(chart.id)?.chart).toEqual(chart);
  });

  it('does not overwrite a deletion made while the cloud pull is in flight', async () => {
    const local = createIndexedDbRocksmithLibrary(new IDBFactory());
    const older = {
      id: chart.id,
      updatedAt: '2026-01-01T00:00:00.000Z',
      chart,
    };
    const remote = cloud([older]);
    await local.save(chart, null);
    remote.pull = async () => {
      await local.remove(chart.id);
      return [older];
    };
    await synchronizeBassCharts(local, remote);
    expect(await local.listCharts()).toEqual([]);
    expect(remote.records.get(chart.id)?.chart).toBeNull();
  });

  it('migrates existing v1 browser imports into the synchronization journal', async () => {
    const factory = new IDBFactory();
    await new Promise<void>((resolve, reject) => {
      const request = factory.open('music-theory-lab-rocksmith', 1);
      request.onupgradeneeded = () => {
        request.result
          .createObjectStore('charts', { keyPath: 'id' })
          .put(chart);
        request.result.createObjectStore('audio', { keyPath: 'chartId' });
      };
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
    const local = createIndexedDbRocksmithLibrary(factory);
    expect(await local.listCharts()).toEqual([chart]);
    expect(await local.listRecords()).toEqual([
      { id: chart.id, updatedAt: '2026-01-01T00:00:00.000Z', chart },
    ]);
  });

  it('upgrades a version 2 database and keeps charts, records and recordings', async () => {
    const factory = new IDBFactory();
    const older = { ...chart, id: 'b'.repeat(64), title: 'Older' };
    const record = {
      id: chart.id,
      updatedAt: '2026-02-02T00:00:00.000Z',
      chart,
    };
    const deletion = {
      id: 'c'.repeat(64),
      updatedAt: '2026-03-03T00:00:00.000Z',
      chart: null,
    };
    const audio = {
      chartId: chart.id,
      fileName: 'local.mp3',
      blob: new Blob(['audio']),
      origin: 'local' as const,
    };
    await new Promise<void>((resolve, reject) => {
      const request = factory.open('music-theory-lab-rocksmith', 2);
      request.onupgradeneeded = () => {
        const charts = request.result.createObjectStore('charts', {
          keyPath: 'id',
        });
        charts.put(chart);
        charts.put(older);
        request.result
          .createObjectStore('audio', { keyPath: 'chartId' })
          .put(audio);
        const records = request.result.createObjectStore('records', {
          keyPath: 'id',
        });
        records.put(record);
        records.put(deletion);
      };
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
    const local = createIndexedDbRocksmithLibrary(factory);
    expect(await local.listCharts()).toEqual([chart, older]);
    expect(await local.listRecords()).toEqual([record, deletion]);
    expect((await local.getAudio(chart.id))?.fileName).toBe('local.mp3');
    expect(await local.listSettings()).toEqual([]);
    expect(await local.listSummaries()).toEqual([
      {
        id: chart.id,
        title: 'Test',
        artist: '',
        source: 'gp',
        part: 'bass',
        tempoBpm: 120,
        durationSeconds: 4,
        barCount: 2,
        noteCount: 1,
        tuning: [0, 0, 0, 0],
        importedAt: '2026-01-01T00:00:00Z',
      },
      expect.objectContaining({ id: older.id, title: 'Older', part: 'bass' }),
    ]);
  });

  it('keeps one summary for each chart through save, sync and deletion', async () => {
    const first = createIndexedDbRocksmithLibrary(new IDBFactory());
    const second = createIndexedDbRocksmithLibrary(new IDBFactory());
    const remote = cloud();
    const summaryIds = async (local: typeof first) =>
      (await local.listSummaries()).map((summary) => summary.id);
    const chartIds = async (local: typeof first) =>
      (await local.listCharts()).map((stored) => stored.id);

    await first.save(chart, null);
    expect(await summaryIds(first)).toEqual([chart.id]);
    await first.save({ ...chart, title: 'Renamed' }, null);
    expect(await first.listSummaries()).toEqual([
      expect.objectContaining({ id: chart.id, title: 'Renamed' }),
    ]);

    await synchronizeBassCharts(first, remote);
    await synchronizeBassCharts(second, remote);
    expect(await summaryIds(second)).toEqual(await chartIds(second));
    expect(await second.listSummaries()).toEqual(await first.listSummaries());

    await first.remove(chart.id);
    expect(await summaryIds(first)).toEqual([]);
    await synchronizeBassCharts(first, remote);
    await synchronizeBassCharts(second, remote);
    expect(await chartIds(second)).toEqual([]);
    expect(await summaryIds(second)).toEqual([]);
  });

  it('reads and writes chart settings, and keeps them after a chart deletion', async () => {
    const local = createIndexedDbRocksmithLibrary(new IDBFactory());
    const settings = {
      chartId: chart.id,
      updatedAt: '2026-04-04T00:00:00.000Z',
      songLineLength: 4,
      sectionLineLengths: { 0: 'auto' as const, 8: 2 },
      groupOverride: 'separate',
    };
    const other = { ...settings, chartId: 'b'.repeat(64), songLineLength: 8 };
    expect(await local.getSettings(chart.id)).toBeNull();
    await local.save(chart, null);
    await local.saveSettings(settings);
    await local.saveSettings(other);
    expect(await local.getSettings(chart.id)).toEqual(settings);
    expect(await local.listSettings()).toEqual([settings, other]);

    await local.remove(chart.id);
    expect(await local.getSettings(chart.id)).toEqual(settings);
    await local.save(chart, null);
    await local.applyRecord({
      id: chart.id,
      updatedAt: '2099-01-01T00:00:00.000Z',
      chart: null,
    });
    expect(await local.listCharts()).toEqual([]);
    expect(await local.listSettings()).toEqual([settings, other]);
  });

  it('rejects corrupt data and original audio payloads', () => {
    const record = { id: chart.id, updatedAt: chart.importedAt, chart };
    expect(parseBassChartRecord(record)).not.toBeNull();
    for (const originalFingering of [
      [],
      [{ string: 1, fret: 7 }],
      [{ string: 4, fret: 0 }],
    ]) {
      expect(
        parseBassChartRecord({
          ...record,
          chart: { ...chart, originalFingering },
        }),
      ).toBeNull();
    }
    expect(
      parseBassChartRecord({
        ...record,
        chart: { ...chart, notes: [{ ...chart.notes[0], string: 99 }] },
      }),
    ).toBeNull();
    expect(
      parseBassChartRecord({ ...record, chart: { ...chart, audio: 'binary' } }),
    ).toBeNull();
    expect(parseBassChartRecord({ ...record, id: 'b'.repeat(64) })).toBeNull();
    expect(
      parseBassChartRecord({ ...record, updatedAt: 'invalid' }),
    ).toBeNull();
  });

  it('reports HTTP failures instead of treating them as successful saves', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    );
    vi.stubGlobal('localStorage', { getItem: () => 'device' });
    await expect(chartCloud.pull()).rejects.toThrow('500');
    await expect(
      chartCloud.push({ id: chart.id, updatedAt: chart.importedAt, chart }),
    ).rejects.toThrow('500');
  });
});
