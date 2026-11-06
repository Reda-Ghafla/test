"""Shared building blocks for all generated questions."""
from __future__ import annotations

import math
import random
from dataclasses import dataclass, field
from typing import Callable


@dataclass
class Question:
    """One multiple-choice item, ready to render.

    - ``options`` are display strings; exactly one (``correct_index``) is right.
    - ``option_tags`` is a short machine label per option ("correct", "wrong_base", ...),
      used to report which *mistake* a wrong answer corresponds to.
    - ``option_notes`` is the human explanation of that mistake.
    - ``explanation`` is the step-by-step worked solution.
    - ``calc`` is a small expression tree describing the intended formula, so the
      tests can recompute the answer independently from the raw data.
    """

    section: str
    qtype: str
    prompt: str
    options: list[str]
    correct_index: int
    explanation: list[str]
    option_tags: list[str]
    option_notes: list[str]
    payload: dict = field(default_factory=dict)
    calc: list | None = None

    @property
    def correct_option(self) -> str:
        return self.options[self.correct_index]


@dataclass
class Distractor:
    value: float | None
    tag: str
    note: str


NEAR_MISS_NOTE = "Near miss: a plausible-looking value close to the answer, not tied to one specific mistake."


def build_options(
    rng: random.Random,
    correct: float,
    distractors: list[Distractor],
    fmt: Callable[[float], str],
    n_options: int = 5,
) -> tuple[list[str], int, list[str], list[str]]:
    """Return (options, correct_index, tags, notes), sorted by numeric value.

    Distractors whose *displayed* value collides with the answer or with each other
    are dropped, then the list is topped up with near-miss values, so every option
    string is unique and exactly one equals ``fmt(correct)``.
    """
    correct_str = fmt(correct)
    chosen: list[tuple[float, str, str, str]] = [(correct, correct_str, "correct", "Correct.")]
    seen = {correct_str}

    pool = list(distractors)
    rng.shuffle(pool)
    for d in pool:
        if len(chosen) == n_options:
            break
        if d.value is None or not math.isfinite(d.value):
            continue
        s = fmt(d.value)
        if s in seen:
            continue
        seen.add(s)
        chosen.append((d.value, s, d.tag, d.note))

    deltas = [0.04, -0.04, 0.08, -0.08, 0.12, -0.12, 0.17, -0.17, 0.25, -0.25, 0.33, -0.33, 0.5, -0.5]
    rng.shuffle(deltas)
    for k in range(200):
        if len(chosen) == n_options:
            break
        delta = deltas[k % len(deltas)] * (1 + k // len(deltas))
        v = correct * (1 + delta) if abs(correct) > 1e-9 else delta * 10
        s = fmt(v)
        if s in seen:
            continue
        seen.add(s)
        chosen.append((v, s, "near_miss", NEAR_MISS_NOTE))

    if len(chosen) != n_options:  # pragma: no cover - defensive
        raise RuntimeError("could not build enough distinct options")

    chosen.sort(key=lambda t: t[0])
    options = [c[1] for c in chosen]
    tags = [c[2] for c in chosen]
    notes = [c[3] for c in chosen]
    return options, tags.index("correct"), tags, notes


# ---------------------------------------------------------------- formatting

def fmt_pct(dp: int = 1, signed: bool = False) -> Callable[[float], str]:
    def f(v: float) -> str:
        v = round(v, dp) + 0.0  # avoid "-0.0"
        return f"{v:+.{dp}f}%" if signed else f"{v:.{dp}f}%"

    return f


def fmt_money(symbol: str, dp: int = 1, suffix: str = "k") -> Callable[[float], str]:
    def f(v: float) -> str:
        v = round(v, dp) + 0.0
        sign = "-" if v < 0 else ""
        return f"{sign}{symbol}{abs(v):,.{dp}f}{suffix}"

    return f


def fmt_num(dp: int = 2) -> Callable[[float], str]:
    def f(v: float) -> str:
        return f"{round(v, dp) + 0.0:,.{dp}f}"

    return f
