import React from 'react';
import { colors } from '../theme';
import type { Expression, Pose, Viseme } from '../types';

// Vertie is drawn in a local coordinate system: body centre at (0, 0),
// body radius 100. Limbs are straight edges ending in nodes, so a pose is
// just two hand positions. The Episode decides where the hands go and when;
// this component only draws.

export type Pt = { x: number; y: number };
export type Hands = { l: Pt; r: Pt };
export type AnyPose = Pose | 'hold';

const SHOULDER_L: Pt = { x: -70, y: 12 };
const SHOULDER_R: Pt = { x: 70, y: 4 };
const HIP_L: Pt = { x: -30, y: 94 };
const HIP_R: Pt = { x: 30, y: 94 };
const FOOT_L: Pt = { x: -50, y: 190 };
const FOOT_R: Pt = { x: 50, y: 190 };

export const HOLD_HAND: Pt = { x: 150, y: -150 };

const POSES: Record<AnyPose, Hands> = {
  idle: { l: { x: -138, y: 64 }, r: { x: 138, y: 58 } },
  wave: { l: { x: -138, y: 64 }, r: { x: 150, y: -96 } },
  point: { l: { x: -134, y: 72 }, r: { x: 205, y: -24 } },
  think: { l: { x: -134, y: 72 }, r: { x: 96, y: 66 } },
  reach: { l: { x: -134, y: 72 }, r: { x: 220, y: -60 } },
  cheer: { l: { x: -146, y: -116 }, r: { x: 146, y: -116 } },
  hold: { l: { x: -138, y: 40 }, r: HOLD_HAND },
};

/** Hand positions for a pose; `reach` (local coords) overrides the right hand. */
export const poseHands = (pose: AnyPose, reach?: Pt | null): Hands =>
  pose === 'reach' && reach ? { l: POSES.reach.l, r: reach } : POSES[pose];

export const lerpPt = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

// Risograph look: fills printed slightly off the ink outline, with halftone shading.
const OFFSET: Pt = { x: 7, y: 6 };
const HALFTONE: { x: number; y: number; r: number }[] = (() => {
  const dots: { x: number; y: number; r: number }[] = [];
  const step = 9;
  for (let gx = -100; gx <= 100; gx += step) {
    for (let gy = -100; gy <= 100; gy += step) {
      const x = gx + (Math.floor(gy / step) % 2 ? step / 2 : 0);
      const y = gy;
      if (Math.hypot(x - OFFSET.x, y - OFFSET.y) > 92) continue;
      const t = (x * 0.62 + y * 0.78) / 100;
      if (t < 0.25) continue;
      dots.push({ x, y, r: 0.6 + 3.2 * Math.min(1, (t - 0.25) / 0.7) });
    }
  }
  return dots;
})();

export const RisoNode: React.FC<{ cx: number; cy: number; r: number; fill: string; ink?: string }> = ({ cx, cy, r, fill, ink = colors.ink }) => {
  const ox = (OFFSET.x * r) / 100 + 1.5;
  const oy = (OFFSET.y * r) / 100 + 1.5;
  return (
    <g>
      <circle cx={cx + ox} cy={cy + oy} r={r} fill={fill} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={ink} strokeWidth={Math.max(2.5, r * 0.22)} />
    </g>
  );
};

/** Body motion computed by the director for this instant; every field is 0 at rest. */
export interface VertieFx {
  squash: number; // > 0 stretches tall and thin, < 0 squashes short and wide (anchored at the feet)
  lean: number; // degrees, positive leans right, pivoting at the feet
  lift: number; // pixels off the ground (hops); the shadow shrinks as it rises
  startle: number; // 0..1: eyes go wide, mouth makes an O, antennae whip
  vx: number; // horizontal speed in px/s, makes the antennae trail behind
}
export const NO_FX: VertieFx = { squash: 0, lean: 0, lift: 0, startle: 0, vx: 0 };
const GROUND = 200; // local y of the floor; squash, lean and hops pivot here

export interface VertieProps {
  t: number; // seconds, for idle motion
  x: number; // body centre, in the parent's coordinates
  y: number;
  scale: number;
  hands: Hands;
  expression: Expression;
  viseme: Viseme;
  speaking: boolean;
  walkPhase?: number | null; // radians while walking, null when standing
  lookX?: number; // -1 .. 1
  lookY?: number;
  blink?: boolean;
  fx?: VertieFx;
}

