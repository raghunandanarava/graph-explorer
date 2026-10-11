// The director decides, for any moment in an episode, where the camera looks,
// where Vertie stands, what its hands do, and the state of every node and edge.
// Episode.tsx only draws what this returns.

import { Hands, Pt, VertieFx, lerpPt, poseHands, AnyPose } from './character/Vertie';
import type { Episode, GraphEdge, GraphNode, SceneData, SimRun } from './types';

export type Format = 'landscape' | 'vertical';

export const SCREEN: Record<Format, { w: number; h: number }> = {
  landscape: { w: 1920, h: 1080 },
  vertical: { w: 1080, h: 1920 },
};
const WORLD: Record<Format, { w: number; h: number }> = {
  landscape: { w: 2100, h: 1200 },
  vertical: { w: 1200, h: 1800 },
};

export const NODE_R = 92;
export const VERTIE_SCALE = 1;
const CAM_MOVE = 1.1; // seconds for the camera to settle on a new framing
const POSE_MOVE = 0.55;

// ---- timing shared with the pipeline (keep in sync with make_video.py) ----
export const nodeDelay = (order: number) => 0.7 + order * 0.8;
export const edgeDelay = (newNodes: number, order: number) => 0.7 + Math.max(0, newNodes - 1) * 0.8 + 0.6 + order * 0.7;
export const REMOVE_AT = 1.1;
export const BREAK_AT = 1.5;
export const BREAK_STEP = 0.35;
export const RESTORE_FLY = 0.25;
export const RESTORE_AT = 0.95;
export const NUDGE_AT = 1.0; // keep in sync with pipeline/simulate.py
export const EDGE_BEND = 85; // how far two-way edges curve apart
// zooming into a node: dive until its disc fills the screen, then a porthole opens onto the inside
export const ZOOM_LEAD = 1.7; // keep in sync with make_video.py
const DIVE = 1.0;
const IRIS = 0.7;
/** Screen radius (from the camera anchor) that covers the whole frame. */
export const coverRadius = (fmt: Format) => Math.hypot(SCREEN[fmt].w / 2, SCREEN[fmt].h * 0.56);

// ---- easing ----
export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
export const easeInOut = (v: number) => {
  const x = clamp01(v);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};
export const easeOut = (v: number) => 1 - Math.pow(1 - clamp01(v), 3);
export const easeIn = (v: number) => Math.pow(clamp01(v), 3);
/** Overshoots the target a little and settles (used for hand poses). */
export const easeBack = (v: number) => {
  const x = clamp01(v);
  const c1 = 1.0;
  return 1 + (c1 + 1) * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};
const BOB = 5; // px, how far nodes drift up and down when idle
const hashId = (s: string) => {
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 997;
  return h;
};
export const backOut = (v: number) => {
  const x = clamp01(v);
  const c1 = 1.9;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};

type Box = { x0: number; y0: number; x1: number; y1: number };
const boxOf = (pts: Pt[], pad: number): Box => ({
  x0: Math.min(...pts.map((p) => p.x)) - pad,
  y0: Math.min(...pts.map((p) => p.y)) - pad,
  x1: Math.max(...pts.map((p) => p.x)) + pad,
  y1: Math.max(...pts.map((p) => p.y)) + pad,
});
const union = (a: Box, b: Box): Box => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) });

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export interface NodeState {
  node: GraphNode;
  pos: Pt;
  scale: number; // appear pop x held shrink
  focused: boolean;
  dim: boolean;
  broken: number; // 0..1
  held: boolean;
  isNew: boolean;
  level: number | null; // live simulation value, -1..1 (null = no simulation)
  age: number | null; // seconds since it popped in (drives a squash-and-settle), null once settled
  burst: { kind: 'pop' | 'break' | 'heal'; k: number } | null; // expanding ring, k runs 0..1
}

export interface EdgeState {
  edge: GraphEdge;
  a: Pt;
  b: Pt;
  progress: number; // 0..1 drawn
  snapped: number; // 0..1 torn apart
  heldEnd: 'a' | 'b' | null;
  dim: boolean;
  broken: boolean;
  bend: number; // > 0 when a reverse edge exists, so the pair curves apart
  flow: number | null; // simulation value of the source node
  tension: number; // 0..1: the edge is pulled taut just before it snaps
  snapAge: number | null; // seconds since it snapped (drives the spark burst)
  pulse: number; // 0..1 position of the energy pulse travelling along the edge, -1 = none
}

export interface LoopState {
  nodes: string[];
  kind: 'reinforcing' | 'balancing';
  centre: Pt;
  radius: number;
  appear: number; // 0..1
}

export interface SimView {
  run: SimRun;
  ids: string[]; // nodes to plot, at most four
  now: number; // seconds since the run started
}

