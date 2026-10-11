"""Generate Vertie's character sheet as a layered SVG for Figma.

python art/make_sheet.py  ->  art/vertie/vertie-character-sheet.svg

Every part is a named group (<g id="...">), which Figma turns into named layers.
Geometry matches video/src/character/Vertie.tsx: body centre (0,0), radius 100.
"""
from __future__ import annotations

import math
from pathlib import Path

INK = "#0E2440"
BLUEPRINT = "#163A5F"
GRID = "#21497A"
CHALK = "#F2EFE6"
HAZE = "#9DB8D2"
AMBER = "#F2A93B"
CORAL = "#E8684A"
MINT = "#5CC8A8"
MINT_DOT = "#2F8F74"
MONO = "IBM Plex Mono, monospace"
DISPLAY = "Bricolage Grotesque, sans-serif"

OFFSET = (7, 6)  # risograph misregistration: fills sit slightly off the ink lines

POSES = {
    "idle": ((-138, 64), (138, 58)),
    "wave": ((-138, 64), (150, -96)),
    "point": ((-134, 72), (205, -24)),
    "think": ((-134, 72), (96, 66)),
    "reach": ((-134, 72), (240, -70)),
    "cheer": ((-146, -116), (146, -116)),
}
SHOULDER_L, SHOULDER_R = (-70, 12), (70, 4)
HIP_L, HIP_R = (-30, 94), (30, 94)
FOOT_L, FOOT_R = (-50, 190), (50, 190)
ANTENNAE = [((-34, -92), (-66, -180), CORAL, 11), ((34, -92), (64, -186), AMBER, 11), ((0, -100), (0, -168), HAZE, 9)]


def line(a, b, w=6, color=CHALK, extra=""):
    return f'<line x1="{a[0]}" y1="{a[1]}" x2="{b[0]}" y2="{b[1]}" stroke="{color}" stroke-width="{w}" stroke-linecap="round" {extra}/>'


def riso_node(cx, cy, r, fill, name, ring=True):
    """A node drawn like a two-colour print: fill offset from the ink ring."""
    ox, oy = OFFSET[0] * r / 100 + 1.5, OFFSET[1] * r / 100 + 1.5
    s = f'<g id="{name}"><circle cx="{cx + ox:.1f}" cy="{cy + oy:.1f}" r="{r}" fill="{fill}"/>'
    if ring:
        s += f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="{INK}" stroke-width="{max(2.5, r * 0.22):.1f}"/>'
    return s + "</g>"


