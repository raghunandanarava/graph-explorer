"""Narration audio. Default: Kokoro (local, British voices). Fallback: espeak-ng."""
from __future__ import annotations

import subprocess
import wave
from pathlib import Path

SAMPLE_RATE = 24000

# Kokoro British English voices: bf_* are female, bm_* are male.
# Try a few and pick the one that suits Vertie, e.g. bf_emma, bf_isabella,
# bf_alice, bf_lily, bm_george, bm_lewis, bm_daniel, bm_fable.
DEFAULT_VOICE = "bf_emma"

_pipeline = None


def _kokoro(text: str, out: Path, voice: str, speed: float) -> None:
    global _pipeline
    import numpy as np
    import soundfile as sf
    from kokoro import KPipeline

    if _pipeline is None:
        _pipeline = KPipeline(lang_code="b")  # "b" = British English
    chunks = [audio for _, _, audio in _pipeline(text, voice=voice, speed=speed)]
    audio = np.concatenate([np.asarray(c) for c in chunks])
    sf.write(out, audio, SAMPLE_RATE)


def _espeak(text: str, out: Path, speed: float) -> None:
    subprocess.run(
        ["espeak-ng", "-v", "en-gb", "-s", str(int(165 * speed)), "-w", str(out), text],
        check=True,
    )


def synthesise(text: str, out: Path, engine: str = "kokoro", voice: str = DEFAULT_VOICE, speed: float = 1.0) -> float:
    """Write a WAV for `text` and return its length in seconds."""
    out.parent.mkdir(parents=True, exist_ok=True)
    if engine == "kokoro":
        _kokoro(text, out, voice, speed)
    elif engine == "espeak":
        _espeak(text, out, speed)
    else:
        raise ValueError(f"unknown TTS engine {engine!r}")
    with wave.open(str(out)) as w:
        return w.getnframes() / w.getframerate()
