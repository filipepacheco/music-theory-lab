import { useEffect, useRef, useState } from 'react';
import { probeAudioUrl } from '@/components/library/audioSource';
import type { LibraryIndexEntry } from '@/components/library/libraryData';
import {
  attachLocalAudio,
  indexedDbLocalAudioRepository,
  type AttachLocalAudioResult,
} from '@/services/localAudioSource';

export type LibraryAudioSource =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'ready'; url: string; localFileName: string | null };

export type AudioAttachmentStatus =
  AttachLocalAudioResult['status'] | 'idle' | 'checking';

export function useLibraryAudioSource(track: LibraryIndexEntry): {
  audioSource: LibraryAudioSource;
  attachmentStatus: AudioAttachmentStatus;
  attachAudio(file: File): Promise<void>;
} {
  const [audioSource, setAudioSource] = useState<LibraryAudioSource>({
    status: 'loading',
  });
  const [attachmentStatus, setAttachmentStatus] =
    useState<AudioAttachmentStatus>('idle');
  const [associationRevision, setAssociationRevision] = useState(0);
  const currentTrackSha = useRef(track.source_sha256);
  currentTrackSha.current = track.source_sha256;

  useEffect(() => {
    setAttachmentStatus('idle');
  }, [track.source_sha256]);

  useEffect(() => {
    const controller = new AbortController();
    let localUrl: string | null = null;
    setAudioSource({ status: 'loading' });

    const loadAudioSource = async () => {
      try {
        const association = await indexedDbLocalAudioRepository.get(
          track.source_sha256,
        );
        if (controller.signal.aborted) return;
        if (association) {
          localUrl = URL.createObjectURL(association.blob);
          setAudioSource({
            status: 'ready',
            url: localUrl,
            localFileName: association.fileName,
          });
          return;
        }
      } catch {
        // A blocked/unavailable IndexedDB must not hide a published source.
      }

      const publishedUrl = await probeAudioUrl(track, controller.signal);
      if (controller.signal.aborted) return;
      setAudioSource(
        publishedUrl
          ? { status: 'ready', url: publishedUrl, localFileName: null }
          : { status: 'missing' },
      );
    };

    void loadAudioSource().catch(() => {
      if (!controller.signal.aborted) setAudioSource({ status: 'missing' });
    });
    return () => {
      controller.abort();
      if (localUrl) URL.revokeObjectURL(localUrl);
    };
  }, [associationRevision, track]);

  const attachAudio = async (file: File) => {
    const targetSha = track.source_sha256;
    setAttachmentStatus('checking');
    const result = await attachLocalAudio(
      file,
      targetSha,
      indexedDbLocalAudioRepository,
    );
    if (currentTrackSha.current !== targetSha) return;
    setAttachmentStatus(result.status);
    if (result.status === 'attached') {
      setAssociationRevision((revision) => revision + 1);
    }
  };

  return { audioSource, attachmentStatus, attachAudio };
}