/** The porthole overlay while diving into or surfacing from a node. */
export interface PortalView {
  color: string; // node colour name
  cover: number; // 0..1 how solidly the node's colour fills the screen
  iris: number | null; // radius of the hole onto the other board, as a fraction of coverRadius
}

export interface Frame {
  sceneIndex: number;
  scene: SceneData;
  t: number; // seconds into the scene
  camera: Camera;
  vertie: { pos: Pt; hands: Hands; walkPhase: number | null; lookX: number; lookY: number; scale: number; fx: VertieFx };
  portal: PortalView | null;
  path: string[]; // breadcrumb: labels of the nodes we're inside
  nodes: NodeState[];
  edges: EdgeState[];
  loop: LoopState | null;
  sim: SimView | null;
}

export class Director {
  readonly ep: Episode;
  readonly fmt: Format;
  readonly fps: number;
  readonly starts: number[]; // scene start in seconds (after the intro)
  readonly total: number; // seconds, intro + scenes + outro
  private stand: Pt[] = [];
  private cams: Camera[] = [];
  private byId: Map<string, GraphNode>;

  constructor(ep: Episode, fmt: Format) {
    this.ep = ep;
    this.fmt = fmt;
    this.fps = ep.fps;
    this.byId = new Map(ep.nodes.map((n) => [n.id, n]));
    let acc = ep.intro;
    this.starts = ep.scenes.map((s) => {
      const st = acc;
      acc += s.duration;
      return st;
    });
    this.total = acc + ep.outro;
    ep.scenes.forEach((_, i) => {
      this.stand.push(this.computeStand(i));
      this.cams.push(this.computeCamera(i));
    });
  }

  world(n: GraphNode): Pt {
    const W = WORLD[this.fmt];
    return { x: n.x * W.w, y: n.y * W.h };
  }

  visible(i: number): GraphNode[] {
    const g = this.ep.scenes[i].group;
    return this.ep.nodes.filter((n) => n.group === g && n.scene <= i);
  }

  /** The simulation run for a scene's graph, if it has started by this time. */
  simRun(i: number, time: number): SimRun | null {
    const g = this.ep.scenes[i].group;
    const run = (this.ep.sim ?? []).find((r) => r.group === g);
    return run && time >= run.start ? run : null;
  }

  /** True once a simulation exists for this scene's graph (used to make room for the panel). */
  private simScene(i: number): boolean {
    const g = this.ep.scenes[i].group;
    const first = this.ep.scenes.findIndex((s) => s.group === g && !!s.nudge);
    return first >= 0 && i >= first;
  }

  simValue(run: SimRun, id: string, time: number): number {
    const vals = run.values[id];
    if (!vals) return 0;
    const k = Math.max(0, Math.min(vals.length - 1, Math.floor((time - run.start) * run.fps)));
    return vals[k];
  }

  private subject(i: number): GraphNode[] {
    const s = this.ep.scenes[i];
    const vis = this.visible(i);
    if (s.remove || s.restore) return vis;
    const ids = new Set<string>([...s.focus, ...(s.reach ? [s.reach] : []), ...(s.loop?.nodes ?? []), ...(s.nudge ? [s.nudge.node] : [])]);
    vis.filter((n) => n.scene === i).forEach((n) => ids.add(n.id));
    const sub = vis.filter((n) => ids.has(n.id));
    return sub.length ? sub : vis;
  }

