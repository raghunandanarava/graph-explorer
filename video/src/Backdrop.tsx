import React from 'react';
import { Format, SCREEN } from './director';
import { colors, mix } from './theme';

// Depth: the world is drawn in layers that follow the camera at different speeds.
//
//   far   (k 0.2)  soft colour glows and a faint "ghost graph" of drifting nodes
//   mid   (k 0.55) bokeh dots drifting upwards
//   world (k 1)    the grid, the graph and Vertie (drawn in Episode.tsx)
//   near  (k 1.5)  a few big out-of-focus dots that slide past quickly
//
// A layer with factor k is placed with  translate(centre) scale(zoom^k) translate(-camera * k),
// so k = 1 is the normal camera, k < 1 moves slower and looks further away, k > 1 looks closer.
// Everything is a pure function of the camera and the time, like the rest of the video.

type Cam = { x: number; y: number; zoom: number };

const rand = (seed: number) => {
  let s = seed * 9301 + 49297;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
};

/** Layer area: wide enough that the camera never runs off the edge of it, at any zoom. */
const region = (k: number) => ({ x0: -2400, x1: 2400 + 2100 * k, y0: -2000, y1: 2000 + 1800 * k });
const count = (k: number, perPx: number) => {
  const r = region(k);
  return Math.round(((r.x1 - r.x0) * (r.y1 - r.y0)) / perPx);
};

const layerTransform = (cam: Cam, k: number, S: { w: number; h: number }, anchorY: number) =>
  `translate(${S.w / 2} ${S.h * anchorY}) scale(${Math.pow(cam.zoom, k)}) translate(${-cam.x * k} ${-cam.y * k})`;

// ---- far layer: glows + ghost graph
const FAR_K = 0.2;
const GLOWS = (() => {
  const r = rand(11);
  const reg = region(FAR_K);
  const tints = [colors.amber, colors.mint, colors.coral, colors.haze];
  return Array.from({ length: 9 }, (_, i) => ({
    x: reg.x0 + r() * (reg.x1 - reg.x0),
    y: reg.y0 + r() * (reg.y1 - reg.y0),
    r: 380 + r() * 520,
    c: tints[i % tints.length],
    o: 0.1 + r() * 0.08,
    sp: 0.1 + r() * 0.2,
  }));
})();

const GHOST = (() => {
  const r = rand(23);
  const reg = region(FAR_K);
  const nodes = Array.from({ length: count(FAR_K, 650_000) }, () => ({
    x: reg.x0 + r() * (reg.x1 - reg.x0),
    y: reg.y0 + r() * (reg.y1 - reg.y0),
    r: 14 + r() * 30,
    ph: r() * 6.28,
    sp: 0.15 + r() * 0.3,
  }));
  const edges: [number, number][] = [];
  nodes.forEach((a, i) =>
    nodes.forEach((b, j) => {
      if (j > i && Math.hypot(a.x - b.x, a.y - b.y) < 620) edges.push([i, j]);
    }),
  );
  return { nodes, edges };
})();

// ---- mid layer: bokeh
const MID_K = 0.55;
const BOKEH = (() => {
  const r = rand(37);
  const reg = region(MID_K);
  const tints = [colors.amber, colors.haze, colors.mint, colors.chalk];
  return Array.from({ length: count(MID_K, 420_000) }, (_, i) => ({
    x: reg.x0 + r() * (reg.x1 - reg.x0),
    y: reg.y0 + r() * (reg.y1 - reg.y0),
    r: 8 + r() * 26,
    c: tints[i % tints.length],
    o: 0.1 + r() * 0.16,
    sp: 6 + r() * 14, // px/s upwards
    ring: r() > 0.6,
  }));
})();

// ---- near layer
const NEAR_K = 1.5;
const NEAR = (() => {
  const r = rand(51);
  const reg = region(NEAR_K);
  return Array.from({ length: count(NEAR_K, 2_600_000) }, (_, i) => ({
    x: reg.x0 + r() * (reg.x1 - reg.x0),
    y: reg.y0 + r() * (reg.y1 - reg.y0),
    r: 34 + r() * 70,
    c: i % 2 ? colors.haze : colors.amber,
    o: 0.05 + r() * 0.05,
    sp: 14 + r() * 24,
  }));
})();

const wrapY = (y: number, drift: number, k: number) => {
  const r = region(k);
  const h = r.y1 - r.y0;
  return r.y0 + ((((y - r.y0 - drift) % h) + h) % h);
};

