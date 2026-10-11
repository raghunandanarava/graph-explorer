# Running the pipeline step by step

Run everything from the project root (`graph-explorer/`) with the Python
environment active (`conda activate vertie`). See
[ARCHITECTURE.md](ARCHITECTURE.md) for what each step does.

## All at once

```bash
python pipeline/make_video.py --topic "Why do we sleep?" --id sleep
```

Options: `--voice bm_fable`, `--speed 1.0`, `--model llama3.1:8b`,
`--formats landscape,vertical,short,thumbnail,cover`, `--engine kokoro|espeak`, `--plan-only`, `--no-render`,
`--factcheck`.

## Stage 1: plan

Ollama must be running.

```bash
python pipeline/make_video.py --topic "Why do we sleep?" --id sleep --plan-only
# or from your own script:
python pipeline/make_video.py --script my_script.txt --id sleep --plan-only
```

This writes `episodes/sleep/plan.json`. Edit it freely.

Check a hand-edited plan (validate, clean, print):

```bash
PYTHONPATH=pipeline python -c "
from plan_schema import Plan, clean_plan
p = clean_plan(Plan.model_validate_json(open('episodes/sleep/plan.json').read()))
print(p.model_dump_json(by_alias=True, indent=2))"
```

Fact-check it against Wikipedia (writes `episodes/sleep/factcheck.md`; see [FACTCHECK.md](FACTCHECK.md)):

```bash
python pipeline/factcheck.py episodes/sleep/plan.json
```

## Stage 2: episode data

```bash
python pipeline/make_video.py --plan episodes/sleep/plan.json --id sleep --no-render
```

This writes `video/public/episodes/sleep/` (`episode.json` + `scene_NN.wav`).

Individual pieces:

```bash
# sound effects and music (only needed once, or after editing sfx.py)
python pipeline/sfx.py

# layout only: node positions
PYTHONPATH=pipeline python -c "
import json
from plan_schema import Plan, clean_plan
from layout import layout
p = clean_plan(Plan.model_validate_json(open('episodes/sleep/plan.json').read()))
nodes, edges = layout(p)
print(json.dumps(nodes, indent=2))"

# voice only: one line to test.wav, prints the length in seconds
PYTHONPATH=pipeline python -c "
from pathlib import Path
from tts import synthesise
print(synthesise('Right. Let us take it apart.', Path('test.wav'), voice='bm_fable'))"

# lip-sync only: mouth cues for that file
PYTHONPATH=pipeline python -c "
from pathlib import Path
from lipsync import mouth_cues
for c in mouth_cues(Path('test.wav'), 'Right. Let us take it apart.'): print(c)"
```

## Stage 3: preview and render

```bash
cd video

# live preview; change episodeId in the props panel
npm run studio

# a single frame
npx remotion still Landscape ../out/frame.png --frame=600 --props '{"episodeId":"sleep","format":"landscape"}'

# a section (frames 0–299 = first 10 s)
npx remotion render Landscape ../out/sleep-test.mp4 --frames=0-299 --props '{"episodeId":"sleep","format":"landscape"}'

# full renders
npx remotion render Landscape ../out/sleep-landscape.mp4 --props '{"episodeId":"sleep","format":"landscape"}'
npx remotion render Vertical  ../out/sleep-vertical.mp4  --props '{"episodeId":"sleep","format":"vertical"}'

# publishing extras (see PUBLISHING.md)
npx remotion render Short    ../out/sleep-short.mp4     --props '{"episodeId":"sleep","format":"vertical"}'
npx remotion still Thumbnail ../out/sleep-thumbnail.png --props '{"episodeId":"sleep","format":"landscape"}'
npx remotion still Cover     ../out/sleep-cover.png     --props '{"episodeId":"sleep","format":"vertical"}'
```

## Typical loop

1. Stage 1, then read and fix `plan.json`.
2. Fact-check it (`python pipeline/factcheck.py …`), fix anything in `factcheck.md`.
3. Stage 2 with `--no-render`.
4. Preview in Studio; tweak the plan or the code; rerun stage 2 if the plan changed.
5. Render once it looks right (rendering is the slow step). Upload the files listed in
   [PUBLISHING.md](PUBLISHING.md).

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Bad CPU type in executable` (Rhubarb) | `softwareupdate --install-rosetta --agree-to-license` |
| "Apple could not verify rhubarb…" | `xattr -dr com.apple.quarantine tools/Rhubarb-Lip-Sync-1.14.0-macOS` |
| pip tries to build spaCy / `cp313` in errors | the environment is Python 3.13; recreate it with `python=3.12` |
| `Connection refused` on port 11434 | start Ollama (open the app, or `ollama serve`) |
| Scene ends before its animation | `animation_time()` in `make_video.py` is out of sync with `director.ts` |
| Studio shows an old episode | rerun stage 2, then reload the Studio tab |
| Fact-check: lots of "not found" | normal for numbers and paraphrases; check those by hand, or soften the wording |
| Fact-check: `403` / connection errors | no internet, or Wikipedia rate-limited you; wait and rerun |
| A zoom scene looks static for a second | expected: its own animation waits 1.7 s for the dive (`animOffset`) |
