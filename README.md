# Graph Explorer: Vertie's explainer videos

Topic or script in, narrated animated video out, in **16:9** (YouTube) and **9:16** (Shorts/Reels).
Everything runs locally on your Mac.

**Docs:** [Architecture](docs/ARCHITECTURE.md) (diagrams, data contracts, components) · [Running step by step](docs/RUNNING.md) · [Feedback loops + live simulation](docs/FEEDBACK_LOOPS.md) · [Publishing extras](docs/PUBLISHING.md) · [Zoom into a node](docs/ZOOM.md) · [Fact-check](docs/FACTCHECK.md) · [Animation polish](docs/ANIMATION.md)

```
topic / script
   │  Ollama (local LLM)          pipeline/planner.py
   ▼
plan.json  ← you can edit this by hand
   │  fact-check (optional)       pipeline/factcheck.py  → factcheck.md
   │  graph layout (networkx)     pipeline/layout.py
   │  British voice (Kokoro)      pipeline/tts.py
   │  mouth shapes (Rhubarb)      pipeline/lipsync.py
   ▼
video/public/episodes/<id>/episode.json + scene_XX.wav
   │  Remotion (React)            video/src/
   ▼
out/<id>-landscape.mp4, -vertical.mp4, -short.mp4, -thumbnail.png, -cover.png
out/<id>.srt, <id>-short.srt, <id>-youtube.txt      pipeline/publish.py
```

## One-time setup (macOS)

```bash
brew install ffmpeg espeak-ng node python@3.12
brew install --cask ollama          # open Ollama once, then:
ollama pull llama3.1:8b             # or a newer ~8B model

cd ~/AI_Projects/graph-explorer
conda create -n vertie python=3.12 -y && conda activate vertie   # or a venv
pip install -r requirements.txt

cd video && npm install && cd ..
```

**Rhubarb Lip Sync:** download the macOS zip from
https://github.com/DanielSWolf/rhubarb-lip-sync/releases (v1.14.0), unzip it into `tools/`
(so you get `tools/Rhubarb-Lip-Sync-1.14.0-macOS/rhubarb`). The first time, macOS may block it:
right-click the `rhubarb` file in Finder → Open → Open, or run
`xattr -dr com.apple.quarantine tools/Rhubarb-Lip-Sync-1.14.0-macOS`.

## Making an episode

```bash
conda activate vertie

# 1. Let the LLM write the plan, then stop so you can review it
python pipeline/make_video.py --topic "How do vaccines work?" --id vaccines --plan-only

# 2. Check the facts against Wikipedia, read episodes/vaccines/factcheck.md
python pipeline/factcheck.py episodes/vaccines/plan.json

# 3. Edit episodes/vaccines/plan.json (fix facts, wording, nodes), then build everything
python pipeline/make_video.py --plan episodes/vaccines/plan.json --id vaccines

# Or start from your own script
python pipeline/make_video.py --script my_script.txt --id my-episode --plan-only
```

Useful options:

| Option | Default | What it does |
| --- | --- | --- |
| `--voice` | `bf_emma` | Kokoro British voice (`bf_*` female, `bm_*` male). Or set `VERTIE_VOICE`. |
| `--speed` | `1.0` | Speaking speed |
| `--model` | `llama3.1:8b` | Ollama model for planning. Or set `OLLAMA_MODEL`. |
| `--formats` | `landscape,vertical,short,thumbnail,cover` | Render a subset, e.g. `--formats landscape,thumbnail` |
| `--no-render` | off | Build audio + data only; preview in Remotion Studio |
| `--factcheck` | off | Check the narration against Wikipedia after planning; stops on contradictions ([docs](docs/FACTCHECK.md)) |
| `--engine espeak` | `kokoro` | Robotic fallback voice, no model download |

**Preview and tweak live:** `cd video && npm run studio` opens Remotion Studio in your browser,
where you can scrub through an episode and see code changes instantly. Change `episodeId` in the
props panel to switch episodes.

**Music:** put `music.mp3` in `video/public/episodes/<id>/` before building; it plays quietly
under the narration. Use only music you have the rights to (e.g. YouTube Audio Library).

## What's in an episode

- **Intro card** (series name types on, title pops in), then the scenes, then an
  **outro** with a "TAKEN APART ✓" stamp.
