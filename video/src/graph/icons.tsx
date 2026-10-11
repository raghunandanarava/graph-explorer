import React from 'react';
import { colors } from '../theme';

// Node icons, drawn in a 100 x 100 box centred on (0, 0), in the same
// risograph style as Vertie: colour fills printed slightly off the ink lines.
// Each icon is a function of `p(fill)`, which returns the props for one shape
// in the current printing pass. Add an icon here AND to ICONS in
// pipeline/plan_schema.py so the script-writer can use it.

type Pass = 'fill' | 'line';
type P = (fill?: string) => React.SVGProps<SVGElement>;

const { ink, chalk, haze, amber, coral, mint } = colors;

const gearPath = (() => {
  const teeth = 8;
  const pts: string[] = [];
  for (let i = 0; i < teeth * 2; i++) {
    const a0 = (i / (teeth * 2)) * Math.PI * 2;
    const a1 = ((i + 1) / (teeth * 2)) * Math.PI * 2;
    const r = i % 2 === 0 ? 38 : 28;
    pts.push(`${(Math.cos(a0) * r).toFixed(1)} ${(Math.sin(a0) * r).toFixed(1)}`);
    pts.push(`${(Math.cos(a1) * r).toFixed(1)} ${(Math.sin(a1) * r).toFixed(1)}`);
  }
  return `M${pts.join(' L')} Z`;
})();

const person = (p: P, dx = 0, s = 1, c1: string = amber, c2: string = coral) => (
  <g transform={`translate(${dx} 0) scale(${s})`}>
    <circle cy={-20} r={13} {...(p(c1) as object)} />
    <path d="M-24 36 C-24 4 24 4 24 36 Z" {...(p(c2) as object)} />
  </g>
);

