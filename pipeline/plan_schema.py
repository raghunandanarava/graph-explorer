"""The scene plan: what the LLM writes and what you can edit by hand.

A plan is a list of scenes. Each scene has narration (what Vertie says),
and graph instructions: which nodes (things) and edges (relationships)
appear while Vertie says it.
"""
from __future__ import annotations

import re
from typing import Literal, NamedTuple, Optional, get_args

from pydantic import BaseModel, Field

Expression = Literal["neutral", "curious", "excited", "puzzled"]
Pose = Literal["idle", "wave", "point", "think", "reach", "cheer"]
NodeColor = Literal["amber", "coral", "mint", "chalk", "haze"]
# Must match the icon names in video/src/graph/icons.tsx
Icon = Literal[
    "sun", "moon", "cloud", "raindrop", "snowflake", "lightning", "wave", "vapour",
    "mountain", "tree", "seedling", "flower", "fire", "earth", "fish", "paw",
    "person", "people", "heart", "brain", "cell", "virus", "atom", "gear",
    "bulb", "battery", "factory", "house", "coin", "chart", "clock", "apple",
    "thermometer"
]
ICONS: tuple[str, ...] = get_args(Icon)


class PlanNode(BaseModel):
    id: str = Field(description="short snake_case id, unique in the episode")
    label: str = Field(description="1-2 words shown in the node, max 12 characters")
    color: NodeColor = "chalk"
    icon: Optional[Icon] = Field(default=None, description="a picture drawn inside the node")


class PlanEdge(BaseModel):
    from_: str = Field(alias="from", description="source node id")
    to: str = Field(description="target node id")
    label: Optional[str] = Field(default=None, description="the relationship, 1-2 words, e.g. 'feeds'")
    sign: Optional[Literal["+", "-"]] = Field(
        default=None,
        description="'+' if more of 'from' means more of 'to', '-' if more of 'from' means less of 'to'",
    )

    model_config = {"populate_by_name": True}


class Nudge(BaseModel):
    node: str = Field(description="node id Vertie nudges")
    by: float = Field(default=1.0, description="how hard: positive pushes it up, negative pushes it down (-2..2)")


class PlanScene(BaseModel):
    narration: str = Field(description="what Vertie says, 1-3 sentences, British English")
    caption: Optional[str] = Field(default=None, description="optional short on-screen heading, max 5 words")
    expression: Expression = "neutral"
    pose: Pose = "idle"
    new_graph: bool = Field(default=False, description="true to clear the board and start a new graph")
    add_nodes: list[PlanNode] = Field(default_factory=list)
    add_edges: list[PlanEdge] = Field(default_factory=list)
    focus: list[str] = Field(default_factory=list, description="node ids to highlight")
    reach: Optional[str] = Field(default=None, description="node id Vertie plugs a hand into (use with pose 'reach')")
    remove: Optional[str] = Field(default=None, description="node id Vertie pulls out to see what breaks")
    restore: bool = Field(default=False, description="true to put the removed node back")
    loop: list[str] = Field(
        default_factory=list,
        description="node ids that form a feedback loop, in arrow order, to highlight (edges must exist)",
    )
    nudge: Optional[Nudge] = Field(default=None, description="start the live simulation by nudging a node")
    open: Optional[str] = Field(
        default=None,
        description="node id to zoom into: the camera dives inside it and this scene's add_nodes build what it is made of",
    )
    close: bool = Field(default=False, description="true to zoom back out to the graph you were in before the last 'open'")


class Plan(BaseModel):
    title: str
    scenes: list[PlanScene]


def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", s.lower()).strip("_") or "node"


class _Board:
    """What clean_plan knows about one graph while walking the scenes."""

    def __init__(self) -> None:
        self.known: set[str] = set()
        self.edges: set[tuple[str, str]] = set()
        self.alias: dict[str, str] = {}  # id the plan used -> id actually stored
        self.count = 0
        self.removed: Optional[str] = None


