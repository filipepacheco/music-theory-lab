import type { ChartPart } from '@/domain/chartSummary';

export async function sha256Hex(
  bytes: Uint8Array<ArrayBuffer>,
): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

/**
 * The id of the chart of one part of a file. The bass chart keeps the hash
 * of the file, so a chart from before the drum charts stays the same chart.
 * A different part gets a hash of the file hash and the part name.
 */
export async function partChartId(
  fileHash: string,
  part: ChartPart,
): Promise<string> {
  if (part === 'bass') return fileHash;
  return sha256Hex(new TextEncoder().encode(`${fileHash}:${part}`));
}
