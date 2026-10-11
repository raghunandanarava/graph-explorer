"""Turn a topic (or your own script) into a scene plan with a local LLM via Ollama."""
from __future__ import annotations

import json
import os
from pathlib import Path

import requests

from plan_schema import ICONS, Plan, clean_plan

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")

PERSONA_FILE = Path(__file__).resolve().parent / "persona.md"

RULES = """You write the scene plan for one episode of an animated explainer series
hosted by Vertie (the character bible is above). Follow the episode shape.

Rules for the scene plan:
- 7 to 10 scenes. Each narration is 1 to 3 sentences, at most 40 words.
- Build ONE graph step by step: at most 3 new nodes per scene, at most 9 nodes in total
  unless you set new_graph to true to start a fresh board.
- Node labels: 1-2 words, at most 12 characters. Ids: short snake_case.
- Give every node an icon when one fits. Allowed icons: ICON_LIST.
- Every edge label is a verb or short relationship ("warms", "feeds", "slows down").
  Edge direction = cause -> effect.
- Edges may only connect nodes that already exist or are added in the same scene.
- Use "focus" for the nodes the narration is talking about.
- Use pose "reach" with "reach" = node id when Vertie touches or inspects a node.
- The Pull scene sets "remove" to the most important node; nodes downstream of it break.
  The next scene sets "restore": true. Only one node may be removed at a time.
- Expressions: curious when asking, excited when something connects, puzzled when it breaks.
- Use "caption" for a short heading (max 4 words) on the scenes that start a new idea.
- Be factually accurate. If unsure, keep the claim simple and true, or say it's debated.

Feedback loops (use these when the topic has things that feed back on themselves:
climate, economies, populations, habits, the body):
- Give edges a "sign": "+" if more of the cause means more of the effect,
  "-" if more of the cause means less of the effect. Say it in the narration too.
- When the arrows close a circle, highlight it with "loop": the node ids in arrow order.
  Vertie names it: a "reinforcing loop" if it feeds itself, a "balancing loop" if it
  pushes back. (An even number of "-" signs round the loop = reinforcing, odd = balancing.)
- Use one "nudge" scene instead of (or as well as) the Pull beat: "nudge": {"node": id, "by": 1}
  starts a live simulation. Describe what happens next in that scene and the following
  ones: who rises, who falls, whether it runs away or settles. Nudge scenes need 2-3 sentences.

Zooming into a node (use at most once, when one node is a whole system of its own):
- "open": node id dives inside that node. That scene's add_nodes start the inside, on a
  fresh board (up to 9 nodes). Say you're going in ("Let's go inside the leaf").
- Inside nodes need new ids, different from every id outside.
- "close": true comes back out to the outer graph, exactly as you left it. Say how
  what you saw inside explains the outside. Every "open" needs a later "close".
- A pulled-out node must be restored before you open or close."""


def _schema() -> dict:
    return Plan.model_json_schema(by_alias=True)


def make_plan(topic: str | None = None, script: str | None = None, model: str = "llama3.1:8b") -> Plan:
    if script:
        task = (
            "Split the following script into scenes. Keep the wording close to the original, "
            "only tightening it to fit the rules. Then design the graph for each scene.\n\nSCRIPT:\n" + script
        )
    else:
        task = f"Write an episode about: {topic}"
    messages = [
        {"role": "system", "content": PERSONA_FILE.read_text(encoding="utf-8") + "\n\n" + RULES.replace("ICON_LIST", ", ".join(ICONS))},
        {"role": "user", "content": task + "\n\nReturn only JSON matching the schema."},
    ]
    resp = requests.post(
        f"{OLLAMA_URL}/api/chat",
        json={
            "model": model,
            "messages": messages,
            "format": _schema(),
            "stream": False,
            "options": {"temperature": 0.6, "num_ctx": 8192},
        },
        timeout=600,
    )
    resp.raise_for_status()
    content = resp.json()["message"]["content"]
    plan = Plan.model_validate(json.loads(content))
    return clean_plan(plan)
