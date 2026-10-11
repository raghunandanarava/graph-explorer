import React from 'react';
import { AbsoluteFill } from 'remotion';
import '@fontsource/bricolage-grotesque/800.css';
import '@fontsource/ibm-plex-mono/600.css';
import { HOLD_HAND, Vertie, poseHands } from './character/Vertie';
import { NODE_R, NodeState } from './director';
import { NodeView } from './graph/Graph';
import { colors, fonts } from './theme';
import type { Episode as EpisodeData, GraphNode } from './types';

// Still images for publishing: a 1280 x 720 YouTube thumbnail and a 1080 x 1920 Shorts cover.
// The picture is the episode's big moment: Vertie holding the node it pulled out (or nudged),
// with the things that depend on it cracked and puzzled.

const SERIES = 'VERTIE TAKES IT APART';

const pickMoment = (ep: EpisodeData) => {
  const pulled = ep.scenes.find((s) => s.remove);
  const nudged = ep.scenes.find((s) => s.nudge);
  const heroId = pulled?.remove ?? nudged?.nudge?.node ?? ep.scenes[Math.floor(ep.scenes.length / 2)].focus[0] ?? ep.nodes[0]?.id;
  const hero = ep.nodes.find((n) => n.id === heroId) ?? ep.nodes[0];
  const neighbours = ep.edges
    .filter((e) => e.group === hero.group && (e.from === hero.id || e.to === hero.id))
    .map((e) => (e.from === hero.id ? e.to : e.from));
  const others = [...new Set(neighbours)]
    .map((id) => ep.nodes.find((n) => n.id === id))
    .filter((n): n is GraphNode => !!n)
    .slice(0, 2);
  return { hero, others, broken: !!pulled };
};

const state = (node: GraphNode, x: number, y: number, scale: number, broken: number, held = false): NodeState => ({
  node,
  pos: { x, y },
  scale,
  focused: held,
  dim: false,
  broken,
  held: false,
  isNew: false,
  level: null,
});

const Grid: React.FC<{ w: number; h: number }> = ({ w, h }) => (
  <svg width={w} height={h} style={{ position: 'absolute', inset: 0 }}>
    <defs>
      <pattern id="tg" width={48} height={48} patternUnits="userSpaceOnUse">
        <path d="M48 0 H0 V48" fill="none" stroke={colors.gridStrong} strokeOpacity={0.45} strokeWidth={2} />
      </pattern>
      <radialGradient id="tv" cx="50%" cy="50%" r="75%">
        <stop offset="55%" stopColor={colors.ink} stopOpacity={0} />
        <stop offset="100%" stopColor={colors.ink} stopOpacity={0.6} />
      </radialGradient>
    </defs>
    <rect width={w} height={h} fill="url(#tg)" />
    <rect width={w} height={h} fill="url(#tv)" />
  </svg>
);

const Title: React.FC<{ title: string; size: number; maxChars: number }> = ({ title, size, maxChars }) => {
  // break into lines, highlight the last word
  const words = title.replace(/\?$/, '?').split(' ');
  const lines: string[][] = [[]];
  for (const w of words) {
    const cur = lines[lines.length - 1];
    if (cur.join(' ').length + w.length > maxChars && cur.length) lines.push([w]);
    else cur.push(w);
  }
  return (
    <div style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: size, lineHeight: 0.98, color: colors.chalk, WebkitTextStroke: `${size * 0.1}px ${colors.ink}`, paintOrder: 'stroke fill' }}>
      {lines.map((ln, i) => (
        <div key={i}>
          {ln.map((w, k) => {
            const last = i === lines.length - 1 && k === ln.length - 1;
            return (
              <span key={k} style={{ color: last ? colors.amber : colors.chalk }}>
                {w}
                {k < ln.length - 1 ? ' ' : ''}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
};

const Moment: React.FC<{ ep: EpisodeData; vx: number; vy: number; vs: number; others: { x: number; y: number }[] }> = ({ ep, vx, vy, vs, others }) => {
  const m = pickMoment(ep);
  const hand = { x: vx + HOLD_HAND.x * vs, y: vy + HOLD_HAND.y * vs };
  const heldScale = 0.95 * vs;
  return (
    <g>
      {m.others.map((n, k) => {
        const p = others[k];
        if (!p) return null;
        // torn edge pointing at the missing node
        const dx = hand.x - p.x;
        const dy = hand.y - p.y;
        const d = Math.hypot(dx, dy);
        const ux = dx / d;
        const uy = dy / d;
        const a = { x: p.x + ux * (NODE_R * vs * 0.85 + 12), y: p.y + uy * (NODE_R * vs * 0.85 + 12) };
        const b = { x: a.x + ux * 90 * vs, y: a.y + uy * 90 * vs };
        return (
          <g key={n.id}>
            <g stroke={m.broken ? colors.coral : colors.chalk} strokeWidth={7 * vs} strokeLinecap="round" fill="none">
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
              {m.broken ? <path d={`M${b.x} ${b.y} l${-uy * 12 * vs + ux * 10 * vs} ${ux * 12 * vs + uy * 10 * vs} l${uy * 24 * vs} ${-ux * 24 * vs}`} /> : null}
            </g>
            <NodeView s={state(n, p.x, p.y, 0.85 * vs, m.broken ? 1 : 0)} t={0.6} ls={1} />
          </g>
        );
      })}
      <Vertie
        t={0.4}
        x={vx}
        y={vy}
        scale={vs}
        hands={poseHands('hold')}
        expression={m.broken ? 'puzzled' : 'excited'}
        viseme="D"
        speaking
        lookX={0.6}
        lookY={-0.7}
      />
      <NodeView s={state(m.hero, hand.x, hand.y - NODE_R * heldScale * 0.85, heldScale, 0, true)} t={0.3} ls={1} />
    </g>
  );
};

export const Thumbnail: React.FC<{ episode: EpisodeData }> = ({ episode }) => (
  <AbsoluteFill style={{ backgroundColor: colors.blueprint }}>
    <Grid w={1280} h={720} />
    <svg width={1280} height={720} style={{ position: 'absolute', inset: 0 }}>
      <Moment ep={episode} vx={1000} vy={470} vs={1.05} others={[{ x: 560, y: 520 }, { x: 300, y: 560 }]} />
    </svg>
    <div style={{ position: 'absolute', left: 56, top: 44, width: 720 }}>
      <div style={{ fontFamily: fonts.mono, fontWeight: 600, fontSize: 24, letterSpacing: 4, color: colors.amber, marginBottom: 10 }}>{SERIES}</div>
      <Title title={episode.title} size={92} maxChars={14} />
    </div>
  </AbsoluteFill>
);

export const Cover: React.FC<{ episode: EpisodeData }> = ({ episode }) => (
  <AbsoluteFill style={{ backgroundColor: colors.blueprint }}>
    <Grid w={1080} h={1920} />
    <svg width={1080} height={1920} style={{ position: 'absolute', inset: 0 }}>
      <Moment ep={episode} vx={600} vy={1300} vs={1.55} others={[{ x: 220, y: 1560 }, { x: 200, y: 1150 }]} />
    </svg>
    <div style={{ position: 'absolute', left: 70, right: 70, top: 170, textAlign: 'left' }}>
      <div style={{ fontFamily: fonts.mono, fontWeight: 600, fontSize: 32, letterSpacing: 5, color: colors.amber, marginBottom: 16 }}>{SERIES}</div>
      <Title title={episode.title} size={122} maxChars={11} />
    </div>
  </AbsoluteFill>
);
