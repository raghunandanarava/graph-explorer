# Extension: feedback loops and live simulation

For topics where things feed back on themselves (climate, economies, populations,
habits, the body), Vertie can mark edges as **+** or **−**, name the **loops** they
form, and **nudge** a node to start a live simulation that plays out on screen.

The sample episode is `episodes/arctic/plan.json` ("Why is the Arctic warming so
fast?"). It has one reinforcing loop (ice reflecting sunlight) and one balancing
loop (Earth radiating heat to space).

```bash
python pipeline/make_video.py --plan episodes/arctic/plan.json --id arctic --voice bm_fable
```

Everything here is optional. Plans without these fields render exactly as before.

## What it adds to a plan

```jsonc
// on an edge: the polarity of the cause → effect relationship
{ "from": "warmth", "to": "ice", "label": "melts", "sign": "-" }

// on a scene: highlight a loop (node ids in arrow order; the edges must exist)
"loop": ["warmth", "ice", "mirror"]

// on a scene: start the live simulation by pushing one node
"nudge": { "node": "warmth", "by": 0.8 }   // by: -2 … 2, negative pushes down
```

| Field | Meaning | On screen |
| --- | --- | --- |
| `sign: "+"` | more of *from* → more of *to* | amber ⊕ badge near the arrowhead |
| `sign: "-"` | more of *from* → less of *to* | blue ⊖ badge |
| `loop` | the nodes of a closed loop | spinning **R** (reinforcing, coral) or rocking **B** (balancing, mint) badge in the loop's centre, plus a chime |
| `nudge` | push a node away from normal | Vertie reaches and turns a dial (ratchet sound), then the graph comes alive |

**Loop type is computed, not written.** An even number of `-` edges round the loop
makes it **reinforcing** (it feeds itself); an odd number makes it **balancing**
(it pushes back). `make_video.py` works this out and stores
`{"nodes": [...], "kind": "reinforcing" | "balancing"}` in `episode.json`.

A pair of opposite edges (A → B and B → A) is drawn as two curves bowing apart,
so two-node loops stay readable.

## The simulation model (`pipeline/simulate.py`)

Each node holds one number: its **change from normal** (0 = normal). Signed edges
pass changes along:

```
dx_i/dt = RATE · ( Σ over edges j→i of  sign · tanh(x_j)  −  DECAY · x_i )
```

| Piece | Why |
| --- | --- |
| `sign` | + edges pass a change on, − edges invert it |
| `tanh(x_j)` | each influence is capped at ±1, so a runaway loop **saturates** instead of exploding |
| `DECAY · x_i` | everything drifts back to normal when nothing pushes it |
| `RATE` | how fast changes travel (1.3 per second) |

What that produces:

- **Reinforcing loop with loop gain above `DECAY`:** a nudge grows until it saturates ("it runs away with itself").
- **Balancing loop:** a nudge is pushed back, often overshooting and wobbling before it settles.
- **Chains with no loop:** a ripple passes through and fades.

Rules that keep it honest to the story:

- An edge only carries influence **after it has been drawn on screen**, so the simulation never runs ahead of the narration.
- A node Vertie has **pulled out** (`remove`) is frozen at 0 and influences nothing until it's restored.
- One run per graph (`group`), starting at the first nudge (1.0 s into that scene, `NUDGE_AT`) and lasting to the end of that graph. Further nudges add on top.

The run is integrated in Python (4 sub-steps per frame) and stored in `episode.json`:

```jsonc
"sim": [{ "group": 0, "start": 50.89, "fps": 30, "values": { "warmth": [0.651, 0.64, …], … } }]
```

Values are `tanh(x)`, so always between −1 and 1. The renderer only looks them up.

**Tuning:** `RATE`, `DECAY` and `SUBSTEPS` are at the top of `simulate.py`.
Raise `DECAY` above 1 and the Arctic's ice loop stops running away; that's a good
way to *see* what loop gain means.

## On screen

| Element | File | Behaviour |
| --- | --- | --- |
| Gauge ring | `graph/Graph.tsx` (`Gauge`) | ring round each node: fills clockwise in amber when the value rises, anticlockwise in blue when it falls; ▲/▼ badge once the change is clear; the node swells slightly |
| Flow dots | `graph/Graph.tsx` (`EdgeView`) | dots run along an edge, faster when the source has moved more; amber if they push the target **up**, blue if they push it **down** (source direction × edge sign) |
| Sign badges | `graph/Graph.tsx` (`EdgeView`) | ⊕ / ⊖ at 80% along the edge |
| Loop badge | `graph/Graph.tsx` (`LoopBadge`) | R or B with a circling arrow, at the loop's centre |
| Live panel | `SimPanel.tsx` | "oscilloscope" of the last 8 s for up to four nodes (the loop, focus or nudged node; otherwise those that moved most), with ▲/▼ percentages |
| Framing | `director.ts` (`computeCamera`) | once a graph is simulating, the camera leaves room for the panel: content shifts left (landscape) or down (vertical) |
| Vertie | `director.ts` (`segments`) | in a nudge scene Vertie stands within reach of the node, reaches for it until 1.6 s, then points |

## Script-writer support

- `pipeline/planner.py` (`RULES`) tells the LLM when to use signs, loops and a nudge, and to narrate what the simulation does next.
- `pipeline/persona.md` adds the **Nudge** beat (an alternative to Pull and Restore for loop topics) and the line "Let's give it a nudge and see what happens."
- `clean_plan()` drops a loop whose edges don't exist in that order, clamps `by` to ±2, drops a nudge on an unknown node or in a scene that also removes one, and puts Vertie in the `reach` pose towards the nudged node.

Nudge scenes last at least 7 seconds, so the simulation has time to show its shape.

## Ideas for later

- **Edge weights** (`"strength": "weak" | "strong"`) so one loop can dominate another.
- **Delays** on edges, which turn balancing loops into proper oscillators (predator and prey).
- **Constant inputs** ("keep pushing" instead of one nudge) for policies and habits.
- An **interactive web version**: port `simulate()` to TypeScript (about 40 lines) and let viewers nudge nodes themselves with the Remotion Player.