  private computeStand(i: number): Pt {
    const s = this.ep.scenes[i];
    const W = WORLD[this.fmt];
    const anchorNodes = s.remove ? [this.byId.get(s.remove)!] : this.subject(i);
    const pts = anchorNodes.map((n) => this.world(n));
    if (!pts.length) return { x: W.w / 2, y: W.h / 2 };
    const b = boxOf(pts, NODE_R);
    const cx = (b.x0 + b.x1) / 2;
    const cy = (b.y0 + b.y1) / 2;
    // candidate spots around the cluster; pick one that's clear of every node
    const cands: Pt[] = [];
    for (const dy of [90, -120, 280]) {
      cands.push({ x: b.x0 - 290, y: cy + dy });
      cands.push({ x: b.x1 + 290, y: cy + dy });
    }
    cands.push({ x: cx, y: b.y1 + 320 }, { x: cx - 260, y: b.y1 + 300 }, { x: cx + 260, y: b.y1 + 300 });
    if (this.fmt === 'vertical') cands.push({ x: Math.min(W.w - 220, Math.max(220, cx)), y: b.y1 + 330 });
    // include every node of this group, even ones still to appear, so Vertie never parks where a node will pop up
    const all = this.ep.nodes.filter((n) => n.group === s.group).map((n) => this.world(n));
    const segs = this.ep.edges
      .filter((e) => e.group === s.group)
      .map((e) => [this.world(this.byId.get(e.from)!), this.world(this.byId.get(e.to)!)] as [Pt, Pt]);
    const segDist = (p: Pt, [a, b]: [Pt, Pt]) => {
      const vx = b.x - a.x;
      const vy = b.y - a.y;
      const k = clamp01(((p.x - a.x) * vx + (p.y - a.y) * vy) / (vx * vx + vy * vy || 1));
      return Math.hypot(p.x - (a.x + vx * k), p.y - (a.y + vy * k));
    };
    const prev = i > 0 && !s.zoom ? this.stand[i - 1] : null;
    let best = cands[0];
    let bestScore = Infinity;
    for (const c of cands) {
      // Vertie occupies roughly a 200 x 420 box around its body centre
      const clash = all.reduce((acc, p) => {
        const dx = Math.max(0, Math.abs(p.x - c.x) - 110);
        const dy = Math.max(0, Math.abs(p.y - (c.y + 20)) - 220);
        const d = Math.hypot(dx, dy);
        return acc + (d < NODE_R + 50 ? (NODE_R + 50 - d) * 40 : 0);
      }, 0);
      const out = Math.max(0, -c.x + 150) + Math.max(0, c.x - W.w + 150) + Math.max(0, -c.y + 250) + Math.max(0, c.y - W.h - 150);
      const near = Math.hypot(Math.max(b.x0 - c.x, 0, c.x - b.x1), Math.max(b.y0 - c.y, 0, c.y - b.y1)) * 1.5;
      const walk = prev ? Math.hypot(c.x - prev.x, c.y - prev.y) * 0.25 : 0;
      const edgeClash = segs.reduce((acc, sg) => {
        const d = Math.min(segDist({ x: c.x, y: c.y - 80 }, sg), segDist({ x: c.x, y: c.y + 60 }, sg));
        return acc + (d < 150 ? (150 - d) * 6 : 0);
      }, 0);
      const below = c.y > b.y1 + 100 || c.y < b.y0 - 100;
      const side = c.x < b.x0 || c.x > b.x1;
      const orient = this.fmt === 'landscape' ? (below && !side ? 260 : 0) : side && !below ? 260 : 0;
      // stay within arm's reach of the node Vertie touches
      const touch = s.reach ?? s.remove ?? s.nudge?.node;
      const tn = touch ? this.byId.get(touch) : undefined;
      const reachCost = tn ? Math.max(0, Math.hypot(this.world(tn).x - c.x, this.world(tn).y - c.y) - 330) * 2 : 0;
      const score = clash + edgeClash + out * 0.5 + near + walk + orient + reachCost;
      if (score < bestScore) {
        bestScore = score;
        best = c;
      }
    }
    return best;
  }

  private computeCamera(i: number): Camera {
    const S = SCREEN[this.fmt];
    const pts = this.subject(i).map((n) => this.world(n));
    const v = this.stand[i];
    let box: Box = { x0: v.x - 200, y0: v.y - 240, x1: v.x + 200, y1: v.y + 230 };
    if (this.ep.scenes[i].remove || this.ep.scenes[i].heldAtStart) box = union(box, { x0: v.x - 200, y0: v.y - 360, x1: v.x + 330, y1: v.y + 230 });
    if (pts.length) box = union(box, boxOf(pts, NODE_R + 70));
    const bw = box.x1 - box.x0;
    const bh = box.y1 - box.y0;
    // leave room for the live-simulation panel (top right in landscape, under the caption in vertical)
    const panel = this.simScene(i);
    const fitW = this.fmt === 'landscape' ? (panel ? 0.62 : 0.86) : 0.88;
    const fitH = this.fmt === 'landscape' ? 0.64 : panel ? 0.44 : 0.6;
    const zoom = Math.max(0.32, Math.min(1.25, Math.min((S.w * fitW) / bw, (S.h * fitH) / bh)));
    let cx = (box.x0 + box.x1) / 2;
    let cy = (box.y0 + box.y1) / 2;
    if (panel && this.fmt === 'landscape') cx += (S.w * 0.13) / zoom; // content sits left of centre
    if (panel && this.fmt === 'vertical') cy -= (S.h * 0.11) / zoom; // content sits lower
    return { x: cx, y: cy, zoom };
  }

  /** Scene index and local time for a time in seconds (clamped to the scenes). */
  locate(time: number): { i: number; t: number } {
    let i = 0;
    for (let k = 0; k < this.starts.length; k++) if (time >= this.starts[k]) i = k;
    return { i, t: time - this.starts[i] };
  }

  /** Camera so close to a node that its disc covers the screen. */
  private inside(id: string): Camera {
    const n = this.byId.get(id)!;
    const p = this.world(n);
    return { x: p.x, y: p.y, zoom: (coverRadius(this.fmt) * 1.15) / NODE_R };
  }

