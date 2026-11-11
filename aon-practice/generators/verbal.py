"""Verbal reasoning (True / False / Cannot say), drawn from data/verbal_bank.json.

The real test: read a short business passage, then judge each statement using
ONLY the passage. "True" = the passage says or directly implies it. "False" =
the passage contradicts it. "Cannot say" = the passage doesn't give enough
information, even if it sounds plausible or you know it from elsewhere.
"""
from __future__ import annotations

import json
import random
from pathlib import Path

from .common import Question

SECTION = "verbal"
BANK_PATH = Path(__file__).resolve().parents[1] / "data" / "verbal_bank.json"
LABELS = ["True", "False", "Cannot say"]

RULE = {
    "True": "**True**: the passage states this, or it follows directly from what is stated.",
    "False": "**False**: the passage contradicts this.",
    "Cannot say": "**Cannot say**: the passage doesn't give enough information either way. Don't fill gaps with "
                  "assumptions or outside knowledge.",
}


def mistake_tag(answer: str, chosen: str) -> str:
    if chosen == answer:
        return "correct"
    if answer == "Cannot say":
        return "assumed_info"
    if chosen == "Cannot say":
        return "too_cautious"
    return "misread"


MISTAKE_NOTE = {
    "assumed_info": "You went beyond the text: the passage doesn't actually settle this.",
    "too_cautious": "Too cautious: the passage does give enough information to decide.",
    "misread": "Misread: the passage says the opposite.",
}


def load_bank(path: Path | str = BANK_PATH) -> list[dict]:
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    passages = data["passages"] if isinstance(data, dict) else data
    for p in passages:
        for s in p["statements"]:
            if s["answer"] not in LABELS:
                raise ValueError(f"{p['id']}: answer must be one of {LABELS}, got {s['answer']!r}")
    return passages


def generate_test(seed: int, n_passages: int = 12, path: Path | str = BANK_PATH) -> tuple[dict, list[Question]]:
    """Pick n random passages and return ({id: passage}, questions in passage order)."""
    rng = random.Random(seed)
    bank = load_bank(path)
    chosen = rng.sample(bank, min(n_passages, len(bank)))
    questions = []
    for p in chosen:
        for s in p["statements"]:
            tags = [mistake_tag(s["answer"], lab) for lab in LABELS]
            questions.append(Question(
                section=SECTION,
                qtype=f"{s['answer']} statements",
                prompt=s["text"],
                options=list(LABELS),
                correct_index=LABELS.index(s["answer"]),
                explanation=[s["why"], RULE[s["answer"]]],
                option_tags=tags,
                option_notes=["Correct." if t == "correct" else MISTAKE_NOTE[t] for t in tags],
                payload={"passage_id": p["id"]},
            ))
    return {p["id"]: p for p in chosen}, questions
