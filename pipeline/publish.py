"""Everything you need to publish an episode, besides the video itself.

- <id>.srt               captions for the full video (both formats share the timing)
- <id>-short.srt         captions for the Shorts cut
- <id>-youtube.txt       title, description, chapters, sources, hashtags
- short segments         which parts of the episode the Shorts cut uses (stored in episode.json)

Subtitle chunking mirrors wordsFor() in video/src/Episode.tsx, so the SRT matches
the burnt-in karaoke subtitles word for word.
"""
from __future__ import annotations

import re
from pathlib import Path

from episode_types import Episode, EpisodeScene, ShortSegment
from factcheck import sources as checked  # sources of supported claims only

SHORT_MAX = 58.0  # seconds; YouTube Shorts must stay under 60
OUTRO_IN_SHORT = 2.4
INTRO_FROM = 1.4  # skip the typing, keep the title pop


def scene_starts(ep: Episode) -> list[float]:
    starts: list[float] = []
    acc = ep["intro"]
    for s in ep["scenes"]:
        starts.append(acc)
        acc += s["duration"]
    return starts


def episode_length(ep: Episode) -> float:
    return ep["intro"] + sum(s["duration"] for s in ep["scenes"]) + ep["outro"]


# --------------------------------------------------------------------------- captions
def _chunks(scene: EpisodeScene) -> list[tuple[str, float, float]]:
    """(text, start, end) in seconds from the scene start, same rules as Episode.tsx."""
    spoken = [c for c in scene["mouthCues"] if c["value"] != "X"]
    a = spoken[0]["start"] if spoken else 0.0
    b = spoken[-1]["end"] if spoken else scene["duration"]
    words = scene["narration"].split()
    weights = [len(w) + 2 + (4 if re.search(r"[.,!?;:]$", w) else 0) for w in words]
    total = sum(weights) or 1
    acc = a
    timed: list[tuple[str, float, float]] = []
    for w, wt in zip(words, weights):
        d = wt / total * (b - a)
        timed.append((w, acc, acc + d))
        acc += d
    out: list[tuple[str, float, float]] = []
    cur: list[tuple[str, float, float]] = []
    for w in timed:
        cur.append(w)
        if len(cur) >= 6 or re.search(r"[.!?;:]$", w[0]):
            out.append((" ".join(x[0] for x in cur), cur[0][1], cur[-1][2]))
            cur = []
    if cur:
        out.append((" ".join(x[0] for x in cur), cur[0][1], cur[-1][2]))
    return out


def _ts(t: float) -> str:
    ms = int(round(t * 1000))
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def _srt(entries: list[tuple[str, float, float]]) -> str:
    lines: list[str] = []
    for k, (text, a, b) in enumerate(entries, 1):
        nxt = entries[k][1] if k < len(entries) else b + 1
        lines += [str(k), f"{_ts(a)} --> {_ts(min(b + 0.35, nxt - 0.02))}", text, ""]
    return "\n".join(lines)


def srt(ep: Episode) -> str:
    entries: list[tuple[str, float, float]] = []
    for s, st in zip(ep["scenes"], scene_starts(ep)):
        entries += [(text, st + a, st + b) for text, a, b in _chunks(s)]
    return _srt(entries)


