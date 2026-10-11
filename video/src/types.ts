// Shape of public/episodes/<id>/episode.json, written by the Python pipeline.

export type Expression = 'neutral' | 'curious' | 'excited' | 'puzzled';
export type Pose = 'idle' | 'wave' | 'point' | 'think' | 'reach' | 'cheer';
// Rhubarb Lip Sync mouth shapes (Preston Blair set).
export type Viseme = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'X';

export interface MouthCue {
  start: number; // seconds from start of the scene
  end: number;
  value: Viseme;
}

export interface GraphNode {
  id: string;
  label: string;
  color: string; // key of nodeColors
  icon?: string | null; // key of ICONS in graph/icons.tsx
  x: number; // 0..1 inside the world
  y: number;
  scene: number; // index of the scene that introduces it
  group: number; // graphs reset when the group changes
}

export interface GraphEdge {
  from: string;
  to: string;
  label?: string | null;
  sign?: '+' | '-' | null; // feedback-loop polarity
  scene: number;
  group: number;
}

export interface SceneData {
  id: string;
  narration: string;
  caption?: string | null;
  expression: Expression;
  pose: Pose;
  focus: string[];
  reach?: string | null;
  group: number;
  audio: string;
  audioOffset?: number; // seconds of silence before the narration starts
  duration: number; // seconds, including padding
  mouthCues: MouthCue[];
  remove?: string | null; // node pulled out in this scene
  restore?: boolean; // removed node goes back in this scene
  heldAtStart?: string | null; // node held out of the graph when the scene starts
  heldAtEnd?: string | null;
  broken: Record<string, number>; // node id -> depth downstream of the held node (at end of scene)
  loop?: { nodes: string[]; kind: 'reinforcing' | 'balancing' } | null;
  nudge?: { node: string; by: number } | null;
  zoom?: { dir: 'in' | 'out'; node: string } | null; // dive into / surface from a node at the start
  path?: string[]; // labels of the nodes we are inside, outermost first
  animOffset?: number; // seconds the scene's own animation waits (the dive)
}

/** One live-simulation run: node values (change from normal, -1..1) per video frame. */
export interface SimRun {
  group: number;
  start: number; // seconds from the start of the video
  fps: number;
  values: Record<string, number[]>;
}

/** A slice of the full episode used by the Shorts cut. */
export interface ShortSegment {
  start: number; // seconds in the full episode
  end: number;
  scene: number | null;
}

export interface Episode {
  id: string;
  title: string;
  fps: number;
  intro: number; // seconds
  outro: number;
  scenes: SceneData[];
  nodes: GraphNode[];
  edges: GraphEdge[];
  music?: string | null;
  sim?: SimRun[];
  short?: ShortSegment[];
  sources?: { title: string; url: string }[]; // fact-checked sources (Wikipedia articles)
}
