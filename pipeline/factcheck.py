"""Check an episode's facts against Wikipedia before it's voiced.

    python pipeline/factcheck.py episodes/tree/plan.json

Steps:
  1. claims   the local LLM lists the checkable factual claims in the narration,
              each with a short search query
  2. search   Wikipedia search API -> top articles -> plain-text extracts
  3. passages pick the paragraphs that share the most keywords with the claim
              (cheap, no embeddings needed)
  4. judge    the LLM reads only those passages and answers supported /
              contradicted / not_found, quoting the sentence it relied on
  5. verify   the quote must appear word for word in the passage, otherwise the
              verdict is downgraded to not_found (the LLM can't invent evidence)

Writes, next to the plan:
  factcheck.json  machine-readable; publish.py lists the sources of supported claims
                  in the YouTube description, and the outro shows their titles
  factcheck.md    a report for you: what to fix before rendering

The LLM never sees the open web, only text this script fetched, and every
"supported" verdict comes with a quote you can check yourself.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Literal, Optional
from urllib.parse import quote

import requests
from pydantic import BaseModel, Field

sys.path.insert(0, str(Path(__file__).resolve().parent))
from episode_types import Source  # noqa: E402
from plan_schema import Plan  # noqa: E402

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")
WIKI_API = "https://en.wikipedia.org/w/api.php"
# Wikipedia asks every API client to identify itself
USER_AGENT = "VertieFactcheck/0.1 (local explainer-video pipeline; https://github.com/)"
MAX_CLAIMS = 10
ARTICLES_PER_CLAIM = 2
PASSAGES_PER_CLAIM = 4

# --------------------------------------------------------------------------- data


class Claim(BaseModel):
    scene: int = Field(description="1-based scene number the claim comes from")
    claim: str = Field(description="one checkable factual statement, rewritten to stand on its own")
    query: str = Field(description="2-5 word Wikipedia search query to check it")


class ClaimList(BaseModel):
    claims: list[Claim]


class Judgement(BaseModel):
    verdict: Literal["supported", "contradicted", "not_found"]
    passage: int = Field(description="number of the passage the quote comes from, or 0 if none")
    quote: str = Field(description="the exact sentence from that passage, copied word for word, or empty")
    note: str = Field(description="one short sentence: why, or what to change")


Passage = tuple[str, str, str]  # (article title, url, text)
LLM = Callable[[list[dict[str, str]], type[BaseModel]], BaseModel]
Fetch = Callable[[str, dict[str, str]], dict]


# --------------------------------------------------------------------------- plumbing
def ollama(model: str) -> LLM:
    """An LLM call that must return JSON matching a Pydantic model (Ollama structured output)."""

    def call(messages: list[dict[str, str]], schema: type[BaseModel]) -> BaseModel:
        resp = requests.post(
            f"{OLLAMA_URL}/api/chat",
            json={
                "model": model,
                "messages": messages,
                "format": schema.model_json_schema(),
                "stream": False,
                "options": {"temperature": 0.1, "num_ctx": 8192},
            },
            timeout=600,
        )
        resp.raise_for_status()
        return schema.model_validate_json(resp.json()["message"]["content"])

    return call


def wiki_get(url: str, params: dict[str, str]) -> dict:
    resp = requests.get(url, params=params, headers={"User-Agent": USER_AGENT}, timeout=30)
    resp.raise_for_status()
    time.sleep(0.2)  # be polite
    return resp.json()


# --------------------------------------------------------------------------- steps
def extract_claims(plan: Plan, llm: LLM) -> list[Claim]:
    script = "\n".join(f"Scene {i + 1}: {s.narration}" for i, s in enumerate(plan.scenes))
    messages = [
        {
            "role": "system",
            "content": (
                "You list the factual claims in a script so they can be checked. "
                "Only include statements about the world that could be wrong: numbers, causes, "
                "mechanisms, names. Skip greetings, jokes, questions, opinions and the host "
                f"talking about itself. At most {MAX_CLAIMS} claims, most important first. "
                "Rewrite each claim so it makes sense on its own (replace 'it', 'they')."
            ),
        },
        {"role": "user", "content": f"Title: {plan.title}\n\n{script}\n\nReturn only JSON."},
    ]
    out = llm(messages, ClaimList)
    assert isinstance(out, ClaimList)
    return [c for c in out.claims if 1 <= c.scene <= len(plan.scenes)][:MAX_CLAIMS]


def search(query: str, fetch: Fetch) -> list[tuple[str, str, str]]:
    """Top Wikipedia articles for a query as (title, url, plain text)."""
    hits = fetch(WIKI_API, {"action": "query", "list": "search", "srsearch": query, "srlimit": str(ARTICLES_PER_CLAIM), "format": "json", "formatversion": "2"})
    titles = [h["title"] for h in hits.get("query", {}).get("search", [])]
    if not titles:
        return []
    pages = fetch(
        WIKI_API,
        {"action": "query", "prop": "extracts", "explaintext": "1", "redirects": "1", "titles": "|".join(titles), "format": "json", "formatversion": "2"},
    )
    out = []
    for p in pages.get("query", {}).get("pages", []):
        text = p.get("extract") or ""
        if text:
            out.append((p["title"], "https://en.wikipedia.org/wiki/" + quote(p["title"].replace(" ", "_")), text))
    return out


STOP = set(
    "a an the of to in on and or is are was were be been it its this that these those for with as by at from "
    "into than then so but not no do does did can could will would has have had more most less very also "
    "which who what when where why how all any some each".split()
)


def _words(s: str) -> set[str]:
    return {w for w in re.findall(r"[a-z0-9]+", s.lower()) if w not in STOP and len(w) > 2}


def best_passages(claim: str, articles: list[tuple[str, str, str]], k: int = PASSAGES_PER_CLAIM) -> list[Passage]:
    """Paragraphs that share the most keywords with the claim (title words count a little too)."""
    want = _words(claim)
    scored: list[tuple[float, Passage]] = []
    for title, url, text in articles:
        for para in re.split(r"\n\s*\n|\n(?==)", text):
            para = para.strip()
            if len(para) < 80 or para.startswith("="):
                continue
            para = para[:1200]
            have = _words(para)
            score = len(want & have) + 0.3 * len(want & _words(title))
            if score > 0:
                scored.append((score, (title, url, para)))
    scored.sort(key=lambda x: -x[0])
    return [p for _, p in scored[:k]]


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[“”\"'‘’]", "", s)).strip().lower()


def judge(claim: str, passages: list[Passage], llm: LLM) -> tuple[Judgement, Optional[Passage]]:
    if not passages:
        return Judgement(verdict="not_found", passage=0, quote="", note="No Wikipedia text found for this claim."), None
    numbered = "\n\n".join(f"[{i + 1}] ({t})\n{p}" for i, (t, _, p) in enumerate(passages))
    messages = [
        {
            "role": "system",
            "content": (
                "You check one claim against the numbered passages, and nothing else: ignore what "
                "you know. 'supported' = a passage says it (simplifications for a general audience are "
                "fine). 'contradicted' = a passage says something incompatible. 'not_found' = the "
                "passages don't settle it. Copy the deciding sentence word for word."
            ),
        },
        {"role": "user", "content": f"Claim: {claim}\n\nPassages:\n{numbered}\n\nReturn only JSON."},
    ]
    j = llm(messages, Judgement)
    assert isinstance(j, Judgement)
    if j.verdict == "not_found":
        return j, None
    src = passages[j.passage - 1] if 1 <= j.passage <= len(passages) else None
    # the quote must really be in the passage it names (or, leniently, any passage)
    if not j.quote or not src or _norm(j.quote) not in _norm(src[2]):
        src = next((p for p in passages if j.quote and _norm(j.quote) in _norm(p[2])), None)
    if src is None:
        return Judgement(verdict="not_found", passage=0, quote="", note=f"Model said {j.verdict}, but its quote isn't in the sources."), None
    return j, src


# --------------------------------------------------------------------------- run
def check(plan: Plan, llm: LLM, fetch: Fetch = wiki_get, log: Callable[[str], None] = print) -> dict:
    claims = extract_claims(plan, llm)
    log(f"  {len(claims)} claims to check")
    results = []
    for c in claims:
        try:
            articles = search(c.query, fetch)
        except requests.RequestException as e:
            log(f"  ! search failed for {c.query!r}: {e}")
            articles = []
        j, src = judge(c.claim, best_passages(c.claim, articles), llm)
        mark = {"supported": "✓", "contradicted": "✗", "not_found": "?"}[j.verdict]
        log(f"  {mark} scene {c.scene}: {c.claim}")
        results.append(
            {
                "scene": c.scene,
                "claim": c.claim,
                "query": c.query,
                "verdict": j.verdict,
                "quote": j.quote if src else "",
                "note": j.note,
                "sources": [{"title": src[0], "url": src[1]}] if src and j.verdict == "supported" else [],
                "evidence": [{"title": src[0], "url": src[1]}] if src and j.verdict == "contradicted" else [],
            }
        )
    return {"title": plan.title, "checked_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "claims": results}


def report(fc: dict) -> str:
    """factcheck.md: problems first, then what's backed up."""
    order = {"contradicted": 0, "not_found": 1, "supported": 2}
    heads = {"contradicted": "✗ Contradicted: fix these", "not_found": "? Not found: check by hand or soften", "supported": "✓ Supported"}
    lines = [f"# Fact-check: {fc['title']}", "", f"Checked {fc['checked_at']} against Wikipedia.", ""]
    for verdict in sorted(heads, key=order.__getitem__):
        group = [c for c in fc["claims"] if c["verdict"] == verdict]
        if not group:
            continue
        lines += [f"## {heads[verdict]} ({len(group)})", ""]
        for c in group:
            lines.append(f"- **Scene {c['scene']}:** {c['claim']}")
            if c["quote"]:
                src = (c["sources"] or c["evidence"])[0]
                lines.append(f"  > {c['quote']}  ")
                lines.append(f"  > [{src['title']}]({src['url']})")
            if c["note"]:
                lines.append(f"  {c['note']}")
        lines.append("")
    return "\n".join(lines)


