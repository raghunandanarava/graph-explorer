# Animation polish: character, depth, node and edge motion

Three layers of motion sit on top of the basic director. All of them are pure functions
of the frame number (no state between frames), so Studio can scrub anywhere and frames
still render in parallel.

## 1. Vertie's body motion

`director.bodyFx(i, t, time)` returns a `VertieFx` for every frame; `Vertie.tsx` only draws it.

| Field | Effect |
| --- | --- |
| `squash` | stretch tall (> 0) or squash wide (< 0), pivoting at the feet, volume roughly preserved |
| `lean` | degrees, pivoting at the feet |
| `lift` | hop height in px; the shadow shrinks and fades as it rises |
| `startle` | 0..1: eyes widen, pupils shrink, mouth becomes an O, antennae whip |
| `vx` | horizontal speed; antennae trail behind it (follow-through) |

What triggers what (all times are seconds into the scene; `o` = `animOffset`):

| Moment | Motion |
| --- | --- |
| breathing | constant ±1.2% squash on the absolute clock (so it never jumps at a scene cut) |
| walk start | 0 → 0.3 s wind-up: crouch and rock back |
| walking | lean into the direction, slight stretch with speed |
| arrival | damped landing squash |
| `pose: "cheer"` | decaying hops, with contact squash and stretch |
| `expression: "excited"` | one small hop at 0.25 s |
| pull (`remove`) | at `o + REMOVE_AT + 0.05`: recoil away from the node, stretch, hop, startle |
| restore | small happy hops at `o + RESTORE_AT` |
| nudge | small lean towards the node at `o + NUDGE_AT` |

Other changes in the same pass:
- Hands overshoot their pose slightly and settle (`easeBack`, `POSE_MOVE` 0.55 s).
- Eyes glide to the next target over 0.4 s instead of jumping, with a little idle wander.
- A `reach` at a node that hasn't popped in yet now points first and reaches once the node appears.

## 2. Depth and parallax (`Backdrop.tsx`)

The world is drawn in layers that follow the camera at different speeds. A layer with factor
`k` uses `translate(centre) scale(zoom^k) translate(-camera·k)`: `k < 1` moves slower and
looks far away, `k > 1` looks close.

| Layer | k | Contents |
| --- | --- | --- |
| far | 0.2 | soft colour glows; a faint "ghost graph" of drifting nodes and edges |
| mid | 0.55 | bokeh dots and rings drifting upwards |
| light | screen space | three slow diagonal beams (screen blend) |
| world | 1 | grid, graph, Vertie |
| near | 1.5 | a few big out-of-focus dots sliding past quickly |

Positions are generated once with a seeded random generator, so every render is identical.
The layers cover wide regions so the camera never runs off them, even during a zoom dive.
Nodes and edges also get a soft drop shadow.

## 3. Node and edge motion

Computed in `director.ts` (`NodeState.age`, `.burst`; `EdgeState.tension`, `.snapAge`, `.pulse`),
drawn in `graph/Graph.tsx`.

| Element | Motion |
| --- | --- |
| idle node | floats ±5 px, each on its own phase (edges follow) |
| node pops in | squash-and-stretch settle plus an expanding ring in its colour |
| edge drawing | a glowing spark rides the head of the line |
| edge idle | an energy pulse travels from source to target every ~2.5 s (hidden when the simulation's flow dots are showing) |
| before a pull | 0.35 s tug: the node leans towards Vertie's hand and shakes; its edges straighten, thin, tint coral and quiver |
| the pull | edges snap back with a burst of sparks; the torn stubs appear as before |
| downstream nodes | a coral shockwave ring and sparks as each one breaks |
| restore | a mint ring and sparks as each node heals |

## Tuning

| Want | Change |
| --- | --- |
| calmer / livelier idle drift | `BOB` in `director.ts` |
| bigger or smaller hops, recoil, landing squash | the numbers in `bodyFx()` |
| more or fewer background elements | densities in `Backdrop.tsx` (`count(k, pxPerElement)`) |
| stronger or weaker beams, glows | `o` values in `Shafts` / `GLOWS` |
| turn the idle pulse off | `pulse` in the edge loop of `director.build()` |

Render time grows a little with the extra layers (about 4 minutes for the 80 s rain episode
at half resolution on a 2-core cloud machine; your M2 Pro will be faster).