  camera(i: number, t: number): Camera {
    const z = this.ep.scenes[i].zoom;
    if (z && i > 0) {
      // zoom changes geometrically; the node's offset from screen centre shrinks (or grows) linearly,
      // so the dive stays locked on the node instead of drifting
      const p = this.world(this.byId.get(z.node)!);
      const geo = (a: Camera, b: Camera, k: number): Camera => {
        const zoom = a.zoom * Math.pow(b.zoom / a.zoom, k);
        const far = z.dir === 'in' ? a : b; // the framing that isn't on the node
        const w = z.dir === 'in' ? 1 - k : k;
        return { x: p.x - ((p.x - far.x) * far.zoom * w) / zoom, y: p.y - ((p.y - far.y) * far.zoom * w) / zoom, zoom };
      };
      const settle = (k: number) => ({ ...this.cams[i], zoom: this.cams[i].zoom * (1 + 0.6 * (1 - k)) });
      if (z.dir === 'in') {
        // outer board: fly into the node; inner board: settle from slightly too close
        if (t < DIVE) return geo(this.cams[i - 1], this.inside(z.node), easeIn((t - 0.35) / (DIVE - 0.35)));
        return settle(easeOut((t - DIVE) / 1.3));
      }
      if (t < IRIS) return { ...this.cams[i - 1], zoom: this.cams[i - 1].zoom * (1 + 0.15 * easeIn(t / IRIS)) };
      return geo(this.inside(z.node), this.cams[i], easeOut((t - IRIS) / 1.2));
    }
    const to = this.cams[i];
    const from = i === 0 ? { ...this.stand[0], y: this.stand[0].y - 40, zoom: Math.min(1.5, to.zoom * 1.6) } : this.cams[i - 1];
    const k = easeInOut(t / (i === 0 ? 1.8 : CAM_MOVE));
    const drift = 1 + 0.012 * Math.sin((this.starts[i] + t) * 0.6);
    return {
      x: from.x + (to.x - from.x) * k,
      y: from.y + (to.y - from.y) * k,
      zoom: (from.zoom + (to.zoom - from.zoom) * k) * drift,
    };
  }

  private walk(i: number, t: number): { pos: Pt; phase: number | null; dist: number; dur: number; dir: number } {
    const to = this.stand[i];
    if (this.ep.scenes[i].zoom) return { pos: to, phase: null, dist: 0, dur: 0, dir: 0 }; // arrives by hopping, see frame()
    const from = i === 0 ? to : this.stand[i - 1];
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    if (dist < 5) return { pos: to, phase: null, dist: 0, dur: 0, dir: 0 };
    const dur = Math.max(0.5, Math.min(1.6, dist / 650));
    const k = clamp01((t - 0.1) / dur);
    const e = easeInOut(k);
    const pos = lerpPt(from, to, e);
    return { pos, phase: k > 0 && k < 1 ? (e * dist) / 34 : null, dist, dur, dir: Math.sign(to.x - from.x) };
  }

  /** Body motion at an instant: anticipation, stretch, landing squash, hops, startle, breathing. */
  private bodyFx(i: number, t: number, time: number): VertieFx {
    const s = this.ep.scenes[i];
    const o = s.animOffset ?? 0;
    const w = this.walk(i, t);
    const before = this.walk(i, Math.max(0, t - 1 / 30)).pos;
    const vx = (w.pos.x - before.x) * 30;
    const speed = clamp01(Math.abs(vx) / 650);
    let squash = 0.012 * Math.sin(time * 2.2); // breathing
    let lean = 0;
    let lift = 0;
    let startle = 0;
    if (w.dist >= 5) {
      if (t < 0.3) {
        // wind-up: crouch and rock back before setting off
        const a = Math.sin((Math.PI * t) / 0.3);
        squash -= 0.13 * a;
        lean -= w.dir * 3 * a;
      }
      lean += clamp01(Math.abs(vx) / 650) * 7 * Math.sign(vx);
      squash += 0.05 * speed;
      const tl = 0.1 + w.dur;
      if (t > tl) squash -= 0.14 * Math.exp(-6 * (t - tl)) * Math.cos(15 * (t - tl)); // landing
    }
    if (s.pose === 'cheer' && !s.remove && !s.restore) {
      const tau = t - 0.3;
      if (tau > 0) {
        const amp = Math.exp(-0.8 * tau);
        lift += 34 * amp * Math.abs(Math.sin(tau * 5.2));
        squash += 0.06 * amp * (lift / 34) - 0.1 * amp * (1 - clamp01(lift / 8));
      }
    } else if (s.expression === 'excited') {
      const tau = t - 0.25;
      if (tau > 0 && tau < 0.7) {
        lift += 20 * Math.sin((Math.PI * tau) / 0.7);
        squash += 0.05 * Math.sin((Math.PI * tau) / 0.7);
      }
    }
    if (s.remove) {
      const tau = t - (o + REMOVE_AT + 0.05);
      const n = this.byId.get(s.remove);
      if (tau > 0 && n) {
        const away = Math.sign(this.stand[i].x - this.world(n).x) || 1;
        startle = Math.exp(-3.2 * tau);
        lean += away * 10 * Math.exp(-3.5 * tau);
        squash += 0.15 * Math.exp(-5 * tau) * Math.cos(16 * tau);
        lift += 18 * Math.exp(-4 * tau) * Math.abs(Math.sin(tau * 9));
      }
    }
    if (s.restore) {
      const tau = t - (o + RESTORE_AT);
      if (tau > 0) {
        lift += 22 * Math.exp(-3 * tau) * Math.abs(Math.sin(tau * 8));
        squash += 0.07 * Math.exp(-3 * tau) * Math.sin(tau * 8);
      }
    }
    if (s.nudge) {
      const tau = t - (o + NUDGE_AT);
      const n = this.byId.get(s.nudge.node);
      if (tau > 0 && n) lean += (Math.sign(this.world(n).x - this.stand[i].x) || 1) * 5 * Math.exp(-4 * tau);
    }
    return { squash, lean, lift, startle, vx };
  }