def halftone():
    """Halftone shading on the lower right of the body, as real dots."""
    dots = []
    step = 9
    for gx in range(-100, 101, step):
        for gy in range(-100, 101, step):
            x, y = gx + (step / 2 if (gy // step) % 2 else 0), gy
            if math.hypot(x - OFFSET[0], y - OFFSET[1]) > 92:
                continue
            t = (x * 0.62 + y * 0.78) / 100  # towards lower right
            if t < 0.25:
                continue
            r = 0.6 + 3.2 * min(1, (t - 0.25) / 0.7)
            dots.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r:.2f}"/>')
    return f'<g id="body_halftone" fill="{MINT_DOT}" opacity="0.55">{"".join(dots)}</g>'


def eyes(expression="neutral", look=4):
    if expression == "excited":
        return (
            f'<g id="eyes_happy"><path d="M-50 -14 Q-32 -36 -14 -14 M14 -14 Q32 -36 50 -14" stroke="{INK}" '
            f'stroke-width="7" stroke-linecap="round" fill="none"/></g>'
        )
    rl = 19 if expression == "puzzled" else 21
    rr = 26 if expression == "curious" else (19 if expression == "puzzled" else 21)
    out = []
    for name, cx, r in (("eye_left", -32, rl), ("eye_right", 32, rr)):
        out.append(
            f'<g id="{name}"><circle cx="{cx}" cy="-18" r="{r}" fill="{CHALK}"/>'
            f'<circle cx="{cx + look}" cy="-16" r="{r * 0.45:.1f}" fill="{INK}"/>'
            f'<circle cx="{cx + look + 3}" cy="-20" r="{r * 0.15:.1f}" fill="{CHALK}"/></g>'
        )
    if expression == "puzzled":
        out.append(f'<g id="brow"><line x1="12" y1="-56" x2="50" y2="-64" stroke="{INK}" stroke-width="6" stroke-linecap="round"/></g>')
    return "".join(out)


def glasses():
    return (
        f'<g id="glasses" fill="none" stroke="{INK}" stroke-width="4.5">'
        f'<circle cx="-32" cy="-18" r="29"/><circle cx="32" cy="-18" r="29"/>'
        f'<path d="M-4 -22 Q0 -28 4 -22" stroke-linecap="round"/>'
        f'<line x1="-61" y1="-22" x2="-84" y2="-30" stroke-linecap="round"/>'
        f'<line x1="61" y1="-22" x2="84" y2="-30" stroke-linecap="round"/></g>'
    )


def mouth(v="X", expression="neutral"):
    y = 40
    if v == "X":
        if expression == "excited":
            return f'<path d="M-20 {y - 6} Q0 {y + 24} 20 {y - 6} Z" fill="{CORAL}" stroke="{INK}" stroke-width="4"/>'
        if expression == "puzzled":
            return f'<path d="M-16 {y} Q-8 {y - 6} 0 {y} Q8 {y + 6} 16 {y}" stroke="{INK}" stroke-width="5" stroke-linecap="round" fill="none"/>'
        if expression == "curious":
            return f'<circle cx="0" cy="{y}" r="6" fill="{INK}"/>'
        return f'<path d="M-16 {y - 4} Q0 {y + 10} 16 {y - 4}" stroke="{INK}" stroke-width="5" stroke-linecap="round" fill="none"/>'
    shapes = {
        "A": f'<line x1="-14" y1="{y}" x2="14" y2="{y}" stroke="{INK}" stroke-width="5" stroke-linecap="round"/>',
        "B": f'<ellipse cx="0" cy="{y}" rx="14" ry="5" fill="{INK}"/>',
        "C": f'<ellipse cx="0" cy="{y}" rx="16" ry="9" fill="{INK}"/>',
        "D": f'<ellipse cx="0" cy="{y + 2}" rx="20" ry="15" fill="{INK}"/><ellipse cx="0" cy="{y + 11}" rx="10" ry="5" fill="{CORAL}"/>',
        "E": f'<ellipse cx="0" cy="{y}" rx="11" ry="11" fill="{INK}"/>',
        "F": f'<ellipse cx="0" cy="{y}" rx="7" ry="8" fill="{INK}"/>',
        "G": f'<ellipse cx="0" cy="{y}" rx="16" ry="8" fill="{INK}"/><rect x="-12" y="{y - 8}" width="24" height="5" rx="2" fill="{CHALK}"/>',
        "H": f'<ellipse cx="0" cy="{y}" rx="16" ry="12" fill="{INK}"/><ellipse cx="0" cy="{y - 3}" rx="8" ry="5" fill="{CORAL}"/>',
    }
    return shapes[v]


def vertie(pose="idle", expression="neutral", viseme="X", prefix="vertie"):
    hl, hr = POSES[pose]
    excited = expression == "excited"
    p = [f'<g id="{prefix}">']
    p.append(f'<g id="shadow"><ellipse cx="0" cy="200" rx="96" ry="11" fill="{INK}" opacity="0.5"/></g>')
    p.append(f'<g id="legs">{line(HIP_L, FOOT_L)}{line(HIP_R, FOOT_R)}</g>')
    p.append(
        f'<g id="feet"><circle cx="{FOOT_L[0]}" cy="{FOOT_L[1]}" r="16" fill="{INK}" stroke="{CHALK}" stroke-width="4"/>'
        f'<circle cx="{FOOT_R[0]}" cy="{FOOT_R[1]}" r="16" fill="{INK}" stroke="{CHALK}" stroke-width="4"/></g>'
    )
    ant = ['<g id="antennae">']
    for i, (base, tip, col, r) in enumerate(ANTENNAE):
        name = ["antenna_left", "antenna_right", "antenna_mid"][i]
        ant.append(f'<g id="{name}">{line(base, tip, 5)}')
        if excited and i < 2:
            ant.append(f'<circle cx="{tip[0]}" cy="{tip[1]}" r="{r + 10}" fill="none" stroke="{col}" stroke-width="3" opacity="0.5"/>')
        ant.append(riso_node(tip[0], tip[1], r + (2 if excited and i < 2 else 0), col, f"{name}_node") + "</g>")
    ant.append("</g>")
    p.append("".join(ant))
    p.append(f'<g id="arms">{line(SHOULDER_L, hl)}{line(SHOULDER_R, hr)}</g>')
    p.append(f'<g id="hands">{riso_node(hl[0], hl[1], 15, CORAL, "hand_left")}{riso_node(hr[0], hr[1], 15, CORAL, "hand_right")}</g>')
    p.append(
        f'<g id="body"><circle id="body_fill" cx="{OFFSET[0]}" cy="{OFFSET[1]}" r="100" fill="{MINT}"/>'
        f"{halftone()}"
        f'<path id="body_highlight" d="M-72 -38 Q-60 -70 -30 -82" stroke="{CHALK}" stroke-opacity="0.45" stroke-width="9" stroke-linecap="round" fill="none"/>'
        f'<circle id="body_outline" cx="0" cy="0" r="100" fill="none" stroke="{INK}" stroke-width="5"/></g>'
    )
    p.append(f'<g id="face">{eyes(expression)}{glasses()}<g id="mouth_{viseme}">{mouth(viseme, expression)}</g></g>')
    p.append("</g>")
    return "".join(p)


def text(x, y, s, size=18, color=CHALK, family=MONO, weight=400, anchor="start", extra=""):
    return f'<text x="{x}" y="{y}" font-family="{family}" font-size="{size}" font-weight="{weight}" fill="{color}" text-anchor="{anchor}" {extra}>{s}</text>'


def drawing_annotations():
    """Technical-drawing callouts around the hero figure (local coordinates)."""
    a = ['<g id="annotations" font-family="IBM Plex Mono, monospace">']
    a.append(f'<circle cx="0" cy="0" r="118" fill="none" stroke="{HAZE}" stroke-width="1.5" stroke-dasharray="4 7"/>')
    a.append(f'<line x1="-140" y1="0" x2="140" y2="0" stroke="{HAZE}" stroke-width="1" stroke-dasharray="2 6"/>')
    a.append(f'<line x1="0" y1="-215" x2="0" y2="225" stroke="{HAZE}" stroke-width="1" stroke-dasharray="2 6"/>')
    # radius dimension
    a.append(f'<line x1="0" y1="0" x2="-71" y2="71" stroke="{AMBER}" stroke-width="2"/>')
    a.append(text(-150, 128, "r = 100", 16, AMBER, weight=600))
    # arm angle arc
    ang = math.degrees(math.atan2(58 - 4, 138 - 70))
    a.append(f'<path d="M118 4 A48 48 0 0 1 {70 + 48 * math.cos(math.radians(ang)):.1f} {4 + 48 * math.sin(math.radians(ang)):.1f}" fill="none" stroke="{AMBER}" stroke-width="2"/>')
    a.append(text(126, 34, f"θ = {ang:.0f}°", 15, AMBER, weight=600))
    # labels with leader lines
    labels = [
        ((-66, -180), (-190, -220), "v₁  antenna (node)"),
        ((64, -186), (150, -230), "v₂  antenna (node)"),
        ((138, 58), (230, 110), "e₄  arm → v₅ hand"),
        ((-138, 64), (-300, 40), "v₆  hand"),
        ((30, 140), (150, 200), "e₇  leg"),
        ((32, -18), (210, -70), "lenses: ∅ 58 mm"),
        ((0, 0), (-310, -110), "v₀  body"),
    ]
    for (px, py), (lx, ly), s in labels:
        anchor = "end" if lx < px else "start"
        a.append(f'<line x1="{px}" y1="{py}" x2="{lx}" y2="{ly}" stroke="{HAZE}" stroke-width="1.2"/>')
        a.append(f'<circle cx="{px}" cy="{py}" r="3" fill="{HAZE}"/>')
        a.append(text(lx + (-6 if anchor == "end" else 6), ly + 5, s, 15, CHALK, anchor=anchor))
    a.append("</g>")
    return "".join(a)


def card(x, y, w, h, label, inner, scale=0.5, cx=None, cy=None, layer=""):
    cx = x + w / 2 if cx is None else cx
    cy = y + h / 2 + 10 if cy is None else cy
    return (
        f'<g id="{layer}">'
        f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="14" fill="{INK}" fill-opacity="0.35" stroke="{GRID}" stroke-width="1.5"/>'
        f'<g transform="translate({cx} {cy}) scale({scale})">{inner}</g>'
        + text(x + 14, y + h - 14, label, 15, HAZE)
        + "</g>"
    )


def sheet() -> str:
    W, H = 3200, 2320
    s = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">']
    s.append(f'<rect id="background" width="{W}" height="{H}" fill="{BLUEPRINT}"/>')
    grid = [f'<g id="grid" stroke="{GRID}" stroke-width="1" opacity="0.6">']
    for gx in range(0, W + 1, 40):
        grid.append(f'<line x1="{gx}" y1="0" x2="{gx}" y2="{H}"/>')
    for gy in range(0, H + 1, 40):
        grid.append(f'<line x1="0" y1="{gy}" x2="{W}" y2="{gy}"/>')
    grid.append("</g>")
    s.append("".join(grid))

    # title block, like an engineering drawing
    s.append('<g id="title_block">')
    s.append(text(100, 150, "VERTIE", 120, CHALK, DISPLAY, 800))
    s.append(text(104, 200, "a graph that walks  ·  character sheet rev 0.2", 26, AMBER, weight=600))
    s.append(text(104, 240, "|V| = 9 nodes   |E| = 8 edges   palette: blueprint / riso", 20, HAZE))
    s.append(f'<rect x="2620" y="70" width="480" height="150" fill="none" stroke="{HAZE}" stroke-width="2"/>')
    for i, (k, v) in enumerate([("DWG", "VRT-001"), ("SCALE", "1 : 1  (body r = 100)"), ("DATE", "2026-10-10")]):
        s.append(text(2640, 110 + i * 40, k, 16, HAZE, weight=600) + text(2760, 110 + i * 40, v, 18, CHALK))
    s.append("</g>")

    # hero
    s.append(f'<g id="hero" transform="translate(700 880) scale(1.7)">{drawing_annotations()}{vertie("idle", "neutral", "X", "vertie_master")}</g>')
    s.append(text(140, 1390, "fig. 1  master rig: every limb is an edge, every joint a node", 20, HAZE))

    # palette
    pal = [("ink", INK), ("blueprint", BLUEPRINT), ("chalk", CHALK), ("haze", HAZE), ("amber", AMBER), ("coral", CORAL), ("mint", MINT), ("mint dot", MINT_DOT)]
    s.append('<g id="palette">')
    for i, (n, c) in enumerate(pal):
        x = 140 + i * 128
        s.append(riso_node(x + 40, 1480, 34, c, f"swatch_{n.replace(' ', '_')}"))
        s.append(text(x + 40, 1545, n, 15, CHALK, anchor="middle") + text(x + 40, 1567, c, 13, HAZE, anchor="middle"))
    s.append("</g>")

    # expressions
    s.append(text(1380, 340, "EXPRESSIONS", 26, AMBER, weight=600))
    s.append('<g id="expressions">')
    for i, e in enumerate(["neutral", "curious", "excited", "puzzled"]):
        x = 1380 + i * 440
        s.append(card(x, 370, 410, 420, e, vertie("idle", e, "X", f"vertie_{e}"), 0.85, x + 205, 560, f"expr_{e}"))
    s.append("</g>")

    # poses
    s.append(text(1380, 860, "POSES", 26, AMBER, weight=600))
    s.append('<g id="poses">')
    for i, pz in enumerate(["idle", "wave", "point", "think", "reach", "cheer"]):
        x = 1380 + (i % 3) * 590
        y = 890 + (i // 3) * 450
        extra = ""
        if pz == "reach":
            extra = riso_node(240 + 46, -70 - 30, 34, AMBER, "target_node") + text(286, -150, "plugs in", 20, AMBER, anchor="middle")
        s.append(card(x, y, 560, 420, pz, vertie(pz, "excited" if pz in ("cheer", "wave") else "neutral", "X", f"vertie_{pz}") + extra, 0.82, x + 260, y + 200, f"pose_{pz}"))
    s.append("</g>")

    # mouth chart
    s.append(text(140, 1840, "MOUTH SHAPES  (Rhubarb visemes)", 26, AMBER, weight=600))
    s.append('<g id="mouths">')
    sounds = {"A": "M B P", "B": "K S T", "C": "EH AE", "D": "AA", "E": "AO ER", "F": "OO W", "G": "F V", "H": "L", "X": "rest"}
    for i, v in enumerate("ABCDEFGHX"):
        x = 140 + i * 335
        head = (
            f'<circle cx="{OFFSET[0]}" cy="{OFFSET[1]}" r="100" fill="{MINT}"/>{halftone()}'
            f'<circle r="100" fill="none" stroke="{INK}" stroke-width="5"/>{eyes()}{glasses()}{mouth(v)}'
        )
        s.append(card(x, 1870, 310, 360, f"{v} · {sounds[v]}", f'<g id="mouth_{v}">{head}</g>', 1.05, x + 155, 2030, f"viseme_{v}"))
    s.append("</g>")
    s.append("</svg>")
    return "".join(s)


if __name__ == "__main__":
    out = Path(__file__).resolve().parent / "vertie" / "vertie-character-sheet.svg"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(sheet(), encoding="utf-8")
    print(out)