export const Vertie: React.FC<VertieProps> = ({
  t,
  x,
  y,
  scale,
  hands,
  expression,
  viseme,
  speaking,
  walkPhase = null,
  lookX = 0.5,
  lookY = 0,
  blink = false,
  fx = NO_FX,
}) => {
  const walking = walkPhase !== null;
  const bob = walking ? -Math.abs(Math.sin(walkPhase)) * 12 : Math.sin(t * 2.2) * 6 + (speaking ? Math.sin(t * 9) * 1.5 : 0);
  const body: Pt = { x: 0, y: bob };

  let footL = FOOT_L;
  let footR = FOOT_R;
  if (walking) {
    const s = Math.sin(walkPhase);
    const c = Math.cos(walkPhase);
    footL = { x: FOOT_L.x + s * 26, y: FOOT_L.y - Math.max(0, c) * 18 };
    footR = { x: FOOT_R.x - s * 26, y: FOOT_R.y - Math.max(0, -c) * 18 };
  }

  const swing = walking ? Math.sin(walkPhase) * 14 : 0;
  const handL = { x: hands.l.x - swing, y: hands.l.y + Math.sin(t * 2.2 + 1) * 4 };
  const handR = { x: hands.r.x, y: hands.r.y };

  // antennae lag behind movement and whip when startled (follow-through)
  const drag = Math.max(-38, Math.min(38, -fx.vx * 0.05));
  const sway = Math.sin(t * 1.7) * 6 + (walking ? Math.sin(walkPhase) * 8 : 0) + drag + fx.startle * 26 * Math.sin(t * 34);
  const sy = 1 + fx.squash;
  const sx = 1 - fx.squash * 0.7; // keeps the volume roughly constant
  const excited = expression === 'excited';
  const glow = excited ? 0.5 + 0.5 * Math.sin(t * 8) : 0;
  const antennae = [
    { base: { x: -34, y: -92 }, tip: { x: -66 + sway, y: -180 }, color: colors.coral, r: excited ? 13 : 11 },
    { base: { x: 34, y: -92 }, tip: { x: 64 + sway, y: -186 }, color: colors.amber, r: excited ? 13 : 11 },
    { base: { x: 0, y: -100 }, tip: { x: sway * 0.5, y: -168 }, color: colors.haze, r: 9 },
  ];

  const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y });
  const edge = (a: Pt, b: Pt, w = 6) => (
    <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={colors.chalk} strokeWidth={w} strokeLinecap="round" />
  );

  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <ellipse
        cx={0}
        cy={GROUND}
        rx={(96 - (walking ? Math.abs(bob) * 2 : 0)) * Math.max(0.5, 1 - fx.lift / 160)}
        ry={11}
        fill={colors.ink}
        opacity={0.45 * Math.max(0.35, 1 - fx.lift / 110)}
      />
      <g transform={`translate(0 ${-fx.lift}) translate(0 ${GROUND}) rotate(${fx.lean}) scale(${sx} ${sy}) translate(0 ${-GROUND})`}>
      {edge(add(HIP_L, body), footL)}
      {edge(add(HIP_R, body), footR)}
      <circle cx={footL.x} cy={footL.y} r={16} fill={colors.ink} stroke={colors.chalk} strokeWidth={4} />
      <circle cx={footR.x} cy={footR.y} r={16} fill={colors.ink} stroke={colors.chalk} strokeWidth={4} />
      {antennae.map((a, i) => (
        <g key={i}>
          {edge(add(a.base, body), add(a.tip, body), 5)}
          {excited && i < 2 ? (
            <circle cx={a.tip.x} cy={a.tip.y + body.y} r={a.r + 10} fill="none" stroke={a.color} strokeWidth={3} opacity={glow * 0.6} />
          ) : null}
          <RisoNode cx={a.tip.x} cy={a.tip.y + body.y} r={a.r} fill={a.color} />
        </g>
      ))}
      {edge(add(SHOULDER_L, body), handL)}
      {edge(add(SHOULDER_R, body), handR)}
      <RisoNode cx={handL.x} cy={handL.y} r={15} fill={colors.coral} />
      <RisoNode cx={handR.x} cy={handR.y} r={15} fill={colors.coral} />
      <g transform={`translate(0 ${body.y})`}>
        <circle cx={OFFSET.x} cy={OFFSET.y} r={100} fill={colors.mint} />
        <g fill={colors.mintDot} opacity={0.55}>
          {HALFTONE.map((d, i) => (
            <circle key={i} cx={d.x} cy={d.y} r={d.r} />
          ))}
        </g>
        <path d="M-72 -38 Q-60 -70 -30 -82" stroke={colors.chalk} strokeOpacity={0.45} strokeWidth={9} strokeLinecap="round" fill="none" />
        <circle r={100} fill="none" stroke={colors.ink} strokeWidth={5} />
        <Eyes expression={expression} blink={blink ? 0.12 : 1} lookX={lookX * 7} lookY={lookY * 5} startle={fx.startle} />
        <Glasses />
        <Mouth viseme={viseme} expression={expression} speaking={speaking} startle={fx.startle} />
      </g>
      </g>
    </g>
  );
};

