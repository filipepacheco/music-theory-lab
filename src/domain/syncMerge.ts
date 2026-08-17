import type { ProgressionStep } from '@/constants/progressions';
import type { Song, SongStructure } from '@/types';

export interface SavedProgression {
  id: string;
  name: string;
  description: string;
  steps: ProgressionStep[];
  mode: 'major' | 'minor';
  presetId: string;
  bpm: number;
  isExample: boolean;
  createdAt: string;
}

export interface CloudProgression {
  id: string;
  name: string;
  description: string;
  steps: string;
  mode: string;
  preset_id: string;
  bpm: number;
  is_example: number;
  created_at: string;
}

export interface CloudSong {
  id: string;
  title: string;
  artist: string;
  key_note: number;
  mode: string;
  original_bpm: number;
  preset_id: string;
  sections: string;
  created_at: string;
  updated_at: string;
}

export interface CloudStructure {
  id: string;
  title: string;
  artist: string;
  bpm: number;
  bars: string;
  sections: string;
  created_at: string;
  updated_at: string;
}

export interface UnionMerge<Local, Cloud> {
  cloudOnly: Cloud[];
  localOnly: Local[];
}

export interface LastWriteWinsMerge<Local, Cloud> {
  cloudToApply: Cloud[];
  localToPush: Local[];
}

export function mergeProgressions(
  local: SavedProgression[],
  cloud: CloudProgression[],
): UnionMerge<SavedProgression, CloudProgression> {
  const localIds = new Set(local.map((record) => record.id));
  const cloudIds = new Set(cloud.map((record) => record.id));
  return {
    cloudOnly: cloud.filter((record) => !localIds.has(record.id)),
    localOnly: local.filter((record) => !cloudIds.has(record.id)),
  };
}

export function mergeLastWriteWins<
  Local extends { id: string; updatedAt: string },
  Cloud extends { id: string; updated_at: string },
>(local: Local[], cloud: Cloud[]): LastWriteWinsMerge<Local, Cloud> {
  const localById = new Map(local.map((record) => [record.id, record]));
  const cloudIds = new Set(cloud.map((record) => record.id));
  return {
    cloudToApply: cloud.filter((record) => {
      const localRecord = localById.get(record.id);
      return !localRecord || record.updated_at > localRecord.updatedAt;
    }),
    localToPush: local.filter((record) => !cloudIds.has(record.id)),
  };
}

export type SavedLibraryRecord = SavedProgression | Song | SongStructure;
