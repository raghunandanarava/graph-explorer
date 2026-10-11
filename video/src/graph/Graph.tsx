import React from 'react';
import { EdgeState, LoopState, NODE_R, NodeState } from '../director';
import { colors, fonts, mix, nodeColors } from '../theme';
import { Icon } from './icons';

// Draws the graph in world coordinates from the director's per-frame state.

const tint = (c: string) => mix(c, colors.chalk, 0.62);

/** Grow labels when the camera is far out, so they stay readable on screen. */
const labelScale = (zoom: number) => Math.max(1, Math.min(1.8, 0.8 / zoom));

const Label: React.FC<{ text: string; y: number; size: number; color: string; bg: string; opacity?: number }> = ({ text, y, size, color, bg, opacity = 1 }) => {
  const w = text.length * size * 0.62 + size * 1.1;
  const h = size * 1.55;
  return (
    <g opacity={opacity}>
      <rect x={-w / 2} y={y - h / 2} width={w} height={h} rx={h / 2} fill={bg} />
      <text y={y + size * 0.36} textAnchor="middle" fontFamily={fonts.display} fontWeight={800} fontSize={size} fill={color}>
        {text}
      </text>
    </g>
  );
};

export const NodeView: React.FC<{ s: NodeState; t: number; ls: number }> = ({ s, t, ls }) => {
  if (s.scale <= 0.001) return null;
  const n = s.node;
  const base = nodeColors[n.color] ?? colors.chalk;
  const r = NODE_R;
  const b = s.broken;
  // dim and broken states mix colours instead of using transparency (no muddy blends)
  let disc = tint(base);
  if (s.dim) disc = mix(disc, colors.blueprint, 0.45);
  disc = mix(disc, mix(colors.haze, colors.blueprint, 0.55), b);
  const ink = s.dim ? mix(colors.ink, colors.blueprint, 0.3) : colors.ink;
  const pulse = s.focused ? 1 + 0.035 * Math.sin(t * 5) : 1;
  const wobble = b > 0 ? Math.sin(t * 9 + n.x * 20) * 4 * b : 0;
  const lv = s.level ?? 0;
  const scale = s.scale * pulse * (s.dim ? 0.9 : 1) * (1 + 0.1 * lv);
  const hasIcon = !!n.icon;
  const labelSize = 30 * ls;

  return (
    <g transform={`translate(${s.pos.x} ${s.pos.y}) rotate(${wobble}) scale(${scale})`}>
      {s.focused ? <circle r={r + 20} fill="none" stroke={colors.amber} strokeWidth={5} strokeDasharray="8 12" transform={`rotate(${t * 20})`} /> : null}
      {s.level !== null && !s.held ? <Gauge r={r + 38} level={lv} /> : null}
      <circle cx={7} cy={6} r={r} fill={disc} />
      <circle r={r} fill="none" stroke={b > 0.5 ? colors.coral : ink} strokeWidth={6} strokeDasharray={b > 0.5 ? '14 10' : undefined} />
      {hasIcon ? (
        <g transform="translate(0 -4)">
          <Icon name={n.icon!} size={r * 1.25} opacity={s.dim ? 0.55 : 1 - 0.7 * b} />
        </g>
      ) : (
        <text y={12} textAnchor="middle" fontFamily={fonts.display} fontWeight={800} fontSize={Math.min(40, (r * 1.6) / (n.label.length * 0.6))} fill={ink}>
          {n.label}
        </text>
      )}
      {b > 0.05 ? (
        <g opacity={b}>
          <path d={`M${-r * 0.55} ${-r * 0.7} L${-r * 0.1} ${-r * 0.15} L${-r * 0.3} ${r * 0.1} L${r * 0.2} ${r * 0.75}`} stroke={colors.ink} strokeWidth={5} fill="none" strokeLinejoin="round" />
          <circle cx={r * 0.72} cy={-r * 0.72} r={24} fill={colors.coral} stroke={colors.ink} strokeWidth={4} />
          <text x={r * 0.72} y={-r * 0.72 + 11} textAnchor="middle" fontFamily={fonts.display} fontWeight={800} fontSize={32} fill={colors.ink}>
            ?
          </text>
        </g>
      ) : null}
      {hasIcon && !s.held ? (
        <Label
          text={n.label}
          y={r + 34}
          size={labelSize}
          color={s.dim || b > 0.5 ? colors.haze : colors.chalk}
          bg={s.dim ? mix(colors.ink, colors.blueprint, 0.4) : colors.ink}
        />
      ) : null}
    </g>
  );
};

