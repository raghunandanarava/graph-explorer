"""Live feedback-loop simulation for episodes that use "nudge".

Every node carries a value: its *change from normal*, where 0 is normal.
Signed edges pass changes along:

    dx_i/dt = RATE * ( sum over edges j->i of  sign * tanh(x_j)  -  DECAY * x_i )

- tanh keeps every influence between -1 and +1, so a runaway (reinforcing) loop
  saturates instead of exploding, and a balancing loop wobbles and settles.
- DECAY pulls every node back towards normal when nothing pushes it.
- An edge only starts carrying influence once it has been drawn on screen.
- A node Vertie has pulled out of the graph is frozen at 0 and influences nothing.

The output is tanh(x) for every node at every video frame, stored in episode.json
under "sim", so the renderer only has to look values up.
"""
from __future__ import annotations

import math

import numpy as np

from episode_types import Episode, NudgeInfo, SimRun

RATE = 1.3  # how fast changes travel along edges (per second)
DECAY = 0.65  # how strongly things drift back to normal
SUBSTEPS = 4  # integration steps per video frame

# Must mirror director.ts
NUDGE_AT = 1.0
REMOVE_AT = 1.1
RESTORE_AT = 0.95


def _edge_drawn_at(new_nodes: int, order: int) -> float:
    # director.ts: edgeDelay(newNodes, order) + 0.6 s to draw
    return 0.7 + max(0, new_nodes - 1) * 0.8 + 0.6 + order * 0.7 + 0.6


def simulate(episode: Episode) -> list[SimRun]:
    fps = episode["fps"]
    scenes = episode["scenes"]
    nodes = episode["nodes"]
    edges = episode["edges"]
    if not any(s["nudge"] for s in scenes):
        return []

    starts: list[float] = []
    acc = episode["intro"]
    for s in scenes:
        starts.append(acc)
        acc += s["duration"]
    video_end = acc + episode["outro"]

    runs: list[SimRun] = []
    for group in sorted({s["group"] for s in scenes}):
        idx = [i for i, s in enumerate(scenes) if s["group"] == group]
        nudges: list[tuple[float, NudgeInfo]] = []
        for i in idx:
            nd = scenes[i]["nudge"]
            if nd:
                nudges.append((starts[i] + scenes[i].get("animOffset", 0.0) + NUDGE_AT, nd))
        if not nudges:
            continue
        t0 = nudges[0][0]
        last = idx[-1]
        t1 = video_end if last == len(scenes) - 1 else starts[last] + scenes[last]["duration"]

        ids = [n["id"] for n in nodes if n["group"] == group]
        pos = {nid: k for k, nid in enumerate(ids)}

        # when each edge becomes active
        links: list[tuple[int, int, float, float]] = []
        for i in idx:
            new_nodes = sum(1 for n in nodes if n["group"] == group and n["scene"] == i)
            scene_edges = [e for e in edges if e["group"] == group and e["scene"] == i]
            for order, e in enumerate(scene_edges):
                sign = -1.0 if e.get("sign") == "-" else 1.0
                off = scenes[i].get("animOffset", 0.0)
                links.append((pos[e["from"]], pos[e["to"]], sign, starts[i] + off + _edge_drawn_at(new_nodes, order)))

        # when each node is held out of the graph
        held: list[tuple[int, float, float]] = []
        for i in idx:
            s = scenes[i]
            removed = s["remove"]
            if removed:
                end = t1
                for j in idx:
                    if j > i and scenes[j]["restore"]:
                        end = starts[j] + scenes[j].get("animOffset", 0.0) + RESTORE_AT
                        break
                held.append((pos[removed], starts[i] + s.get("animOffset", 0.0) + REMOVE_AT, end))

        n_frames = int(math.ceil((t1 - t0) * fps)) + 1
        x = np.zeros(len(ids))
        out = np.zeros((n_frames, len(ids)))
        dt = 1.0 / (fps * SUBSTEPS)
        pending = sorted(nudges, key=lambda p: p[0])
        for f in range(n_frames):
            t = t0 + f / fps
            while pending and pending[0][0] <= t + 1e-9:
                _, nd = pending.pop(0)
                x[pos[nd["node"]]] += nd["by"]
            frozen = [k for k, a, b in held if a <= t < b]
            for _ in range(SUBSTEPS):
                y = np.tanh(x)
                y[frozen] = 0.0
                dx = -DECAY * x
                for a, b, sign, active_at in links:
                    if t >= active_at:
                        dx[b] += sign * y[a]
                x = x + RATE * dx * dt
                x[frozen] = 0.0
            out[f] = np.tanh(x)

        runs.append(
            {
                "group": group,
                "start": round(t0, 4),
                "fps": fps,
                "values": {nid: [round(float(v), 3) for v in out[:, k]] for nid, k in pos.items()},
            }
        )
    return runs