export const ICONS: Record<string, (p: P) => React.ReactNode> = {
  sun: (p) => (
    <g>
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2;
        return <line key={i} x1={Math.cos(a) * 30} y1={Math.sin(a) * 30} x2={Math.cos(a) * 44} y2={Math.sin(a) * 44} {...(p() as object)} />;
      })}
      <circle r={22} {...(p(amber) as object)} />
    </g>
  ),
  moon: (p) => <path d="M10 -36 A38 38 0 1 0 10 36 A30 30 0 1 1 10 -36 Z" {...(p(haze) as object)} />,
  cloud: (p) => <path d="M-38 22 A16 16 0 0 1 -30 -6 A22 22 0 0 1 8 -22 A20 20 0 0 1 36 2 A11 11 0 0 1 32 22 Z" {...(p(chalk) as object)} />,
  raindrop: (p) => (
    <g>
      <path d="M0 -40 C14 -18 28 0 28 14 A28 28 0 0 1 -28 14 C-28 0 -14 -18 0 -40 Z" {...(p(haze) as object)} />
      <path d="M-14 12 A14 14 0 0 0 -2 26" {...(p() as object)} />
    </g>
  ),
  snowflake: (p) => (
    <g>
      {[0, 60, 120].map((a) => (
        <g key={a} transform={`rotate(${a})`}>
          <line x1={0} y1={-40} x2={0} y2={40} {...(p() as object)} />
          <path d="M-10 -34 L0 -24 L10 -34 M-10 34 L0 24 L10 34" {...(p() as object)} />
        </g>
      ))}
    </g>
  ),
  lightning: (p) => <path d="M8 -42 L-22 6 H0 L-8 42 L24 -8 H2 Z" {...(p(amber) as object)} />,
  wave: (p) => (
    <g>
      <path d="M-40 -2 Q-30 -14 -20 -2 T0 -2 T20 -2 T40 -2 V32 H-40 Z" {...(p(mint) as object)} />
      <path d="M-34 -22 Q-24 -32 -14 -22 T6 -22" {...(p() as object)} />
    </g>
  ),
  vapour: (p) => (
    <g>
      {[-20, 0, 20].map((x) => (
        <path key={x} d={`M${x} 34 C${x - 12} 18 ${x + 12} 8 ${x} -6 C${x - 12} -20 ${x + 12} -28 ${x} -40`} {...(p() as object)} />
      ))}
    </g>
  ),
  mountain: (p) => (
    <g>
      <path d="M-44 32 L-10 -26 L4 -2 L16 -16 L44 32 Z" {...(p(haze) as object)} />
      <path d="M-10 -26 L-20 -8 L-12 -12 L-6 -4 L0 -12 Z" {...(p(chalk) as object)} />
    </g>
  ),
  tree: (p) => (
    <g>
      <rect x={-6} y={6} width={12} height={32} rx={3} {...(p(coral) as object)} />
      <circle cy={-10} r={28} {...(p(mint) as object)} />
    </g>
  ),
  seedling: (p) => (
    <g>
      <ellipse cy={34} rx={28} ry={6} {...(p(haze) as object)} />
      <line x1={0} y1={32} x2={0} y2={-2} {...(p() as object)} />
      <path d="M0 2 C-4 -16 -26 -20 -32 -8 C-26 4 -8 8 0 2 Z" {...(p(mint) as object)} />
      <path d="M0 -6 C4 -24 26 -28 32 -16 C26 -4 8 0 0 -6 Z" {...(p(mint) as object)} />
    </g>
  ),
  flower: (p) => (
    <g>
      <line x1={0} y1={8} x2={0} y2={42} {...(p() as object)} />
      {Array.from({ length: 5 }, (_, i) => {
        const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
        return <circle key={i} cx={Math.cos(a) * 16} cy={-8 + Math.sin(a) * 16} r={12} {...(p(coral) as object)} />;
      })}
      <circle cy={-8} r={9} {...(p(amber) as object)} />
    </g>
  ),
  fire: (p) => (
    <g>
      <path d="M0 -42 C20 -18 30 0 26 16 A26 26 0 0 1 -26 16 C-30 0 -14 -10 -10 -26 C-4 -16 0 -14 4 -12 C6 -22 2 -32 0 -42 Z" {...(p(coral) as object)} />
      <path d="M0 4 C8 12 12 18 10 24 A10 10 0 0 1 -10 24 C-12 18 -6 12 0 4 Z" {...(p(amber) as object)} />
    </g>
  ),
  earth: (p) => (
    <g>
      <circle r={38} {...(p(haze) as object)} />
      <path d="M-22 -22 C-8 -30 8 -18 -2 -6 C-10 4 -28 0 -22 -22 Z" {...(p(mint) as object)} />
      <path d="M8 6 C20 0 32 12 22 26 C14 32 4 20 8 6 Z" {...(p(mint) as object)} />
    </g>
  ),
  fish: (p) => (
    <g>
      <path d="M-26 0 L-44 -16 L-44 16 Z" {...(p(amber) as object)} />
      <path d="M-30 0 C-14 -24 20 -24 30 0 C20 24 -14 24 -30 0 Z" {...(p(mint) as object)} />
      <circle cx={16} cy={-4} r={4} fill={ink} />
    </g>
  ),
  paw: (p) => (
    <g>
      <ellipse cy={14} rx={18} ry={15} {...(p(coral) as object)} />
      {[[-24, -8], [-9, -24], [9, -24], [24, -8]].map(([x, y]) => (
        <circle key={`${x}`} cx={x} cy={y} r={8} {...(p(coral) as object)} />
      ))}
    </g>
  ),
  person: (p) => person(p),
  people: (p) => (
    <g>
      {person(p, 16, 0.8, chalk, mint)}
      {person(p, -14, 0.9)}
    </g>
  ),
  heart: (p) => <path d="M0 34 C-40 6 -36 -30 -12 -30 C-4 -30 0 -24 0 -20 C0 -24 4 -30 12 -30 C36 -30 40 6 0 34 Z" {...(p(coral) as object)} />,
  brain: (p) => (
    <g>
      <path d="M0 -30 C-20 -36 -40 -20 -36 -2 C-42 14 -26 34 -4 28 L0 28 Z" {...(p(coral) as object)} />
      <path d="M0 -30 C20 -36 40 -20 36 -2 C42 14 26 34 4 28 L0 28 Z" {...(p(coral) as object)} />
      <path d="M0 -30 V28 M-24 -12 C-14 -14 -10 -4 -18 4 M24 -12 C14 -14 10 -4 18 4 M-22 18 C-14 12 -8 18 -10 24" {...(p() as object)} />
    </g>
  ),
  cell: (p) => (
    <g>
      <ellipse rx={40} ry={30} {...(p(mint) as object)} />
      <circle cx={6} cy={-2} r={12} {...(p(amber) as object)} />
      <circle cx={-22} cy={8} r={3} fill={ink} />
      <circle cx={-14} cy={-14} r={3} fill={ink} />
      <circle cx={24} cy={14} r={3} fill={ink} />
    </g>
  ),
  virus: (p) => (
    <g>
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2;
        return (
          <g key={i}>
            <line x1={Math.cos(a) * 22} y1={Math.sin(a) * 22} x2={Math.cos(a) * 34} y2={Math.sin(a) * 34} {...(p() as object)} />
            <circle cx={Math.cos(a) * 38} cy={Math.sin(a) * 38} r={5} {...(p(amber) as object)} />
          </g>
        );
      })}
      <circle r={22} {...(p(coral) as object)} />
    </g>
  ),
  atom: (p) => (
    <g>
      {[0, 60, 120].map((a) => (
        <ellipse key={a} rx={42} ry={15} transform={`rotate(${a})`} {...(p() as object)} />
      ))}
      <circle r={9} {...(p(coral) as object)} />
    </g>
  ),
  gear: (p) => (
    <g>
      <path d={gearPath} {...(p(haze) as object)} />
      <circle r={10} {...(p(colors.ink) as object)} />
    </g>
  ),
  bulb: (p) => (
    <g>
      <circle cy={-10} r={26} {...(p(amber) as object)} />
      <rect x={-12} y={14} width={24} height={20} rx={4} {...(p(haze) as object)} />
      <path d="M-12 22 H12 M-8 -6 L0 4 L8 -6" {...(p() as object)} />
    </g>
  ),
  battery: (p) => (
    <g>
      <rect x={-36} y={-20} width={66} height={40} rx={7} {...(p(chalk) as object)} />
      <rect x={-29} y={-13} width={36} height={26} rx={3} {...(p(mint) as object)} />
      <rect x={32} y={-9} width={8} height={18} rx={2} {...(p(haze) as object)} />
    </g>
  ),
  factory: (p) => (
    <g>
      <circle cx={26} cy={-40} r={6} {...(p(chalk) as object)} />
      <circle cx={34} cy={-50} r={8} {...(p(chalk) as object)} />
      <path d="M-42 34 V-4 L-22 8 V-4 L-2 8 V-4 L18 8 V-30 H32 V34 Z" {...(p(haze) as object)} />
    </g>
  ),
  house: (p) => (
    <g>
      <rect x={-28} y={-4} width={56} height={38} {...(p(chalk) as object)} />
      <path d="M-38 -2 L0 -36 L38 -2 Z" {...(p(coral) as object)} />
      <rect x={-7} y={14} width={14} height={20} {...(p(amber) as object)} />
    </g>
  ),
  coin: (p) => (
    <g>
      <circle r={34} {...(p(amber) as object)} />
      <circle r={25} {...(p() as object)} />
      <text y={12} textAnchor="middle" fontFamily="'Bricolage Grotesque', sans-serif" fontWeight={800} fontSize={34} fill={ink}>
        £
      </text>
    </g>
  ),
  chart: (p) => (
    <g>
      <rect x={-28} y={14} width={14} height={20} {...(p(mint) as object)} />
      <rect x={-8} y={-2} width={14} height={36} {...(p(amber) as object)} />
      <rect x={12} y={-20} width={14} height={54} {...(p(coral) as object)} />
      <path d="M-40 -40 V34 H42" {...(p() as object)} />
    </g>
  ),
  clock: (p) => (
    <g>
      <circle r={36} {...(p(chalk) as object)} />
      <path d="M0 0 V-24 M0 0 L16 10" {...(p() as object)} />
      <circle r={4} fill={ink} />
    </g>
  ),
  thermometer: (p) => (
    <g>
      <rect x={-11} y={-42} width={22} height={58} rx={11} {...(p(chalk) as object)} />
      <circle cy={24} r={18} {...(p(coral) as object)} />
      <rect x={-5} y={-18} width={10} height={36} rx={5} {...(p(coral) as object)} />
      <path d="M14 -30 H22 M14 -18 H22 M14 -6 H22" {...(p() as object)} />
    </g>
  ),
  apple: (p) => (
    <g>
      <path d="M2 -20 C6 -30 14 -36 20 -36 C20 -28 12 -22 2 -20 Z" {...(p(mint) as object)} />
      <path d="M0 -16 C-24 -32 -42 -8 -34 14 C-28 32 -10 38 0 30 C10 38 28 32 34 14 C42 -8 24 -32 0 -16 Z" {...(p(coral) as object)} />
      <path d="M0 -16 V-30" {...(p() as object)} />
    </g>
  ),
};

/** Draw an icon twice: offset colour pass, then the ink line pass. */
export const Icon: React.FC<{ name: string; size: number; opacity?: number }> = ({ name, size, opacity = 1 }) => {
  const draw = ICONS[name];
  if (!draw) return null;
  const s = size / 100;
  const make =
    (pass: Pass): P =>
    (fill) =>
      pass === 'fill'
        ? { fill: fill ?? 'none', stroke: 'none' }
        : {
            fill: 'none',
            stroke: ink,
            strokeWidth: 4.5,
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
          };
  return (
    <g transform={`scale(${s})`} opacity={opacity}>
      <g transform="translate(3.5 3)">{draw(make('fill'))}</g>
      {draw(make('line'))}
    </g>
  );
};
