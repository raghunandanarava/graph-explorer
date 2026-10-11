"""The shape of episode.json: the hand-off between the Python pipeline and the video.

These TypedDicts mirror video/src/types.ts. A TypedDict is still a plain dict at
runtime (json.dumps works unchanged), but your editor now knows every key and its
type, so typos like scene["duraton"] are caught before you run anything.

If you add a field, add it in both places.
"""
from __future__ import annotations

from typing import Literal, NotRequired, Optional, TypedDict

Viseme = Literal["A", "B", "C", "D", "E", "F", "G", "H", "X"]


class MouthCue(TypedDict):
    start: float  # seconds from the start of the scene
    end: float
    value: Viseme


class EpisodeNode(TypedDict):
    id: str
    label: str
    color: str
    icon: Optional[str]
    scene: int  # scene that introduces it
    group: int  # graph board; changes when a scene sets new_graph
    x: NotRequired[float]  # 0..1, filled in by layout()
    y: NotRequired[float]


# "from" is a Python keyword, so this one uses the functional TypedDict syntax.
EpisodeEdge = TypedDict(
    "EpisodeEdge",
    {
        "from": str,
        "to": str,
        "label": Optional[str],
        "sign": Optional[Literal["+", "-"]],
        "scene": int,
        "group": int,
    },
)


class LoopInfo(TypedDict):
    nodes: list[str]
    kind: Literal["reinforcing", "balancing"]


class NudgeInfo(TypedDict):
    node: str
    by: float


class ZoomInfo(TypedDict):
    dir: Literal["in", "out"]  # dive into the node / surface back out of it
    node: str  # the node in the outer graph


class EpisodeScene(TypedDict):
    id: str
    narration: str
    caption: Optional[str]
    expression: str
    pose: str
    focus: list[str]
    reach: Optional[str]
    group: int
    audio: str
    audioOffset: float
    duration: float
    mouthCues: list[MouthCue]
    remove: Optional[str]
    restore: bool
    heldAtStart: Optional[str]
    heldAtEnd: Optional[str]
    broken: dict[str, int]
    loop: Optional[LoopInfo]
    nudge: Optional[NudgeInfo]
    zoom: Optional[ZoomInfo]  # this scene starts by diving into / surfacing from a node
    path: list[str]  # labels of the nodes we are inside, outermost first (breadcrumb)
    animOffset: float  # seconds the scene's own animation waits (the dive), 0 normally


class SimRun(TypedDict):
    group: int
    start: float  # seconds from the start of the video
    fps: int
    values: dict[str, list[float]]  # node id -> value per frame, -1..1


class ShortSegment(TypedDict):
    start: float  # seconds in the full episode
    end: float
    scene: Optional[int]  # scene index, or None for intro/outro slices


class Source(TypedDict):
    title: str
    url: str


class Episode(TypedDict):
    id: str
    title: str
    fps: int
    intro: float
    outro: float
    scenes: list[EpisodeScene]
    nodes: list[EpisodeNode]
    edges: list[EpisodeEdge]
    music: Optional[str]
    sim: NotRequired[list[SimRun]]
    short: NotRequired[list[ShortSegment]]  # the Shorts cut, picked by publish.py
    sources: NotRequired[list[Source]]  # from factcheck.json (supported claims), shown in the outro
