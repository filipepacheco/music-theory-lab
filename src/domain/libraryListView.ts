import type { BassChartSource } from '@/domain/bassChart';
import { tuningLabel } from '@/domain/bassChart';
import type { ChartPart } from '@/domain/chartSummary';
import type { LibrarySong } from '@/domain/librarySong';

export type SortKey = 'imported' | 'title' | 'artist' | 'tempo';
export type SourceFilter = 'all' | BassChartSource | 'analysis';
export type LinkedFilter = 'all' | 'linked' | 'unlinked';

export interface ListView {
  search: string;
  source: SourceFilter;
  part: 'all' | ChartPart;
  tuning: string;
  linked: LinkedFilter;
  sort: SortKey;
}

export const DEFAULT_LIST_VIEW: ListView = {
  search: '',
  source: 'all',
  part: 'all',
  tuning: 'all',
  linked: 'all',
  sort: 'imported',
};

export function foldText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function tuningOf(tuning: number[]): string {
  return tuningLabel(tuning);
}

export function tuningOptions(songs: LibrarySong[]): string[] {
  const labels = new Set<string>();
  for (const song of songs) {
    for (const chart of song.charts) {
      if (chart.tuning) labels.add(tuningOf(chart.tuning));
    }
  }
  return [...labels].sort((a, b) => a.localeCompare(b));
}

export function isNarrowed(view: ListView): boolean {
  return (
    foldText(view.search) !== '' ||
    view.source !== 'all' ||
    view.part !== 'all' ||
    view.tuning !== 'all' ||
    view.linked !== 'all'
  );
}

function matchesSearch(song: LibrarySong, search: string): boolean {
  const words = foldText(search).split(' ').filter(Boolean);
  if (words.length === 0) return true;
  const haystack = foldText(`${song.title} ${song.artist}`);
  return words.every((word) => haystack.includes(word));
}

function matchesSource(song: LibrarySong, source: SourceFilter): boolean {
  if (source === 'all') return true;
  if (source === 'analysis') return song.analysed.length > 0;
  return song.sources.includes(source);
}

export function filterSongs(
  songs: LibrarySong[],
  view: ListView,
  linkedChartIds: ReadonlySet<string>,
): LibrarySong[] {
  return songs.filter((song) => {
    if (!matchesSearch(song, view.search)) return false;
    if (!matchesSource(song, view.source)) return false;
    if (view.part !== 'all' && !song.parts.includes(view.part)) return false;
    if (
      view.tuning !== 'all' &&
      !song.charts.some(
        (chart) => chart.tuning && tuningOf(chart.tuning) === view.tuning,
      )
    ) {
      return false;
    }
    if (view.linked !== 'all') {
      const linked = song.charts.some((chart) => linkedChartIds.has(chart.id));
      if (linked !== (view.linked === 'linked')) return false;
    }
    return true;
  });
}

function importTime(song: LibrarySong): number | null {
  const times = song.charts
    .map((chart) => new Date(chart.importedAt).getTime())
    .filter((time) => !Number.isNaN(time));
  return times.length > 0 ? Math.max(...times) : null;
}

function tempoOf(song: LibrarySong): number | null {
  return song.charts[0]?.tempoBpm || null;
}

const collator = new Intl.Collator('pt-BR', { sensitivity: 'base' });

function compareNullable(
  a: number | null,
  b: number | null,
  direction: 1 | -1,
): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return (a - b) * direction;
}

export function sortSongs(songs: LibrarySong[], sort: SortKey): LibrarySong[] {
  const primary = (a: LibrarySong, b: LibrarySong): number => {
    switch (sort) {
      case 'imported':
        return compareNullable(importTime(a), importTime(b), -1);
      case 'title':
        return collator.compare(a.title, b.title);
      case 'artist':
        return collator.compare(a.artist, b.artist);
      case 'tempo':
        return compareNullable(tempoOf(a), tempoOf(b), 1);
    }
  };
  return [...songs].sort(
    (a, b) =>
      primary(a, b) ||
      collator.compare(a.title, b.title) ||
      a.key.localeCompare(b.key),
  );
}

export function applyListView(
  songs: LibrarySong[],
  view: ListView,
  linkedChartIds: ReadonlySet<string>,
): LibrarySong[] {
  return sortSongs(filterSongs(songs, view, linkedChartIds), view.sort);
}