# --------------------------------------------------------------------------- shorts
def short_segments(ep: Episode) -> list[ShortSegment]:
    """Pick hook + climax + ending (+ a slice of intro and outro) to fit under a minute."""
    scenes = ep["scenes"]
    starts = scene_starts(ep)
    n = len(scenes)
    climax: list[int] = []
    for i, s in enumerate(scenes):
        if s["remove"]:
            climax = [i] + [j for j in range(i + 1, n) if scenes[j]["restore"]][:1]
            break
    if not climax:
        for i, s in enumerate(scenes):
            if s["nudge"]:
                climax = [i]
                break
    if not climax and n > 2:
        climax = [n // 2]
    # a climax inside a zoomed-into node needs the dive, or the Short starts somewhere unexplained
    dive: list[int] = []
    g = -1
    if climax and scenes[climax[0]].get("path"):
        g = scenes[climax[0]]["group"]
        dive = [j for j in range(climax[0], 0, -1) if scenes[j]["group"] == g and (scenes[j].get("zoom") or {}).get("dir") == "in"][:1]
    surface: list[int] = []
    if dive:
        surface = [j for j in range(climax[-1] + 1, n) if scenes[j - 1]["group"] == g and (scenes[j].get("zoom") or {}).get("dir") == "out"][:1]
    picked = sorted({0, *dive, *climax, *surface, n - 1})

    def total(ids: list[int]) -> float:
        return (ep["intro"] - INTRO_FROM) + sum(scenes[i]["duration"] for i in ids) + OUTRO_IN_SHORT

    # drop the least essential scenes until it fits: the restore, the ending, then the zoom scenes
    drop_order = climax[1:] + ([n - 1] if n - 1 not in climax and n - 1 != 0 else []) + surface + dive
    for d in drop_order:
        if total(picked) <= SHORT_MAX:
            break
        picked.remove(d)

    segs: list[ShortSegment] = [{"start": INTRO_FROM, "end": ep["intro"], "scene": None}]
    segs += [ShortSegment(start=starts[i], end=starts[i] + scenes[i]["duration"], scene=i) for i in picked]
    end = episode_length(ep)
    segs.append({"start": end - ep["outro"], "end": end - ep["outro"] + OUTRO_IN_SHORT, "scene": None})
    return segs


def short_srt(ep: Episode, segs: list[ShortSegment]) -> str:
    entries: list[tuple[str, float, float]] = []
    t = 0.0
    for seg in segs:
        i = seg["scene"]
        if i is not None:
            entries += [(text, t + a, t + b) for text, a, b in _chunks(ep["scenes"][i])]
        t += seg["end"] - seg["start"]
    return _srt(entries)


# --------------------------------------------------------------------------- youtube
def _clock(t: float) -> str:
    t = int(t)
    return f"{t // 3600}:{t % 3600 // 60:02d}:{t % 60:02d}" if t >= 3600 else f"{t // 60}:{t % 60:02d}"


def chapters(ep: Episode) -> list[tuple[float, str]]:
    """YouTube needs at least 3 chapters, the first at 0:00, each at least 10 s long."""
    out: list[tuple[float, str]] = [(0.0, "Intro")]
    for s, st in zip(ep["scenes"], scene_starts(ep)):
        cap = s["caption"]
        if cap and st - out[-1][0] >= 10 and st > 0:
            out.append((st, cap.rstrip(".")))
    if episode_length(ep) - out[-1][0] < 10 and len(out) > 1:
        out.pop()
    return out if len(out) >= 3 else []


def description(ep: Episode, sources: list[tuple[str, str]] | None = None, series: str = "Vertie takes it apart") -> str:
    first = re.split(r"(?<=[.!?])\s+", ep["scenes"][0]["narration"])
    hook = " ".join(s for s in first if not s.lower().startswith(("hello", "hi ", "i'm", "i am")))
    labels = list(dict.fromkeys(n["label"] for n in ep["nodes"]))
    lines = [ep["title"], "", hook.strip(), ""]
    lines.append("In this episode: " + ", ".join(labels) + ".")
    ch = chapters(ep)
    if ch:
        lines += ["", "Chapters"] + [f"{_clock(t)} {name}" for t, name in ch]
    if sources:
        lines += ["", "Sources"] + [f"- {title}: {url}" for title, url in sources]
    tags = ["#explainer", "#systemsthinking", "#" + re.sub(r"[^a-z0-9]", "", series.lower())]
    lines += ["", f"{series}: every episode, one thing broken down into the pieces that make it work.", "", " ".join(tags)]
    return "\n".join(lines) + "\n"


def write_all(ep: Episode, out_dir: Path, episode_dir: Path) -> list[Path]:
    """Write SRTs and YouTube text; return the files written."""
    out_dir.mkdir(parents=True, exist_ok=True)
    sources = [(s["title"], s["url"]) for s in checked(episode_dir / "factcheck.json", limit=20)]
    segs = ep.get("short") or short_segments(ep)
    files = {
        out_dir / f"{ep['id']}.srt": srt(ep),
        out_dir / f"{ep['id']}-short.srt": short_srt(ep, segs),
        out_dir / f"{ep['id']}-youtube.txt": description(ep, sources),
    }
    for p, text in files.items():
        p.write_text(text, encoding="utf-8")
    return list(files)
