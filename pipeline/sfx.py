"""Synthesise the sound effects and a gentle music bed, so there is nothing to license.

python pipeline/sfx.py   ->  video/public/sfx/*.wav

Replace any of these files with your own sounds (same names) whenever you like.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import soundfile as sf

SR = 44100
OUT = Path(__file__).resolve().parent.parent / "video" / "public" / "sfx"
rng = np.random.default_rng(7)


def t(d):
    return np.arange(int(SR * d)) / SR


def env(n, a=0.005, r=None):
    """Attack then exponential release."""
    e = np.ones(n)
    na = max(1, int(SR * a))
    e[:na] = np.linspace(0, 1, na)
    if r:
        e[na:] = np.exp(-np.arange(n - na) / (SR * r))
    return e


def lowpass(x, cutoff):
    """One-pole low-pass; cutoff can be a number or an array."""
    y = np.zeros_like(x)
    c = np.broadcast_to(np.asarray(cutoff, dtype=float), x.shape)
    acc = 0.0
    for i in range(len(x)):
        k = 1 - np.exp(-2 * np.pi * c[i] / SR)
        acc += k * (x[i] - acc)
        y[i] = acc
    return y


def norm(x, peak=0.9):
    return x / (np.max(np.abs(x)) + 1e-9) * peak


def save(name, x):
    OUT.mkdir(parents=True, exist_ok=True)
    sf.write(OUT / f"{name}.wav", x.astype(np.float32), SR)


def pop():
    d = t(0.18)
    f = 900 * np.exp(-d * 30) + 420
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(len(d), 0.002, 0.04)
    return norm(x, 0.8)


def whoosh():
    d = t(0.55)
    n = rng.standard_normal(len(d))
    cut = 300 + 3500 * np.sin(np.pi * d / d[-1]) ** 2
    x = lowpass(n, cut) * np.sin(np.pi * d / d[-1]) ** 1.5
    return norm(x, 0.6)


def snap():
    d = t(0.35)
    click = rng.standard_normal(len(d)) * env(len(d), 0.0005, 0.012)
    body = np.sin(2 * np.pi * 180 * d) * env(len(d), 0.001, 0.06)
    return norm(lowpass(click, 6000) + 0.6 * body, 0.85)


def wobble():
    d = t(0.9)
    f = 330 * (1 - 0.35 * d / d[-1]) * (1 + 0.04 * np.sin(2 * np.pi * 9 * d))
    x = np.sin(2 * np.pi * np.cumsum(f) / SR)
    x += 0.3 * np.sin(2 * np.pi * 2 * np.cumsum(f) / SR)
    return norm(x * env(len(d), 0.01, 0.35), 0.6)


def chime():
    d = t(1.6)
    x = np.zeros(len(d))
    for k, f in enumerate([659.25, 987.77, 1318.5]):  # E5 B5 E6
        start = int(SR * 0.07 * k)
        seg = d[: len(d) - start]
        tone = np.sin(2 * np.pi * f * seg) + 0.25 * np.sin(2 * np.pi * f * 2.76 * seg)
        x[start:] += tone * env(len(seg), 0.002, 0.45)
    return norm(x, 0.6)


def steps():
    out = np.zeros(int(SR * 1.2))
    for k in range(4):
        s = int(SR * (0.08 + k * 0.28))
        d = t(0.08)
        tap = np.sin(2 * np.pi * (140 + 20 * (k % 2)) * d) * env(len(d), 0.001, 0.015)
        out[s : s + len(d)] += tap
    return norm(out, 0.5)


def stamp():
    d = t(0.5)
    thud = np.sin(2 * np.pi * 70 * d) * env(len(d), 0.001, 0.08)
    slap = lowpass(rng.standard_normal(len(d)), 2500) * env(len(d), 0.0005, 0.02)
    return norm(thud + 0.8 * slap, 0.85)


def dial():
    """A ratchet: quick clicks rising in pitch, for nudging a node."""
    out = np.zeros(int(SR * 0.6))
    for k in range(6):
        s = int(SR * k * 0.07)
        d = t(0.03)
        click = np.sin(2 * np.pi * (900 + 120 * k) * d) * env(len(d), 0.0005, 0.006)
        out[s : s + len(d)] += click
    return norm(out, 0.6)


def music(seconds=48.0, bpm=84):
    """A soft, slightly nerdy lo-fi bed: pad chords, plucked arpeggio, light tick."""
    beat = 60 / bpm
    n = int(SR * seconds)
    out = np.zeros(n)
    chords = [  # Cmaj7, Am7, Fmaj7, G6 (Hz)
        [130.81, 164.81, 196.00, 246.94],
        [110.00, 130.81, 164.81, 196.00],
        [87.31, 130.81, 164.81, 220.00],
        [98.00, 123.47, 146.83, 164.81],
    ]
    bar = 4 * beat
    tt = np.arange(n) / SR
    for b in range(int(seconds / bar) + 1):
        ch = chords[b % 4]
        s0 = int(b * bar * SR)
        seg_len = min(int(bar * SR * 1.15), n - s0)
        if seg_len <= 0:
            break
        seg = np.arange(seg_len) / SR
        pad = sum(np.sin(2 * np.pi * f * seg * (1 + det)) for f in ch for det in (-0.002, 0.002))
        shape = np.minimum(1, seg / 0.6) * np.minimum(1, (seg_len / SR - seg) / 0.5)
        out[s0 : s0 + seg_len] += 0.08 * pad * shape
        # arpeggio, eighth notes, up the chord an octave higher
        for k in range(8):
            f = ch[[0, 1, 2, 3, 2, 1, 2, 3][k]] * 2
            s = s0 + int(k * beat / 2 * SR)
            ln = min(int(SR * 0.6), n - s)
            if ln <= 0:
                continue
            p = np.arange(ln) / SR
            pl = (np.sin(2 * np.pi * f * p) + 0.3 * np.sin(2 * np.pi * 2 * f * p)) * np.exp(-p / 0.18)
            out[s : s + ln] += 0.12 * pl * (0.8 if k % 2 else 1.0)
    # soft hi-hat tick on the off-beats
    for k in range(int(seconds / (beat / 2))):
        if k % 2 == 1:
            s = int(k * beat / 2 * SR)
            ln = min(int(SR * 0.04), n - s)
            if ln > 0:
                out[s : s + ln] += 0.025 * rng.standard_normal(ln) * np.exp(-np.arange(ln) / (SR * 0.01))
    out = lowpass(out, 5000)
    # loop-friendly fade at the edges
    fade = int(SR * 0.05)
    out[:fade] *= np.linspace(0, 1, fade)
    out[-fade:] *= np.linspace(1, 0, fade)
    _ = tt
    return norm(out, 0.7)


SOUNDS = [("pop", pop), ("whoosh", whoosh), ("snap", snap), ("wobble", wobble), ("chime", chime),
          ("steps", steps), ("stamp", stamp), ("dial", dial), ("music", music)]

if __name__ == "__main__":
    import sys

    force = "--force" in sys.argv  # regenerate everything, even files that exist
    for name, fn in SOUNDS:
        if force or not (OUT / f"{name}.wav").exists():
            save(name, fn())
            print("wrote", name)