  vertiePos(i: number, t: number): Pt {
    return this.walk(i, t).pos;
  }

  /** The pose segments Vertie goes through in scene i. */
  private segments(i: number): { start: number; pose: AnyPose; reach?: string | null }[] {
    const s = this.ep.scenes[i];
    const o = s.animOffset ?? 0;
    if (s.remove) return [{ start: 0, pose: 'reach', reach: s.remove }, { start: o + REMOVE_AT, pose: 'hold' }];
    if (s.restore) return [{ start: 0, pose: 'hold' }, { start: o + RESTORE_FLY + 0.1, pose: s.pose === 'reach' ? 'point' : s.pose, reach: null }];
    if (s.heldAtStart) return [{ start: 0, pose: 'hold' }];
    if (s.nudge) return [{ start: 0, pose: 'reach', reach: s.nudge.node }, { start: o + NUDGE_AT + 0.6, pose: 'point' }];
    if (s.pose === 'reach' && s.reach) {
      // a node that hasn't popped in yet can't be touched: point first, reach once it appears
      const n = this.byId.get(s.reach);
      if (n && n.scene === i) {
        const order = this.ep.nodes.filter((m) => m.group === s.group && m.scene === i).indexOf(n);
        return [{ start: 0, pose: 'point' }, { start: o + nodeDelay(order) + 0.15, pose: 'reach', reach: s.reach }];
      }
    }
    return [{ start: 0, pose: s.pose, reach: s.reach }];
  }

  private handsFor(i: number, seg: { pose: AnyPose; reach?: string | null }, t: number): Hands {
    if (seg.pose === 'reach' && seg.reach) {
      const n = this.byId.get(seg.reach);
      if (n) {
        const v = this.vertiePos(i, t);
        const c = this.world(n);
        const dx = v.x - c.x;
        const dy = v.y - c.y;
        const d = Math.hypot(dx, dy) || 1;
        const rim = { x: c.x + (dx / d) * (NODE_R + 6), y: c.y + (dy / d) * (NODE_R + 6) };
        return poseHands('reach', { x: (rim.x - v.x) / VERTIE_SCALE, y: (rim.y - v.y) / VERTIE_SCALE });
      }
    }
    return poseHands(seg.pose === 'reach' ? 'point' : seg.pose);
  }

  hands(i: number, t: number): Hands {
    const segs = this.segments(i);
    let k = 0;
    segs.forEach((sg, idx) => {
      if (t >= sg.start) k = idx;
    });
    const to = this.handsFor(i, segs[k], t);
    let from: Hands;
    if (k > 0) from = this.handsFor(i, segs[k - 1], t);
    else if (i > 0) {
      const prev = this.segments(i - 1);
      from = this.handsFor(i - 1, prev[prev.length - 1], this.ep.scenes[i - 1].duration);
    } else from = poseHands('idle');
    const e = easeBack((t - segs[k].start) / POSE_MOVE);
    return { l: lerpPt(from.l, to.l, e), r: lerpPt(from.r, to.r, e) };
  }

  /** Where a held node floats, in world coordinates. */
  private heldPos(i: number, t: number, scale: number): Pt {
    const v = this.vertiePos(i, t);
    const h = this.hands(i, t).r;
    return { x: v.x + h.x * VERTIE_SCALE, y: v.y + h.y * VERTIE_SCALE - NODE_R * scale * 0.85 };
  }

