"""Place graph nodes so they stay put while the graph grows scene by scene."""
from __future__ import annotations

import networkx as nx

from episode_types import EpisodeEdge, EpisodeNode
from plan_schema import Plan, boards

MARGIN = 0.1


def layout(plan: Plan) -> tuple[list[EpisodeNode], list[EpisodeEdge]]:
    """Return nodes and edges with group/scene indices and x, y in 0..1."""
    nodes: list[EpisodeNode] = []
    edges: list[EpisodeEdge] = []
    for i, (sc, board) in enumerate(zip(plan.scenes, boards(plan))):
        group = board.group  # a zoomed-into node's inside is its own group
        for n in sc.add_nodes:
            nodes.append({"id": n.id, "label": n.label, "color": n.color, "icon": n.icon, "scene": i, "group": group})
        for e in sc.add_edges:
            edges.append({"from": e.from_, "to": e.to, "label": e.label, "sign": e.sign, "scene": i, "group": group})

    for g in sorted({n["group"] for n in nodes}):
        gn = [n for n in nodes if n["group"] == g]
        G = nx.Graph()
        G.add_nodes_from(n["id"] for n in gn)
        G.add_edges_from((e["from"], e["to"]) for e in edges if e["group"] == g)
        if len(gn) == 1:
            pos = {gn[0]["id"]: (0.0, 0.0)}
        elif nx.is_connected(G) and len(gn) > 2:
            pos = nx.kamada_kawai_layout(G)
        else:
            pos = nx.spring_layout(G, seed=7, k=1.2)
        xs = [p[0] for p in pos.values()]
        ys = [p[1] for p in pos.values()]
        span_x = (max(xs) - min(xs)) or 1.0
        span_y = (max(ys) - min(ys)) or 1.0
        for n in gn:
            x, y = pos[n["id"]]
            # stretch to fill the box so edges are long enough for labels
            n["x"] = 0.5 + (x - (max(xs) + min(xs)) / 2) / span_x * (1 - 2 * MARGIN) if len(gn) > 1 else 0.5
            n["y"] = 0.5 + (y - (max(ys) + min(ys)) / 2) / span_y * (1 - 2 * MARGIN) if len(gn) > 1 else 0.5
    return nodes, edges