def run(plan_path: Path, model: str, out_dir: Optional[Path] = None, llm: Optional[LLM] = None, fetch: Fetch = wiki_get) -> dict:
    """Check a plan file; write factcheck.json + factcheck.md to out_dir (default: next to the plan)."""
    out_dir = out_dir or plan_path.parent
    out_dir.mkdir(parents=True, exist_ok=True)
    plan = Plan.model_validate(json.loads(plan_path.read_text(encoding="utf-8")))
    print(f"Fact-checking {plan_path} with {model}")
    fc = check(plan, llm or ollama(model), fetch)
    (out_dir / "factcheck.json").write_text(json.dumps(fc, indent=2, ensure_ascii=False), encoding="utf-8")
    (out_dir / "factcheck.md").write_text(report(fc), encoding="utf-8")
    bad = sum(1 for c in fc["claims"] if c["verdict"] != "supported")
    print(f"Wrote {out_dir / 'factcheck.md'}" + (f": {bad} claim(s) need a look" if bad else ": all supported"))
    return fc


def sources(fc_path: Path, limit: int = 6) -> list[Source]:
    """Unique sources of supported claims, for the description and the outro."""
    if not fc_path.exists():
        return []
    seen: dict[str, Source] = {}
    for c in json.loads(fc_path.read_text(encoding="utf-8")).get("claims", []):
        if c.get("verdict", "supported") == "supported":
            for s in c.get("sources", []):
                seen.setdefault(s["url"], {"title": s["title"], "url": s["url"]})
    return list(seen.values())[:limit]


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("plan", type=Path, help="episodes/<id>/plan.json")
    ap.add_argument("--model", default=os.environ.get("OLLAMA_MODEL", "llama3.1:8b"))
    a = ap.parse_args()
    run(a.plan, a.model)
