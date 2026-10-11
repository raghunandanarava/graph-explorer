# Publishing extras

Everything you need to upload an episode, made by the same `make_video.py` run:

| File | What it is | Made by |
| --- | --- | --- |
| `out/<id>-landscape.mp4` | 1920 × 1080 full episode (YouTube) | Remotion `Landscape` |
| `out/<id>-vertical.mp4` | 1080 × 1920 full episode | Remotion `Vertical` |
| `out/<id>-short.mp4` | 1080 × 1920 cut under 60 s (YouTube Shorts, Reels, TikTok) | Remotion `Short` |
| `out/<id>-thumbnail.png` | 1280 × 720 YouTube thumbnail | Remotion still `Thumbnail` |
| `out/<id>-cover.png` | 1080 × 1920 cover frame for the Short / Reel | Remotion still `Cover` |
| `out/<id>.srt` | captions for both full-length videos | `pipeline/publish.py` |
| `out/<id>-short.srt` | captions for the Short | `pipeline/publish.py` |
| `out/<id>-youtube.txt` | title, description, chapters, sources, hashtags | `pipeline/publish.py` |

The text files are always written. Choose which videos and stills to render with
`--formats` (default: all five):

```bash
python pipeline/make_video.py --plan episodes/sample/plan.json --id sample --formats short,thumbnail
```

## The Short

`publish.short_segments()` picks slices of the full episode and stores them in
`episode.json` under `short`:

1. the end of the intro (from 1.4 s, so the title pops but the typing is skipped)
2. scene 0, the hook
3. the climax: the first **pull** scene plus its **restore**; otherwise the first **nudge**
   scene; otherwise the middle scene
4. the last scene, the "so what"
5. the first 2.4 s of the outro, so the "TAKEN APART ✓" stamp lands

If the total is over 58 s, it drops the restore first, then the ending.

The renderer does not re-time anything. `Episode.tsx` takes `segments` and maps
**cut time → episode time** (`cutToEpisode`), so every frame of the Short is literally
a frame of the full episode. Narration and sound effects are placed through
`episodeToCut`; any that fall in a removed part are skipped. A short dark flash
hides each jump.

To choose the slices yourself, edit `short` in
`video/public/episodes/<id>/episode.json` and re-render only the Short:

```bash
cd video
npx remotion render Short ../out/<id>-short.mp4 --props '{"episodeId":"<id>","format":"vertical"}'
```

Times are in seconds of the full episode. `scene` is the scene index, or `null`
for intro and outro slices. It controls which narration goes into the short SRT.

## Thumbnail and cover

`Thumbnail.tsx` draws the episode's big moment: Vertie in the hold pose holding the node it
**pulled out** (otherwise the one it **nudged**, otherwise the middle scene's focus).
Up to two neighbours are shown with torn edges; they're cracked and coral if the node
was pulled out. The title is broken into lines with the last word in amber.

Position tweaks are at the bottom of `Thumbnail.tsx` (`vx, vy, vs` for Vertie and
`others` for the neighbours). Preview in Studio (`npm run studio` → *Thumbnail*), or:

```bash
npx remotion still Thumbnail ../out/<id>-thumbnail.png --props '{"episodeId":"<id>","format":"landscape"}'
```

## Captions (SRT)

The SRT chunks follow the same rules as the burnt-in karaoke subtitles (`wordsFor()` in
`Episode.tsx`): at most six words, or up to a sentence end, timed from the mouth cues.
Upload `<id>.srt` alongside the full videos so viewers can switch captions off or have
them translated automatically.

> **Sync contract:** `_chunks()` in `publish.py` mirrors `wordsFor()` in `Episode.tsx`.

## YouTube description

`<id>-youtube.txt` contains:

- **title** and a **hook** (the first narration line, without the greeting)
- "In this episode:" with every node label
- **chapters**. YouTube only shows them if the first is at 0:00, there are at least
  three, and each is at least 10 s long, so short or uncaptioned scenes are merged
  into the previous chapter. If that leaves fewer than three, the chapter list is left out.
- **sources**, read from `episodes/<id>/factcheck.json` when it exists (see the
  fact-check step)
- the series tagline and hashtags

Run it on its own for an existing episode:

```bash
cd pipeline
python -c "import json, publish, pathlib as p; ep=json.load(open('../video/public/episodes/sample/episode.json')); print(publish.write_all(ep, p.Path('../out'), p.Path('../episodes/sample')))"
```