const UP = colors.amber;
const DOWN = colors.haze;

/** A ring round the node showing its live value: clockwise amber = up, anticlockwise blue = down. */
const Gauge: React.FC<{ r: number; level: number }> = ({ r, level }) => {
  const v = Math.max(-1, Math.min(1, level));
  const sweep = v * 330;
  const a0 = -90;
  const a1 = a0 + sweep;
  const pt = (deg: number) => {
    const rad = (deg * Math.PI) / 180;
    return `${(Math.cos(rad) * r).toFixed(1)} ${(Math.sin(rad) * r).toFixed(1)}`;
  };
  const large = Math.abs(sweep) > 180 ? 1 : 0;
  const dir = sweep >= 0 ? 1 : 0;
  return (
    <g>
      <circle r={r} fill="none" stroke={colors.gridStrong} strokeWidth={10} opacity={0.8} />
      {Math.abs(v) > 0.01 ? (
        <path d={`M${pt(a0)} A${r} ${r} 0 ${large} ${dir} ${pt(a1)}`} fill="none" stroke={v > 0 ? UP : DOWN} strokeWidth={10} strokeLinecap="round" />
      ) : null}
      {Math.abs(v) > 0.12 ? (
        <g transform={`translate(${-r * 0.78} ${-r * 0.78})`}>
          <circle r={22} fill={v > 0 ? UP : DOWN} stroke={colors.ink} strokeWidth={4} />
          <path d={v > 0 ? 'M-10 6 L0 -8 L10 6 Z' : 'M-10 -6 L0 8 L10 -6 Z'} fill={colors.ink} />
        </g>
      ) : null}
    </g>
  );
};