export const FarLayers: React.FC<{ cam: Cam; time: number; fmt: Format; anchorY: number }> = ({ cam, time, fmt, anchorY }) => {
  const S = SCREEN[fmt];
  return (
    <g>
      <defs>
        {[colors.amber, colors.mint, colors.coral, colors.haze].map((c) => (
          <radialGradient key={c} id={`glow-${c.slice(1)}`}>
            <stop offset="0%" stopColor={c} stopOpacity={1} />
            <stop offset="100%" stopColor={c} stopOpacity={0} />
          </radialGradient>
        ))}
      </defs>
      <g transform={layerTransform(cam, FAR_K, S, anchorY)}>
        {GLOWS.map((g, i) => (
          <circle key={i} cx={g.x + Math.sin(time * g.sp + i) * 60} cy={g.y + Math.cos(time * g.sp * 0.8 + i) * 40} r={g.r} fill={`url(#glow-${g.c.slice(1)})`} opacity={g.o} />
        ))}
        <g stroke={colors.gridStrong} strokeOpacity={0.5} strokeWidth={4}>
          {GHOST.edges.map(([a, b], i) => {
            const p = GHOST.nodes[a];
            const q = GHOST.nodes[b];
            return (
              <line
                key={i}
                x1={p.x + Math.sin(time * p.sp + p.ph) * 18}
                y1={p.y + Math.cos(time * p.sp + p.ph) * 14}
                x2={q.x + Math.sin(time * q.sp + q.ph) * 18}
                y2={q.y + Math.cos(time * q.sp + q.ph) * 14}
              />
            );
          })}
        </g>
        {GHOST.nodes.map((n, i) => (
          <circle
            key={i}
            cx={n.x + Math.sin(time * n.sp + n.ph) * 18}
            cy={n.y + Math.cos(time * n.sp + n.ph) * 14}
            r={n.r}
            fill={mix(colors.blueprint, colors.gridStrong, 0.35)}
            stroke={colors.gridStrong}
            strokeOpacity={0.7}
            strokeWidth={4}
          />
        ))}
      </g>
      <g transform={layerTransform(cam, MID_K, S, anchorY)}>
        {BOKEH.map((b, i) => {
          const y = wrapY(b.y, time * b.sp, MID_K);
          return b.ring ? (
            <circle key={i} cx={b.x + Math.sin(time * 0.4 + i) * 14} cy={y} r={b.r} fill="none" stroke={b.c} strokeWidth={3} opacity={b.o * 1.4} />
          ) : (
            <circle key={i} cx={b.x + Math.sin(time * 0.4 + i) * 14} cy={y} r={b.r} fill={b.c} opacity={b.o} />
          );
        })}
      </g>
    </g>
  );
};

/** Slow diagonal beams of light from the top left, in screen space. */
export const Shafts: React.FC<{ time: number; fmt: Format }> = ({ time, fmt }) => {
  const S = SCREEN[fmt];
  const beams = [
    { x: 0.1, w: 0.1, o: 0.07, sp: 0.23, ph: 0 },
    { x: 0.32, w: 0.06, o: 0.05, sp: 0.31, ph: 2 },
    { x: 0.55, w: 0.12, o: 0.05, sp: 0.19, ph: 4 },
  ];
  return (
    <g style={{ mixBlendMode: 'screen' }}>
      <defs>
        <linearGradient id="beam" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={colors.chalk} stopOpacity={1} />
          <stop offset="85%" stopColor={colors.chalk} stopOpacity={0} />
        </linearGradient>
      </defs>
      {beams.map((b, i) => {
        const sway = Math.sin(time * b.sp + b.ph);
        const x = (b.x + sway * 0.03) * S.w;
        const w = b.w * S.w * (1 + 0.15 * Math.sin(time * b.sp * 1.7 + b.ph));
        const skew = S.h * 0.55;
        return <polygon key={i} points={`${x},0 ${x + w},0 ${x + w + skew},${S.h} ${x + skew},${S.h}`} fill="url(#beam)" opacity={b.o * (0.8 + 0.2 * Math.sin(time * 0.7 + b.ph))} />;
      })}
    </g>
  );
};

export const NearLayer: React.FC<{ cam: Cam; time: number; fmt: Format; anchorY: number }> = ({ cam, time, fmt, anchorY }) => {
  const S = SCREEN[fmt];
  return (
    <g transform={layerTransform(cam, NEAR_K, S, anchorY)}>
      {NEAR.map((n, i) => (
        <circle key={i} cx={n.x + Math.sin(time * 0.3 + i) * 40} cy={wrapY(n.y, time * n.sp, NEAR_K)} r={n.r} fill={n.c} opacity={n.o} />
      ))}
    </g>
  );
};
