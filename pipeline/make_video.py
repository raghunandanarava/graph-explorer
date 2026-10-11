"""Script or topic in, finished video out.

Examples
  # 1. Let the LLM write the episode, stop so you can edit the plan:
  python pipeline/make_video.py --topic "Why does it rain?" --id rain --plan-only
  # 2. Edit episodes/rain/plan.json, then build audio + video from it:
  python pipeline/make_video.py --plan episodes/rain/plan.json --id rain
  # Use your own script instead of a topic:
  python pipeline/make_video.py --script my_script.txt --id my-episode
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from episode_types import Episode, EpisodeEdge, EpisodeScene, LoopInfo, NudgeInfo, ZoomInfo  # noqa: E402
from factcheck import run as factcheck, sources  # noqa: E402
from layout import layout  # noqa: E402
from lipsync import mouth_cues  # noqa: E402
from plan_schema import Plan, boards, clean_plan  # noqa: E402
from publish import short_segments, write_all  # noqa: E402
from simulate import simulate  # noqa: E402
from tts import DEFAULT_VOICE, synthesise  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
VIDEO = ROOT / "video"
FPS = 30
END_PAD = 0.7  # seconds of breathing room after each line


# Must mirror the timing constants in video/src/director.ts.
def animation_time(n_nodes: int, n_edges: int) -> float:
    if n_edges:
        return 0.7 + max(0, n_nodes - 1) * 0.8 + 0.6 + (n_edges - 1) * 0.7 + 0.6
    if n_nodes:
        return 0.7 + (n_nodes - 1) * 0.8 + 0.55
    return 1.1  # camera move


def downstream(start: str, edges: list[EpisodeEdge], group: int, upto_scene: int) -> dict[str, int]:
    """Nodes that depend on `start` (following edge direction), with their distance."""
    out: dict[str, int] = {}
    frontier = [start]
    depth = 0
    seen = {start}
    while frontier:
        depth += 1
        nxt: list[str] = []
        for f in frontier:
            for e in edges:
                if e["group"] == group and e["scene"] <= upto_scene and e["from"] == f and e["to"] not in seen:
                    seen.add(e["to"])
                    out[e["to"]] = depth
                    nxt.append(e["to"])
        frontier = nxt
    return out


INTRO = 3.2
OUTRO = 3.8
ZOOM_LEAD = 1.7  # seconds of dive / surface before a zoom scene's own animation; mirrors director.ts


def build_episode(plan: Plan, ep_id: str, engine: str, voice: str, speed: float) -> Path:
    out_dir = VIDEO / "public" / "episodes" / ep_id
    out_dir.mkdir(parents=True, exist_ok=True)
    nodes, edges = layout(plan)
    scenes: list[EpisodeScene] = []
    held: str | None = None
    labels = {n["id"]: n["label"] for n in nodes}
    for i, (sc, board) in enumerate(zip(plan.scenes, boards(plan))):
        group = board.group
        if board.group != (scenes[-1]["group"] if scenes else 0):
            held = None
        zoom: ZoomInfo | None = {"dir": board.zoom[0], "node": board.zoom[1]} if board.zoom else None
        offset = ZOOM_LEAD if zoom else 0.0  # pops, pulls and nudges wait for the dive
        wav = out_dir / f"scene_{i + 1:02d}.wav"
        print(f"  scene {i + 1}/{len(plan.scenes)}: voice", flush=True)
        length = synthesise(sc.narration, wav, engine=engine, voice=voice, speed=speed)
        print(f"  scene {i + 1}/{len(plan.scenes)}: lip-sync", flush=True)
        cues = mouth_cues(wav, sc.narration)
        held_start = held
        if sc.remove:
            held = sc.remove
        elif sc.restore:
            held = None
        broken_from = sc.remove or held_start
        broken = downstream(broken_from, edges, group, i) if broken_from else {}
        need = animation_time(len(sc.add_nodes), len(sc.add_edges))
        if sc.remove:
            need = max(need, 1.5 + 0.35 * max(broken.values(), default=0) + 1.2)
        if sc.restore:
            need = max(need, 2.2)
        if sc.nudge:
            need = max(need, 7.0)  # let the simulation play out on screen
        need += offset
        loop: LoopInfo | None = None
        if sc.loop:
            signs = {(e["from"], e["to"]): e["sign"] for e in edges}
            pairs = [(sc.loop[k], sc.loop[(k + 1) % len(sc.loop)]) for k in range(len(sc.loop))]
            minus = sum(1 for p in pairs if signs.get(p) == "-")
            loop = {"nodes": sc.loop, "kind": "balancing" if minus % 2 else "reinforcing"}
        nudge: NudgeInfo | None = {"node": sc.nudge.node, "by": sc.nudge.by} if sc.nudge else None
        lead = 0.35  # a breath before Vertie starts talking
        duration = max(lead + length + END_PAD, need + 0.6)
        scenes.append(
            {
                "id": f"s{i + 1}",
                "narration": sc.narration,
                "caption": sc.caption,
                "expression": sc.expression,
                "pose": sc.pose,
                "focus": sc.focus,
                "reach": sc.reach,
                "group": group,
                "audio": wav.name,
                "audioOffset": lead,
                "duration": round(duration, 3),
                "mouthCues": [{**c, "start": c["start"] + lead, "end": c["end"] + lead} for c in cues],
                "remove": sc.remove,
                "restore": sc.restore,
                "heldAtStart": held_start,
                "heldAtEnd": held,
                "broken": broken,
                "loop": loop,
                "nudge": nudge,
                "zoom": zoom,
                "path": [labels[p] for p in board.path],
                "animOffset": offset,
            }
        )
    music: str | None = None
    for name in ("music.mp3", "music.wav", "music.m4a"):
        if (out_dir / name).exists():
            music = name
    episode: Episode = {
        "id": ep_id,
        "title": plan.title,
        "fps": FPS,
        "intro": INTRO,
        "outro": OUTRO,
        "scenes": scenes,
        "nodes": nodes,
        "edges": edges,
        "music": music,
        "sources": sources(ROOT / "episodes" / ep_id / "factcheck.json"),
    }
    episode["sim"] = simulate(episode)
    episode["short"] = short_segments(episode)
    path = out_dir / "episode.json"
    path.write_text(json.dumps(episode, indent=2, ensure_ascii=False), encoding="utf-8")
    for f in write_all(episode, ROOT / "out", ROOT / "episodes" / ep_id):
        print(f"  wrote {f.relative_to(ROOT)}")
    return path


# format name -> (Remotion composition, output file suffix, still image?)
OUTPUTS = {
    "landscape": ("Landscape", "landscape.mp4", False),
    "vertical": ("Vertical", "vertical.mp4", False),
    "short": ("Short", "short.mp4", False),
    "thumbnail": ("Thumbnail", "thumbnail.png", True),
    "cover": ("Cover", "cover.png", True),
}


def render(ep_id: str, formats: list[str]) -> list[Path]:
    outs: list[Path] = []
    for f in formats:
        comp, suffix, still = OUTPUTS[f]
        out = ROOT / "out" / f"{ep_id}-{suffix}"
        cmd = [
            "npx", "remotion", "still" if still else "render", comp, str(out),
            "--props", json.dumps({"episodeId": ep_id, "format": "landscape" if f in ("landscape", "thumbnail") else "vertical"}),
        ]
        if os.environ.get("REMOTION_BROWSER"):
            cmd += ["--browser-executable", os.environ["REMOTION_BROWSER"]]
        print(f"Rendering {f} -> {out}", flush=True)
        subprocess.run(cmd, cwd=VIDEO, check=True)
        outs.append(out)
    return outs


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--topic", help="let the LLM write an episode about this")
    src.add_argument("--script", type=Path, help="a text file with your own script")
    src.add_argument("--plan", type=Path, help="an existing plan.json (skips the LLM)")
    ap.add_argument("--id", required=True, help="episode id, used for folder and file names")
    ap.add_argument("--model", default=os.environ.get("OLLAMA_MODEL", "llama3.1:8b"))
    ap.add_argument("--plan-only", action="store_true", help="stop after writing the plan")
    ap.add_argument("--engine", default="kokoro", choices=["kokoro", "espeak"])
    ap.add_argument("--voice", default=os.environ.get("VERTIE_VOICE", DEFAULT_VOICE))
    ap.add_argument("--speed", type=float, default=1.0)
    ap.add_argument(
        "--formats",
        default="landscape,vertical,short,thumbnail,cover",
        help="any of: " + ", ".join(OUTPUTS),
    )
    ap.add_argument("--no-render", action="store_true", help="prepare audio and data, open Remotion Studio yourself")
    ap.add_argument("--factcheck", action="store_true", help="check the narration against Wikipedia; stop if anything is contradicted")
    args = ap.parse_args()

    plan_path = ROOT / "episodes" / args.id / "plan.json"
    if args.plan:
        plan = clean_plan(Plan.model_validate_json(args.plan.read_text(encoding="utf-8")))
    else:
        from planner import make_plan

        print(f"Planning with {args.model} ...", flush=True)
        script = args.script.read_text(encoding="utf-8") if args.script else None
        plan = make_plan(topic=args.topic, script=script, model=args.model)
        plan_path.parent.mkdir(parents=True, exist_ok=True)
        plan_path.write_text(plan.model_dump_json(by_alias=True, indent=2), encoding="utf-8")
        print(f"Plan written to {plan_path}")

    if args.factcheck:
        fc = factcheck(args.plan or plan_path, args.model, out_dir=plan_path.parent)
        wrong = [c for c in fc["claims"] if c["verdict"] == "contradicted"]
        if wrong and not args.plan_only:
            print(f"Stopping: {len(wrong)} claim(s) contradicted. Fix the plan (see factcheck.md), then run again.")
            return
    if args.plan_only:
        return

    # generates any missing sound effects; existing files are left alone
    subprocess.run([sys.executable, str(Path(__file__).resolve().parent / "sfx.py")], check=True)
    print("Building audio, lip-sync and episode data ...", flush=True)
    path = build_episode(plan, args.id, args.engine, args.voice, args.speed)
    print(f"Episode data: {path}")
    if args.no_render:
        print("Preview with:  cd video && npm run studio")
        return
    outs = render(args.id, [f.strip() for f in args.formats.split(",") if f.strip()])
    print("Done:\n  " + "\n  ".join(str(o) for o in outs))


if __name__ == "__main__":
    main()
