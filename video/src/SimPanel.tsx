import React from 'react';
import type { Format, SimView } from './director';
import { clamp01 } from './director';
import { colors, fonts, nodeColors } from './theme';
import type { GraphNode } from './types';

// The "oscilloscope": a live plot of the simulation, drawn in screen space.

const WINDOW = 8; // seconds of history shown

export const SimPanel: React.FC<{ sim: SimView; nodes: Map<string, GraphNode>; fmt: Format }> = ({ sim, nodes, fmt }) => {
  const land = fmt === 'landscape';
  const W = land ? 560 : 940;
  const H = land ? 260 : 270;
  const pad = { l: 24, r: 24, t: 54, b: 70 };
  const pw = W - pad.l - pad.r;
  const ph = H - pad.t - pad.b;
  const { run, ids, now } = sim;
  const idx = Math.floor(now * run.fps);
  const k0 = Math.max(0, idx - WINDOW * run.fps);
  const X = (k: number) => pad.l + ((k - (idx - WINDOW * run.fps)) / (WINDOW * run.fps)) * pw;
  const Y = (v: number) => pad.t + ph / 2 - v * (ph / 2 - 6);
  const fade = clamp01(now / 0.5);

  return (
    <div
      style={{
        position: 'absolute',
        top: land ? 56 : 360,
        right: land ? 56 : undefined,
        left: land ? undefined : (1080 - W) / 2,
        width: W,
        height: H,
        opacity: fade,
      }}
    >
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <rect x={2} y={2} width={W - 4} height={H - 4} rx={18} fill={colors.ink} fillOpacity={0.88} stroke={colors.gridStrong} strokeWidth={3} />
        <circle cx={pad.l + 8} cy={30} r={7} fill={colors.coral} opacity={0.5 + 0.5 * Math.sin(now * 6)} />
        <text x={pad.l + 24} y={37} fontFamily={fonts.mono} fontWeight={600} fontSize={20} fill={colors.amber} letterSpacing={2}>
          LIVE · CHANGE FROM NORMAL
        </text>
        <line x1={pad.l} x2={W - pad.r} y1={Y(0)} y2={Y(0)} stroke={colors.haze} strokeOpacity={0.5} strokeWidth={2} strokeDasharray="6 8" />
        <text x={W - pad.r} y={Y(1) + 14} textAnchor="end" fontFamily={fonts.mono} fontSize={15} fill={colors.haze}>
          more
        </text>
        <text x={W - pad.r} y={Y(-1) - 4} textAnchor="end" fontFamily={fonts.mono} fontSize={15} fill={colors.haze}>
          less
        </text>
        {ids.map((id) => {
          const vals = run.values[id];
          const pts: string[] = [];
          for (let k = k0; k <= Math.min(idx, vals.length - 1); k += 2) pts.push(`${X(k).toFixed(1)},${Y(vals[k]).toFixed(1)}`);
          const c = nodeColors[nodes.get(id)?.color ?? 'chalk'] ?? colors.chalk;
          const last = vals[Math.min(idx, vals.length - 1)];
          return (
            <g key={id}>
              {pts.length > 1 ? <polyline points={pts.join(' ')} fill="none" stroke={c} strokeWidth={5} strokeLinejoin="round" strokeLinecap="round" /> : null}
              <circle cx={X(Math.min(idx, vals.length - 1))} cy={Y(last)} r={7} fill={c} stroke={colors.ink} strokeWidth={2} />
            </g>
          );
        })}
        {ids.map((id, k) => {
          const n = nodes.get(id);
          const c = nodeColors[n?.color ?? 'chalk'] ?? colors.chalk;
          const v = run.values[id][Math.min(idx, run.values[id].length - 1)];
          const colW = pw / ids.length;
          const x = pad.l + k * colW;
          return (
            <g key={`l${id}`} transform={`translate(${x} ${H - 30})`}>
              <rect x={0} y={-10} width={22} height={8} rx={4} fill={c} />
              <text x={30} y={-2} fontFamily={fonts.display} fontWeight={800} fontSize={20} fill={colors.chalk}>
                {n?.label ?? id}
              </text>
              <text x={30} y={20} fontFamily={fonts.mono} fontWeight={600} fontSize={17} fill={v >= 0 ? colors.amber : colors.haze}>
                {v >= 0 ? '▲' : '▼'} {Math.abs(v * 100).toFixed(0)}%
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};
