"""Mouth shapes from audio with Rhubarb Lip Sync (https://github.com/DanielSWolf/rhubarb-lip-sync)."""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any

from episode_types import MouthCue

ROOT = Path(__file__).resolve().parent.parent


def rhubarb_path() -> str:
    env = os.environ.get("RHUBARB")
    if env:
        return env
    found = shutil.which("rhubarb")
    if found:
        return found
    for p in sorted((ROOT / "tools").glob("Rhubarb-Lip-Sync-*/rhubarb")):
        return str(p)
    raise FileNotFoundError(
        "Rhubarb not found. Download it from the GitHub releases page into tools/, "
        "or set the RHUBARB environment variable to the binary's path."
    )


def mouth_cues(wav: Path, text: str) -> list[MouthCue]:
    with tempfile.TemporaryDirectory() as td:
        dialog = Path(td) / "dialog.txt"
        dialog.write_text(text, encoding="utf-8")
        out = Path(td) / "cues.json"
        subprocess.run(
            [rhubarb_path(), "-f", "json", "-o", str(out), "--dialogFile", str(dialog), "-q", str(wav)],
            check=True,
        )
        data: dict[str, Any] = json.loads(out.read_text())
    cues: list[dict[str, Any]] = data["mouthCues"]
    return [{"start": float(c["start"]), "end": float(c["end"]), "value": c["value"]} for c in cues]
