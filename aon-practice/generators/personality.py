"""Personality questionnaire practice: unscored, for familiarity only.

Aon's graduate personality measure (ADEPT-15) is usually forced-choice: you see
two statements and say which is more like you, and by how much. Some employers
use plain Likert scales instead. Both formats are offered here.
"""
from __future__ import annotations

import random

LIKERT = ["Strongly disagree", "Disagree", "Neutral", "Agree", "Strongly agree"]

# (statement, work-style dimension, reverse-keyed?)
ITEMS = [
    ("I set myself demanding goals at work.", "Drive", False),
    ("I keep going on a task even when progress is slow.", "Drive", False),
    ("I am happy to do the minimum a task requires.", "Drive", True),
    ("I plan my work in detail before I start.", "Structure", False),
    ("I like having clear procedures to follow.", "Structure", False),
    ("I often leave things until the last minute.", "Structure", True),
    ("I enjoy meeting new people at work events.", "Sociability", False),
    ("I find it easy to start conversations with strangers.", "Sociability", False),
    ("I prefer working alone to working with others.", "Sociability", True),
    ("I stay calm when deadlines are tight.", "Composure", False),
    ("Criticism of my work doesn't upset me for long.", "Composure", False),
    ("I worry a lot about making mistakes.", "Composure", True),
    ("I enjoy finding new ways to solve old problems.", "Innovation", False),
    ("I am curious about how things work.", "Innovation", False),
    ("I prefer tried-and-tested methods to new ideas.", "Innovation", True),
    ("I take the lead when a group lacks direction.", "Leadership", False),
    ("I am comfortable persuading others to my point of view.", "Leadership", False),
    ("I would rather someone else made the final decision.", "Leadership", True),
    ("I adapt quickly when plans change.", "Flexibility", False),
    ("I am comfortable working on several tasks at once.", "Flexibility", False),
    ("I find unexpected changes to my routine frustrating.", "Flexibility", True),
    ("I check my work carefully for errors.", "Precision", False),
    ("Small details matter to me.", "Precision", False),
    ("I focus on the big picture and leave the details to others.", "Precision", True),
    ("I make sure everyone in a team feels heard.", "Cooperation", False),
    ("I am willing to compromise to reach agreement.", "Cooperation", False),
    ("I tend to stick to my view even when others disagree.", "Cooperation", True),
    ("I like to understand the reasons behind decisions.", "Analysis", False),
    ("I base my decisions on evidence rather than gut feeling.", "Analysis", False),
    ("I often trust my instincts over the numbers.", "Analysis", True),
]

TIPS = [
    "There are no right answers. Employers compare your profile with the role, so answer as you really are at work.",
    "Be consistent. Questionnaires include similar statements worded in opposite directions to check this.",
    "Think about how you behave at work or study, not how you'd like to be.",
    "Don't overthink it. A first, honest reaction is usually the most consistent.",
    "Avoid answering 'Neutral' to everything. It gives the employer very little information about you.",
]


def likert_block(seed: int, n: int = 20) -> list[tuple[str, str, bool]]:
    rng = random.Random(seed)
    return rng.sample(ITEMS, min(n, len(ITEMS)))


def paired_block(seed: int, n: int = 10) -> list[tuple[tuple, tuple]]:
    """Pairs of positively worded statements from different dimensions (forced-choice style)."""
    rng = random.Random(seed)
    positive = [it for it in ITEMS if not it[2]]
    pairs, used = [], set()
    rng.shuffle(positive)
    for a in positive:
        if len(pairs) == n:
            break
        if a in used:
            continue
        for b in positive:
            if b not in used and b != a and b[1] != a[1]:
                pairs.append((a, b))
                used |= {a, b}
                break
    return pairs


def consistency_flags(answers: dict[str, int]) -> list[tuple[str, str]]:
    """Return (statement, reverse statement) pairs from the same dimension where the answers contradict.

    answers maps statement text to a Likert index 0-4.
    """
    by_dim: dict[str, list[tuple[str, bool]]] = {}
    for text, dim, rev in ITEMS:
        if text in answers:
            by_dim.setdefault(dim, []).append((text, rev))
    flags = []
    for dim, items in by_dim.items():
        pos = [t for t, r in items if not r]
        neg = [t for t, r in items if r]
        for p in pos:
            for n in neg:
                if answers[p] >= 3 and answers[n] >= 3:
                    flags.append((p, n))
    return flags
