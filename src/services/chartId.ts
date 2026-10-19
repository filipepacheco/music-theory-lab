import type { ChartPart } from '@/domain/chartSummary';

export async function sha256Hex(
  bytes: Uint8Array<ArrayBuffer>,
): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

export async function partChartId(
  fileHash: string,
  part: ChartPart,
): Promise<string> {
  if (part === 'bass') return fileHash;
  return sha256Hex(new TextEncoder().encode(`${fileHash}:${part}`));
}