- **A world bigger than the screen**: the camera pans and zooms to whatever Vertie is
  talking about, and Vertie walks over to it (`video/src/director.ts`).
- **Illustrated nodes**: 32 riso-style icons (`video/src/graph/icons.tsx`).
- **The pull beat**: one scene sets `"remove"`; Vertie yanks that node out, its edges
  tear, everything downstream cracks and wobbles. The next scene sets `"restore": true`.
- **Sound**: synthesised pops, whooshes, snap, chime, footsteps and a lo-fi music bed
  that ducks under the narration (`pipeline/sfx.py` writes `video/public/sfx/`).
  Swap any of those WAVs for your own; keep the file names.
- **Karaoke subtitles** and section captions (`§02 Follow the energy`).

## Vertie's personality

`pipeline/persona.md` is Vertie's character bible: who it is, how it talks,
signature lines, words to avoid, and the episode shape (hook, build, pull,
restore, zoom out). The script-writer reads it every time, so editing that file
changes every future episode.

## The plan format

Each scene in `plan.json`:

```json
{
  "narration": "Warm water evaporates. It rises into the air as vapour.",
  "caption": "Evaporation",
  "expression": "curious",          // neutral | curious | excited | puzzled
  "pose": "reach",                  // idle | wave | point | think | reach | cheer
  "reach": "vapour",                // node Vertie plugs a hand into (with pose "reach")
  "new_graph": false,               // true = clear the board, start a new graph
  "open": null,                     // node id to dive inside (see docs/ZOOM.md)
  "close": false,                   // true = come back out of the last "open"
  "add_nodes": [{"id": "vapour", "label": "Vapour", "color": "chalk", "icon": "vapour"}],
  "add_edges": [{"from": "sea", "to": "vapour", "label": "evaporates"}],
  "focus": ["sea", "vapour"],       // nodes to highlight
  "remove": null,                   // node id to pull out (the "what if" beat)
  "restore": false                  // true = put the pulled node back
}
```

Node colours: `amber`, `coral`, `mint`, `chalk`, `haze`.
Icons: see `ICONS` in `pipeline/plan_schema.py` (sun, cloud, raindrop, cell, brain, coin, …).

## Where to change things

| You want to change | Edit |
| --- | --- |
| Vertie's look, poses, mouth shapes | `video/src/character/Vertie.tsx` |
| Colours and fonts | `video/src/theme.ts` |
| Node/edge look | `video/src/graph/Graph.tsx` (timing lives in `director.ts`; keep `animation_time` in `pipeline/make_video.py` in sync) |
| Intro/outro, captions, subtitles | `video/src/Episode.tsx` |
| Vertie's personality | `pipeline/persona.md` |
| Scene-plan rules for the script-writer | `pipeline/planner.py` (`RULES`) |
| Camera, walking, pull/restore timing | `video/src/director.ts` |
| Vertie's squash, hops, startle; node bob and rings | `bodyFx()` and `build()` in `director.ts`, drawn by `Vertie.tsx` / `graph/Graph.tsx` |
| Background layers, light beams | `video/src/Backdrop.tsx` |
| Node icons | `video/src/graph/icons.tsx` + `ICONS` in `pipeline/plan_schema.py` |
| Sound effects and music | `pipeline/sfx.py`, or drop your own WAVs into `video/public/sfx/` |
| Thumbnail and Shorts cover | `video/src/Thumbnail.tsx` |
| Which scenes go into the Short; description text | `pipeline/publish.py` |
| Zoom dive / porthole transition | `video/src/director.ts` (`DIVE`, `IRIS`, `ZOOM_LEAD`) + `Portal` in `Episode.tsx` |
| Fact-check prompts and sources | `pipeline/factcheck.py` |

## Ideas for next steps

- Replace the placeholder Vertie with your Procreate design (see the guide).
- Rename the character and add its hidden backstory.
- Word-accurate subtitles with Whisper (`pip install openai-whisper`) instead of estimated timing.
- Replace Rhubarb (Intel-only) with mouth shapes from Kokoro's phonemes before macOS 28.
- An interactive web version where viewers can pull nodes out themselves.
- A style LoRA (FLUX via `mflux`) for occasional illustrated backgrounds.
