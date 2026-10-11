// "Blueprint world" palette. Change colours here and every video follows.
export const colors = {
  ink: '#0E2440',
  blueprint: '#163A5F',
  grid: '#21497280',
  gridStrong: '#2C5A85',
  chalk: '#F2EFE6',
  haze: '#9DB8D2',
  amber: '#F2A93B',
  coral: '#E8684A',
  mint: '#5CC8A8',
  mintShade: '#4AAE91',
  mintDot: '#2F8F74',
} as const;

// Node colours the scene planner is allowed to use.
export const nodeColors: Record<string, string> = {
  amber: colors.amber,
  coral: colors.coral,
  mint: colors.mint,
  chalk: colors.chalk,
  haze: colors.haze,
};

export const fonts = {
  display: "'Bricolage Grotesque', sans-serif",
  mono: "'IBM Plex Mono', monospace",
};

/** Mix two hex colours: t = 0 gives a, t = 1 gives b. */
export const mix = (a: string, b: string, t: number): string => {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return '#' + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('');
};