  frame(time: number): Frame {
    const { i, t } = this.locate(time);
    const s = this.ep.scenes[i];
    const z = s.zoom;
    if (!z || i === 0) return this.build(i, t, time);
    const color = this.byId.get(z.node)?.color ?? 'chalk';
    const p = this.world(this.byId.get(z.node)!);
    const prev = this.ep.scenes[i - 1];
    const hop = (from: Pt, to: Pt, k: number, lift: number): Pt => {
      const q = lerpPt(from, to, easeInOut(k));
      return { x: q.x, y: q.y - lift * Math.sin(Math.PI * clamp01(k)) };
    };
    if (z.dir === 'in') {
      if (t < DIVE) {
        // still on the outer board: Vertie hops into the node, the camera follows it in
        const f = this.build(i - 1, prev.duration - 1e-3, time);
        const k = clamp01(t / 0.55);
        const pos = hop(this.stand[i - 1], p, k, 180);
        const cover = clamp01((easeIn((t - 0.35) / (DIVE - 0.35)) - 0.55) / 0.45);
        return {
          ...f,
          sceneIndex: i,
          scene: s,
          t,
          camera: this.camera(i, t),
          vertie: { ...f.vertie, pos, walkPhase: null, scale: k >= 1 ? 0 : 1 - 0.8 * easeIn(k) },
          portal: { color, cover, iris: null },
          path: prev.path ?? [],
        };
      }
      // inside: the porthole opens and Vertie drops in
      const f = this.build(i, t, time);
      const k = clamp01((t - DIVE - 0.25) / 0.55);
      const iris = easeInOut((t - DIVE) / IRIS);
      return {
        ...f,
        vertie: { ...f.vertie, pos: { x: f.vertie.pos.x, y: f.vertie.pos.y - 260 * (1 - easeOut(k)) }, scale: k <= 0 ? 0 : 0.3 + 0.7 * backOut(k) },
        portal: iris < 1 ? { color, cover: 1, iris } : null,
      };
    }
    if (t < IRIS) {
      // the porthole closes on the inner board
      const f = this.build(i - 1, prev.duration - 1e-3, time);
      return { ...f, sceneIndex: i, scene: s, t, camera: this.camera(i, t), portal: { color, cover: 1, iris: 1 - easeInOut(t / IRIS) }, path: prev.path ?? [] };
    }
    // back outside: pull out of the node, Vertie hops out of it
    const f = this.build(i, t, time);
    const k = clamp01((t - IRIS - 0.3) / 0.6);
    const cover = 1 - clamp01((t - IRIS) / 0.45);
    return {
      ...f,
      vertie: { ...f.vertie, pos: hop(p, this.stand[i], k, 160), scale: k <= 0 ? 0 : 0.3 + 0.7 * easeOut(k) },
      portal: cover > 0 ? { color, cover, iris: null } : null,
    };
  }