const Glasses: React.FC = () => (
  <g fill="none" stroke={colors.ink} strokeWidth={4.5} strokeLinecap="round">
    <circle cx={-32} cy={-18} r={29} />
    <circle cx={32} cy={-18} r={29} />
    <path d="M-4 -22 Q0 -28 4 -22" />
    <line x1={-61} y1={-22} x2={-84} y2={-30} />
    <line x1={61} y1={-22} x2={84} y2={-30} />
  </g>
);

const Eyes: React.FC<{ expression: Expression; blink: number; lookX: number; lookY: number; startle: number }> = ({
  expression,
  blink,
  lookX,
  lookY,
  startle,
}) => {
  if (expression === 'excited' && startle < 0.2) {
    return (
      <path d="M-50 -14 Q-32 -36 -14 -14 M14 -14 Q32 -36 50 -14" stroke={colors.ink} strokeWidth={7} strokeLinecap="round" fill="none" />
    );
  }
  const big = expression === 'curious';
  const small = expression === 'puzzled';
  const wide = 1 + 0.28 * startle; // startled eyes widen, pupils shrink
  const rl = (small ? 19 : 21) * wide;
  const rr = (big ? 26 : small ? 19 : 21) * wide;
  return (
    <g>
      {[
        { cx: -32, r: rl },
        { cx: 32, r: rr },
      ].map((e, i) => (
        <g key={i} transform={`translate(${e.cx} -18) scale(1 ${blink})`}>
          <circle r={e.r} fill={colors.chalk} />
          <circle cx={lookX} cy={2 + lookY} r={e.r * (0.45 - 0.17 * startle)} fill={colors.ink} />
          <circle cx={lookX + 3} cy={-2 + lookY} r={e.r * 0.15} fill={colors.chalk} />
        </g>
      ))}
      {small ? <line x1={12} y1={-56} x2={50} y2={-64} stroke={colors.ink} strokeWidth={6} strokeLinecap="round" /> : null}
    </g>
  );
};

const Mouth: React.FC<{ viseme: Viseme; expression: Expression; speaking: boolean; startle: number }> = ({ viseme, expression, speaking, startle }) => {
  const ink = colors.ink;
  const y = 40;
  if (startle > 0.25 && (!speaking || viseme === 'X')) return <ellipse cx={0} cy={y + 4} rx={11 * startle + 4} ry={14 * startle + 4} fill={ink} />;
  if (!speaking || viseme === 'X') {
    if (expression === 'excited') return <path d={`M-20 ${y - 6} Q0 ${y + 24} 20 ${y - 6} Z`} fill={colors.coral} stroke={ink} strokeWidth={4} />;
    if (expression === 'puzzled')
      return <path d={`M-16 ${y} Q-8 ${y - 6} 0 ${y} Q8 ${y + 6} 16 ${y}`} stroke={ink} strokeWidth={5} strokeLinecap="round" fill="none" />;
    if (expression === 'curious') return <circle cx={0} cy={y} r={6} fill={ink} />;
    return <path d={`M-16 ${y - 4} Q0 ${y + 10} 16 ${y - 4}`} stroke={ink} strokeWidth={5} strokeLinecap="round" fill="none" />;
  }
  switch (viseme) {
    case 'A':
      return <line x1={-14} y1={y} x2={14} y2={y} stroke={ink} strokeWidth={5} strokeLinecap="round" />;
    case 'B':
      return <ellipse cx={0} cy={y} rx={14} ry={5} fill={ink} />;
    case 'C':
      return <ellipse cx={0} cy={y} rx={16} ry={9} fill={ink} />;
    case 'D':
      return (
        <g>
          <ellipse cx={0} cy={y + 2} rx={20} ry={15} fill={ink} />
          <ellipse cx={0} cy={y + 11} rx={10} ry={5} fill={colors.coral} />
        </g>
      );
    case 'E':
      return <ellipse cx={0} cy={y} rx={11} ry={11} fill={ink} />;
    case 'F':
      return <ellipse cx={0} cy={y} rx={7} ry={8} fill={ink} />;
    case 'G':
      return (
        <g>
          <ellipse cx={0} cy={y} rx={16} ry={8} fill={ink} />
          <rect x={-12} y={y - 8} width={24} height={5} rx={2} fill={colors.chalk} />
        </g>
      );
    case 'H':
      return (
        <g>
          <ellipse cx={0} cy={y} rx={16} ry={12} fill={ink} />
          <ellipse cx={0} cy={y - 3} rx={8} ry={5} fill={colors.coral} />
        </g>
      );
    default:
      return null;
  }
};
