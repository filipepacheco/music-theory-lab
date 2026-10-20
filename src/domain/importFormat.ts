export type ImportFormat = 'gp' | 'rocksmith' | 'midi';

export function importFormat(name: string): ImportFormat | null {
  const extension = /\.([^.]+)$/.exec(name)?.[1].toLowerCase();
  if (extension === 'gp') return 'gp';
  if (extension === 'psarc') return 'rocksmith';
  if (extension === 'mid' || extension === 'midi') return 'midi';
  return null;
}