def clean_plan(plan: Plan, max_new_nodes: int = 3, max_nodes_per_graph: int = 9) -> Plan:
    """Fix the usual LLM slips so rendering never breaks.

    - normalises ids, drops duplicate nodes
    - renames a node whose id was already used in another graph (e.g. "water" outside
      and inside a leaf), and follows the rename in that graph's edges and references
    - caps how many nodes appear per scene and per graph
    - drops edges, focus and reach targets that point at missing nodes
    - ignores open/close that can't work (unknown node, nothing to close, node held out)
    """
    used: set[str] = set()  # every node id in the episode
    board = _Board()
    stack: list[_Board] = []  # boards we zoomed in from
    for i, sc in enumerate(plan.scenes):
        if sc.new_graph and i > 0:
            board, stack = _Board(), []
            sc.open, sc.close = None, False
        ref = lambda x: board.alias.get(slug(x), slug(x))  # noqa: E731
        if sc.open:
            target = ref(sc.open)
            if i == 0 or target not in board.known or board.removed:
                sc.open = None
            else:
                sc.open = target
                stack.append(board)
                board = _Board()
                sc.close = False
        elif sc.close:
            if not stack or board.removed:
                sc.close = False
            else:
                board = stack.pop()
        ref = lambda x: board.alias.get(slug(x), slug(x))  # noqa: E731

        kept = []
        for n in sc.add_nodes:
            n.id = slug(n.id)
            n.label = n.label.strip()[:16]
            if n.id in board.known or len(kept) >= max_new_nodes or board.count >= max_nodes_per_graph:
                continue
            if n.id in used:
                k = 2
                while f"{n.id}_{k}" in used:
                    k += 1
                board.alias[n.id] = f"{n.id}_{k}"
                n.id = f"{n.id}_{k}"
            kept.append(n)
            used.add(n.id)
            board.known.add(n.id)
            board.count += 1
        sc.add_nodes = kept
        edges = []
        seen = set()
        for e in sc.add_edges:
            e.from_, e.to = ref(e.from_), ref(e.to)
            key = (e.from_, e.to)
            if e.from_ in board.known and e.to in board.known and e.from_ != e.to and key not in seen:
                if e.label:
                    e.label = e.label.strip()[:18]
                edges.append(e)
                seen.add(key)
        sc.add_edges = edges
        board.edges |= {(e.from_, e.to) for e in edges}
        # a loop must follow existing edges all the way round
        loop = [ref(n) for n in sc.loop]
        if len(loop) >= 2 and all(n in board.known for n in loop) and all(
            (loop[k], loop[(k + 1) % len(loop)]) in board.edges for k in range(len(loop))
        ):
            sc.loop = loop
        else:
            sc.loop = []
        if sc.nudge:
            sc.nudge.node = ref(sc.nudge.node)
            sc.nudge.by = max(-2.0, min(2.0, sc.nudge.by or 1.0))
            if sc.nudge.node not in board.known or sc.remove:
                sc.nudge = None
            elif not sc.restore:
                sc.pose, sc.reach = "reach", sc.nudge.node
        sc.focus = [ref(f) for f in sc.focus if ref(f) in board.known]
        if sc.reach:
            sc.reach = ref(sc.reach)
            if sc.reach not in board.known:
                sc.reach = None
        if sc.remove:
            sc.remove = ref(sc.remove)
            if sc.remove not in board.known or board.removed:
                sc.remove = None
        if sc.remove:
            board.removed = sc.remove
            sc.pose, sc.reach = "reach", sc.remove
            if sc.expression == "neutral":
                sc.expression = "puzzled"
        elif sc.restore:
            if board.removed:
                board.removed = None
            else:
                sc.restore = False
        if sc.pose == "reach" and not sc.reach:
            sc.pose = "point"
    return plan


class Board(NamedTuple):
    group: int  # graph index; nodes, edges and scenes carry it
    zoom: Optional[tuple[Literal["in", "out"], str]]  # this scene dives into / surfaces from that node
    path: list[str]  # node ids we are inside of, outermost first


def boards(plan: Plan) -> list[Board]:
    """Which graph each scene of a cleaned plan is on.

    new_graph starts a fresh group; open pushes a new group for the inside of a node;
    close pops back to the group we came from, so its nodes and layout are reused.
    """
    out: list[Board] = []
    group, next_group = 0, 1
    stack: list[tuple[int, str]] = []  # (outer group, node we went into)
    for i, sc in enumerate(plan.scenes):
        zoom: Optional[tuple[Literal["in", "out"], str]] = None
        if sc.new_graph and i > 0:
            group, next_group, stack = next_group, next_group + 1, []
        elif sc.open:
            stack.append((group, sc.open))
            group, next_group = next_group, next_group + 1
            zoom = ("in", sc.open)
        elif sc.close and stack:
            group, portal = stack.pop()
            zoom = ("out", portal)
        out.append(Board(group, zoom, [p for _, p in stack]))
    return out