type P = { x: number; y: number };
const bez = (a: P, c: P, b: P, t: number): P => ({
  x: (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * c.x + t * t * b.x,
  y: (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * c.y + t * t * b.y,
});
const unit = (from: P, to: P): P => {
  const d = Math.hypot(to.x - from.x, to.y - from.y) || 1;
  return { x: (to.x - from.x) / d, y: (to.y - from.y) / d };
};

const EdgeView: React.FC<{ s: EdgeState; ls: number; t: number }> = ({ s, ls, t }) => {
  if (s.progress <= 0) return null;
  const { a, b } = s;
  const u = unit(a, b);
  const color = s.broken ? colors.haze : s.dim ? mix(colors.chalk, colors.blueprint, 0.5) : colors.chalk;

  if (s.snapped > 0.02) {
    // torn edge: a stub pulling back from the middle, with a jagged end, on the side still attached
    const start = { x: a.x + u.x * (NODE_R + 14), y: a.y + u.y * (NODE_R + 14) };
    const endFull = { x: b.x - u.x * (NODE_R + 22), y: b.y - u.y * (NODE_R + 22) };
    const span = Math.hypot(endFull.x - start.x, endFull.y - start.y);
    const stub = span * (0.5 - 0.32 * s.snapped);
    const jag = (p: P, dir: number) =>
      `M${p.x} ${p.y} l${(-u.y * 10 + u.x * 8 * dir).toFixed(1)} ${(u.x * 10 + u.y * 8 * dir).toFixed(1)} l${(u.y * 20).toFixed(1)} ${(-u.x * 20).toFixed(1)}`;
    const e1 = { x: start.x + u.x * stub, y: start.y + u.y * stub };
    const e2 = { x: endFull.x - u.x * stub, y: endFull.y - u.y * stub };
    return (
      <g stroke={colors.coral} strokeWidth={6} strokeLinecap="round" fill="none">
        {s.heldEnd !== 'a' ? (
          <>
            <line x1={start.x} y1={start.y} x2={e1.x} y2={e1.y} />
            <path d={jag(e1, 1)} />
          </>
        ) : null}
        {s.heldEnd !== 'b' ? (
          <>
            <line x1={endFull.x} y1={endFull.y} x2={e2.x} y2={e2.y} />
            <path d={jag(e2, -1)} />
          </>
        ) : null}
      </g>
    );
  }

  // a quadratic curve; straight when bend is 0, bowed when a reverse edge exists
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const ctrl = { x: mid.x - u.y * s.bend * 2, y: mid.y + u.x * s.bend * 2 };
  const us = unit(a, ctrl);
  const ue = unit(b, ctrl);
  const start = { x: a.x + us.x * (NODE_R + 14), y: a.y + us.y * (NODE_R + 14) };
  const end = { x: b.x + ue.x * (NODE_R + 22), y: b.y + ue.y * (NODE_R + 22) };
  const d = `M${start.x} ${start.y} Q${ctrl.x} ${ctrl.y} ${end.x} ${end.y}`;
  const tip = unit(ctrl, end);
  const ah = 22;
  const labelOpacity = Math.max(0, (s.progress - 0.6) / 0.4);
  const label = s.edge.label;
  const size = 26 * ls;
  const w = label ? label.length * size * 0.62 + 26 : 0;
  const lp = bez(start, ctrl, end, 0.5);
  let angle = (Math.atan2(end.y - start.y, end.x - start.x) * 180) / Math.PI;
  if (angle > 90) angle -= 180;
  if (angle < -90) angle += 180;
  const sp = bez(start, ctrl, end, 0.8);
  const sign = s.edge.sign;
  const flow = s.flow ?? 0;
  const effect = Math.sign(flow) * (sign === '-' ? -1 : 1);
  const speed = 0.3 + 0.9 * Math.abs(flow);

  return (
    <g>
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={7}
        strokeLinecap="round"
        pathLength={s.progress < 1 ? 1 : undefined}
        strokeDasharray={s.progress < 1 ? `${s.progress} 1` : s.broken ? '4 16' : undefined}
      />
      {s.progress >= 1 ? (
        <polygon
          points={`${end.x + tip.x * 10},${end.y + tip.y * 10} ${end.x - tip.x * ah - tip.y * ah * 0.6},${end.y - tip.y * ah + tip.x * ah * 0.6} ${end.x - tip.x * ah + tip.y * ah * 0.6},${end.y - tip.y * ah - tip.x * ah * 0.6}`}
          fill={color}
        />
      ) : null}
      {s.progress >= 1 && Math.abs(flow) > 0.04 && !s.broken
        ? [0, 1, 2].map((k) => {
            const p = bez(start, ctrl, end, 0.06 + 0.88 * ((t * speed + k / 3) % 1));
            return <circle key={k} cx={p.x} cy={p.y} r={7 + 8 * Math.abs(flow)} fill={effect > 0 ? UP : DOWN} stroke={colors.ink} strokeWidth={3} />;
          })
        : null}
      {label ? (
        <g transform={`translate(${lp.x} ${lp.y}) rotate(${angle})`} opacity={labelOpacity * (s.dim || s.broken ? 0.6 : 1)}>
          <rect x={-w / 2} y={-size * 0.8} width={w} height={size * 1.6} rx={8} fill={colors.blueprint} stroke={s.dim ? colors.gridStrong : colors.amber} strokeWidth={3} />
          <text y={size * 0.36} textAnchor="middle" fontFamily={fonts.mono} fontWeight={600} fontSize={size} fill={s.dim ? colors.haze : colors.amber}>
            {label}
          </text>
        </g>
      ) : null}
      {sign && s.progress > 0.85 ? (
        <g transform={`translate(${sp.x} ${sp.y}) scale(${Math.sqrt(ls)})`} opacity={labelOpacity}>
          <circle r={20} fill={sign === '+' ? UP : DOWN} stroke={colors.ink} strokeWidth={4} />
          <path d={sign === '+' ? 'M-9 0 H9 M0 -9 V9' : 'M-9 0 H9'} stroke={colors.ink} strokeWidth={5} strokeLinecap="round" />
        </g>
      ) : null}
    </g>
  );
};

/** The loop marker: a circling arrow with R (reinforcing) or B (balancing) in the middle. */
export const LoopBadge: React.FC<{ loop: LoopState; t: number; zoom: number }> = ({ loop, t, zoom }) => {
  if (loop.appear <= 0.001) return null;
  const R = loop.radius;
  const reinforcing = loop.kind === 'reinforcing';
  const c = reinforcing ? colors.coral : colors.mint;
  const spin = reinforcing ? t * 50 : Math.sin(t * 2.2) * 25;
  const a0 = 20;
  const a1 = 320;
  const pt = (deg: number, r = R) => {
    const rad = (deg * Math.PI) / 180;
    return { x: Math.cos(rad) * r, y: Math.sin(rad) * r };
  };
  const p0 = pt(a0);
  const p1 = pt(a1);
  const tan = { x: -Math.sin((a1 * Math.PI) / 180), y: Math.cos((a1 * Math.PI) / 180) };
  const ah = R * 0.32;
  const ls = labelScale(zoom);
  const word = reinforcing ? 'reinforcing loop' : 'balancing loop';
  const size = 24 * ls;
  const w = word.length * size * 0.62 + 30;
  return (
    <g transform={`translate(${loop.centre.x} ${loop.centre.y}) scale(${loop.appear})`}>
      <g transform={`rotate(${spin})`}>
        <path d={`M${p0.x} ${p0.y} A${R} ${R} 0 1 1 ${p1.x} ${p1.y}`} fill="none" stroke={c} strokeWidth={9} strokeLinecap="round" />
        <polygon
          points={`${p1.x + tan.x * ah},${p1.y + tan.y * ah} ${p1.x - tan.y * ah * 0.6},${p1.y + tan.x * ah * 0.6} ${p1.x + tan.y * ah * 0.6},${p1.y - tan.x * ah * 0.6}`}
          fill={c}
        />
      </g>
      <circle r={R * 0.62} fill={colors.ink} stroke={c} strokeWidth={4} />
      <text y={R * 0.24} textAnchor="middle" fontFamily={fonts.display} fontWeight={800} fontSize={R * 0.7} fill={c}>
        {reinforcing ? 'R' : 'B'}
      </text>
      <g transform={`translate(0 ${R + 26 * ls})`}>
        <rect x={-w / 2} y={-size * 0.85} width={w} height={size * 1.7} rx={size * 0.85} fill={colors.ink} stroke={c} strokeWidth={3} />
        <text y={size * 0.36} textAnchor="middle" fontFamily={fonts.mono} fontWeight={600} fontSize={size} fill={c}>
          {word}
        </text>
      </g>
    </g>
  );
};

export const Graph: React.FC<{ nodes: NodeState[]; edges: EdgeState[]; t: number; zoom: number }> = ({ nodes, edges, t, zoom }) => {
  const ls = labelScale(zoom);
  const order = [...nodes].sort((x, y) => Number(x.held) - Number(y.held));
  return (
    <g>
      {edges.map((e) => (
        <EdgeView key={`${e.edge.from}-${e.edge.to}`} s={e} ls={ls} t={t} />
      ))}
      {order.filter((n) => !n.held).map((n) => (
        <NodeView key={n.node.id} s={n} t={t} ls={ls} />
      ))}
    </g>
  );
};

/** Held nodes are drawn above Vertie, so they look like they're in its hand. */
export const HeldNodes: React.FC<{ nodes: NodeState[]; t: number; zoom: number }> = ({ nodes, t, zoom }) => (
  <g>
    {nodes.filter((n) => n.held).map((n) => (
      <NodeView key={n.node.id} s={n} t={t} ls={labelScale(zoom)} />
    ))}
  </g>
);