  private build(i: number, t: number, time: number): Frame {
    const s = this.ep.scenes[i];
    const cam = this.camera(i, t);
    const w = this.walk(i, t);
    const hands = this.hands(i, t);
    const ta = t - (s.animOffset ?? 0); // the scene's own animation clock (waits for a dive)

    const vis = this.visible(i);
    const newNodes = vis.filter((n) => n.scene === i);
    const focus = new Set(s.focus);
    const hasFocus = focus.size > 0;

    // which node is out of the graph, and how far through being pulled / put back
    const heldId = s.remove ?? s.heldAtStart ?? null;
    let pull = 0; // 0 = in the graph, 1 = in Vertie's hand
    if (s.remove) pull = easeInOut((ta - REMOVE_AT) / 0.5);
    else if (s.restore && s.heldAtStart) pull = 1 - easeInOut((ta - RESTORE_FLY) / 0.7);
    else if (s.heldAtStart) pull = 1;

    const brokenAmt = (id: string): number => {
      const d = s.broken[id];
      if (d === undefined) return 0;
      if (s.remove) return easeOut((ta - (BREAK_AT + d * BREAK_STEP)) / 0.3);
      if (s.restore) return 1 - easeOut((ta - RESTORE_AT) / 0.4);
      return 1;
    };

    const run = this.simRun(i, time);
    const level = (id: string) => (run ? this.simValue(run, id, time) : null);

    // idle drift: every node floats a few pixels, each on its own phase
    const bobOf = (n: GraphNode, damp = 1): Pt => {
      const h = hashId(n.id);
      return { x: Math.cos(time * 0.9 + h) * BOB * 0.4 * damp, y: Math.sin(time * 1.4 + h) * BOB * damp };
    };
    const at = (n: GraphNode): Pt => {
      const w = this.world(n);
      const b = bobOf(n);
      return { x: w.x + b.x, y: w.y + b.y };
    };
    // just before it's pulled out, the node is tugged towards Vertie's hand and its edges go taut
    const tension = s.remove ? easeInOut((ta - (REMOVE_AT - 0.35)) / 0.35) : 0;
    const tugged = (n: GraphNode): Pt => {
      const base = at(n);
      if (!(s.remove && n.id === s.remove) || tension <= 0) return base;
      const shake = ta < REMOVE_AT ? Math.sin(ta * 70) * 3 * tension : 0;
      const q = lerpPt(base, this.heldPos(i, t, 1), 0.08 * tension);
      return { x: q.x + shake, y: q.y };
    };

    const nodes: NodeState[] = vis.map((n) => {
      let scale = 1;
      let age: number | null = null;
      let burst: NodeState['burst'] = null;
      if (n.scene === i) {
        const d = nodeDelay(newNodes.indexOf(n));
        scale = backOut((ta - d) / 0.55);
        if (ta < d) scale = 0;
        else if (ta - d < 1.2) age = ta - d;
        if (ta >= d && ta - d < 0.7) burst = { kind: 'pop', k: (ta - d) / 0.7 };
      }
      let pos = tugged(n);
      const held = n.id === heldId;
      if (held && pull > 0) {
        const hs = 1 - 0.4 * pull;
        pos = lerpPt(pos, this.heldPos(i, t, hs), pull);
        scale *= hs;
      }
      const depth = s.broken[n.id];
      if (!held && depth !== undefined) {
        if (s.remove) {
          const k = (ta - (BREAK_AT + depth * BREAK_STEP)) / 0.55;
          if (k > 0 && k < 1) burst = { kind: 'break', k };
        } else if (s.restore) {
          const k = (ta - RESTORE_AT) / 0.5;
          if (k > 0 && k < 1) burst = { kind: 'heal', k };
        }
      }
      return {
        node: n,
        pos,
        scale,
        focused: focus.has(n.id),
        dim: hasFocus && !focus.has(n.id) && !held,
        broken: held ? 0 : brokenAmt(n.id),
        held: held && pull > 0.5,
        isNew: n.scene === i,
        level: level(n.id),
        age,
        burst,
      };
    });
    const pos = new Map(nodes.map((n) => [n.node.id, n]));

    const visEdges = this.ep.edges.filter((e) => e.group === s.group && e.scene <= i);
    const newEdges = visEdges.filter((e) => e.scene === i);
    const edges: EdgeState[] = [];
    for (const e of visEdges) {
      const a = pos.get(e.from);
      const b = pos.get(e.to);
      if (!a || !b) continue;
      let progress = 1;
      if (e.scene === i) {
        const d = edgeDelay(newNodes.length, newEdges.indexOf(e));
        progress = easeOut((ta - d) / 0.6);
      }
      const touchesHeld = heldId !== null && (e.from === heldId || e.to === heldId);
      let snapped = 0;
      if (touchesHeld) {
        if (s.remove) snapped = easeOut((ta - REMOVE_AT) / 0.25);
        else if (s.restore) snapped = 1 - easeOut((ta - RESTORE_AT) / 0.3);
        else snapped = 1;
      }
      const taut = touchesHeld && s.remove && snapped <= 0.02;
      const endA = taut && e.from === heldId ? tugged(a.node) : at(a.node);
      const endB = taut && e.to === heldId ? tugged(b.node) : at(b.node);
      const ph = (time * 0.4 + hashId(e.from + e.to) / 997) % 1;
      edges.push({
        edge: e,
        a: endA,
        b: endB,
        tension: touchesHeld && s.remove ? tension : 0,
        snapAge: touchesHeld && s.remove && ta >= REMOVE_AT ? ta - REMOVE_AT : null,
        pulse: progress >= 1 && !touchesHeld && ph < 0.45 ? ph / 0.45 : -1,
        progress,
        snapped,
        heldEnd: touchesHeld ? (e.from === heldId ? 'a' : 'b') : null,
        dim: hasFocus && !(focus.has(e.from) && focus.has(e.to)),
        broken: brokenAmt(e.from) > 0.5 || brokenAmt(e.to) > 0.5,
        bend: visEdges.some((o) => o.from === e.to && o.to === e.from) ? EDGE_BEND : 0,
        flow: level(e.from),
      });
    }

    let loop: LoopState | null = null;
    if (s.loop && s.loop.nodes.every((id) => pos.has(id))) {
      const pts = s.loop.nodes.map((id) => pos.get(id)!.pos);
      const centre = { x: pts.reduce((a, p) => a + p.x, 0) / pts.length, y: pts.reduce((a, p) => a + p.y, 0) / pts.length };
      const nearest = Math.min(...pts.map((p) => Math.hypot(p.x - centre.x, p.y - centre.y)));
      loop = {
        nodes: s.loop.nodes,
        kind: s.loop.kind,
        centre,
        radius: Math.max(34, Math.min(80, nearest - NODE_R - 50)),
        appear: backOut((ta - 0.5) / 0.6),
      };
    }

    let sim: SimView | null = null;
    if (run) {
      const want = [...(s.loop?.nodes ?? []), ...s.focus, ...(s.nudge ? [s.nudge.node] : [])];
      const ids = [...new Set(want)].filter((id) => run.values[id] && pos.has(id)).slice(0, 4);
      // nothing in focus: plot the nodes that moved the most
      const busiest = Object.keys(run.values)
        .filter((id) => pos.has(id))
        .sort((p, q) => Math.max(...run.values[q].map(Math.abs)) - Math.max(...run.values[p].map(Math.abs)))
        .slice(0, 4);
      sim = { run, ids: ids.length ? ids : busiest, now: time - run.start };
    }

    // eyes glide to the new target instead of jumping, with a little idle wander
    let look = this.lookAt(i, t, w.pos, cam);
    if (i > 0 && t < 0.4) {
      const was = this.lookAt(i - 1, this.ep.scenes[i - 1].duration, this.stand[i - 1], this.cams[i - 1]);
      const k = easeOut(t / 0.4);
      look = { lookX: was.lookX + (look.lookX - was.lookX) * k, lookY: was.lookY + (look.lookY - was.lookY) * k };
    }
    look = { lookX: look.lookX + 0.07 * Math.sin(time * 1.9), lookY: look.lookY + 0.06 * Math.sin(time * 2.6 + 1) };
    return {
      sceneIndex: i,
      scene: s,
      t,
      camera: cam,
      vertie: { pos: w.pos, hands, walkPhase: w.phase, ...look, scale: 1, fx: this.bodyFx(i, t, time) },
      nodes,
      edges,
      loop,
      sim,
      portal: null,
      path: s.path ?? [],
    };
  }

  private lookAt(i: number, t: number, v: Pt, cam: Camera): { lookX: number; lookY: number } {
    const s = this.ep.scenes[i];
    const target = s.reach ?? s.remove ?? s.nudge?.node ?? s.focus[0];
    const n = target ? this.byId.get(target) : undefined;
    const p = n ? this.world(n) : { x: cam.x, y: v.y + 400 };
    const dx = p.x - v.x;
    const dy = p.y - v.y;
    const d = Math.hypot(dx, dy) || 1;
    return n ? { lookX: dx / d, lookY: dy / d } : { lookX: 0, lookY: 0.4 };
  }

  /** Sound effects as [time in seconds, name, volume]. */
  sfx(): [number, string, number][] {
    const out: [number, string, number][] = [[0.15, 'chime', 0.5]];
    this.ep.scenes.forEach((s, i) => {
      const st0 = this.starts[i];
      const st = st0 + (s.animOffset ?? 0);
      if (s.zoom?.dir === 'in') out.push([st0 + 0.35, 'whoosh', 0.5], [st0 + DIVE, 'pop', 0.5]);
      if (s.zoom?.dir === 'out') out.push([st0 + 0.1, 'whoosh', 0.4], [st0 + IRIS + 0.3, 'pop', 0.5]);
      const vis = this.visible(i);
      const newNodes = vis.filter((n) => n.scene === i);
      newNodes.forEach((_, k) => out.push([st + nodeDelay(k), 'pop', 0.55]));
      const newEdges = this.ep.edges.filter((e) => e.group === s.group && e.scene === i);
      newEdges.forEach((_, k) => out.push([st + edgeDelay(newNodes.length, k), 'whoosh', 0.35]));
      const prev = i > 0 ? this.stand[i - 1] : this.stand[0];
      if (!s.zoom && Math.hypot(this.stand[i].x - prev.x, this.stand[i].y - prev.y) > 60) out.push([st + 0.1, 'steps', 0.3]);
      if (s.remove) {
        out.push([st + REMOVE_AT, 'snap', 0.6]);
        out.push([st + BREAK_AT, 'wobble', 0.45]);
      }
      if (s.nudge) out.push([st + NUDGE_AT, 'dial', 0.6]);
      if (s.loop) out.push([st + 0.5, 'chime', 0.35]);
      if (s.restore) {
        out.push([st + RESTORE_FLY, 'whoosh', 0.4]);
        out.push([st + RESTORE_AT, 'chime', 0.55]);
      }
    });
    return out;
  }

  /** Narration intervals in seconds, for ducking the music under speech. */
  speech(): [number, number][] {
    return this.ep.scenes.map((s, i) => {
      const spoken = s.mouthCues.filter((c) => c.value !== 'X');
      const a = spoken.length ? spoken[0].start : 0;
      const b = spoken.length ? spoken[spoken.length - 1].end : s.duration;
      return [this.starts[i] + a, this.starts[i] + b] as [number, number];
    });
  }
}
