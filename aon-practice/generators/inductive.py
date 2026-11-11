"""Inductive reasoning generator (Aon / cut-e "scales ix" style).

Each figure is a small panel with five attributes:

    rotation  direction the shape points (8 directions, 45° apart)
    position  which corner holds the small black square (4 corners)
    count     number of dots under the shape (1-4)
    colour    fill colour of the shape (4 colours)
    size      size of the shape (small / medium / large)

Two formats:

- **Odd one out** (like scales ix): a row of 9 figures follows hidden rules.
  Exactly one figure breaks one rule. You pick that figure.
- **Matrix**: a 3x3 grid where each attribute follows a row/column rule and one
  cell is missing. You pick the option that completes it.

Puzzles have 1 or 2 rules. Attributes that are not rules either stay constant
or, in some 1-rule puzzles, change at random as a distraction. Before a puzzle
is returned, a brute-force search over every candidate rule confirms there is
exactly one defensible answer.
"""
from __future__ import annotations

import random
from itertools import permutations, product

from .common import Question

SECTION = "inductive"

ATTRS = ("rotation", "position", "count", "colour", "size")
MOD = {"rotation": 8, "position": 4, "count": 4, "colour": 4, "size": 3}
ATTR_LABEL = {"rotation": "Direction", "position": "Corner square", "count": "Dots",
              "colour": "Colour", "size": "Size"}

COLOURS = [("#2E5A88", "blue"), ("#F2A541", "yellow"), ("#4C9A6A", "green"), ("#C0392B", "red")]
SIZES = [0.55, 0.78, 1.0]
SIZE_NAMES = ["small", "medium", "large"]
DIRS = ["up", "up-right", "right", "down-right", "down", "down-left", "left", "up-left"]
CORNERS = ["top-left", "top-right", "bottom-right", "bottom-left"]
SHAPES = {
    "arrow": [(0, 1), (0.62, 0.2), (0.24, 0.2), (0.24, -0.9), (-0.24, -0.9), (-0.24, 0.2), (-0.62, 0.2)],
    "triangle": [(0, 1), (0.62, -0.8), (-0.62, -0.8)],
    "kite": [(0, 1), (0.5, 0.25), (0, -0.8), (-0.5, 0.25)],
}

N_SEQ = 9


def name(attr: str, v: int) -> str:
    if attr == "rotation":
        return f"pointing {DIRS[v]}"
    if attr == "position":
        return f"square {CORNERS[v]}"
    if attr == "count":
        return f"{v + 1} dot{'s' if v else ''}"
    if attr == "colour":
        return COLOURS[v][1]
    return SIZE_NAMES[v]


def describe_figure(f: dict, shape: str) -> str:
    return (f"{SIZE_NAMES[f['size']]} {COLOURS[f['colour']][1]} {shape} pointing {DIRS[f['rotation']]}, "
            f"{f['count'] + 1} dot{'s' if f['count'] else ''}, square in the {CORNERS[f['position']]} corner")


# ===================================================================== rules


def _signed(s: int, m: int) -> int:
    return s if s <= m // 2 else s - m


def _step_text(attr: str, s: int) -> str:
    """Describe adding s (mod m) to an attribute, in words."""
    m = MOD[attr]
    s = _signed(s % m, m)
    if s == 0:
        return "stays the same"
    cw = "clockwise" if s > 0 else "anticlockwise"
    if attr == "rotation":
        return "turns 180°" if abs(s) == 4 else f"turns {abs(s) * 45}° {cw}"
    if attr == "position":
        return "jumps to the opposite corner" if abs(s) == 2 else f"moves one corner {cw}"
    if attr == "count":
        return f"{'gains' if s > 0 else 'loses'} {abs(s)} dot{'s' if abs(s) > 1 else ''} (cycling 1→4)"
    if attr == "size":
        return "gets one size bigger (cycling small→medium→large)" if s > 0 else \
            "gets one size smaller (cycling large→medium→small)"
    return f"moves {abs(s)} step{'s' if abs(s) > 1 else ''} along the colour cycle"


def seq_value(h: tuple, i: int, m: int) -> int:
    if h[0] == "arith":
        _, a, s = h
        return (a + s * i) % m
    pat = h[1]
    return pat[i % len(pat)]


def describe_seq(attr: str, h: tuple) -> str:
    m = MOD[attr]
    if h[0] == "arith":
        _, a, s = h
        if attr == "colour":
            order = [name(attr, (a + s * i) % m) for i in range(4)]
            return f"the colour cycles {' → '.join(order)} → …"
        return f"each step, the {ATTR_LABEL[attr].lower()} {_step_text(attr, s)}"
    pat = h[1]
    return f"a pattern of {len(pat)} repeats: {', '.join(name(attr, v) for v in pat)}, then again from the start"


def seq_hypotheses(m: int, n: int = N_SEQ):
    """Every rule a candidate could reasonably see in a sequence of n values mod m."""
    for a in range(m):
        for s in range(m):
            yield ("arith", a, s), tuple((a + s * i) % m for i in range(n))
    for p in (2, 3):
        for pat in product(range(m), repeat=p):
            if len(set(pat)) > 1:
                yield ("period", pat), tuple(pat[i % p] for i in range(n))


def analyse_seq(values: list[int], m: int):
    """Return (perfect hypothesis or None, {index: hypothesis that fits all but that index}, min mismatches)."""
    perfect, single, best = None, {}, len(values)
    for h, seq in seq_hypotheses(m, len(values)):
        mism = [i for i, (x, y) in enumerate(zip(seq, values)) if x != y]
        best = min(best, len(mism))
        if not mism and perfect is None:
            perfect = h
        elif len(mism) == 1:
            single.setdefault(mism[0], h)
    return perfect, single, best


def _rule_seq(rng: random.Random, attr: str) -> tuple:
    m = MOD[attr]
    if attr == "rotation":
        return ("arith", rng.randrange(m), rng.choice([1, 2, -1, -2, 3]) % m)
    if attr == "position":
        return ("arith", rng.randrange(m), rng.choice([1, -1, 2]) % m)
    if attr == "count":
        if rng.random() < 0.5:
            return ("arith", rng.randrange(m), rng.choice([1, -1]) % m)
        return ("period", tuple(rng.sample(range(m), rng.choice([2, 3]))))
    if attr == "colour":
        if rng.random() < 0.3:
            return ("arith", rng.randrange(m), 1)
        return ("period", tuple(rng.sample(range(m), rng.choice([2, 3]))))
    # size
    if rng.random() < 0.5:
        return ("arith", rng.randrange(m), rng.choice([1, -1]) % m)
    return ("period", tuple(rng.sample(range(m), 2)))


# ---------------------------------------------------------------- odd one out


def gen_odd(rng: random.Random, n_rules: int) -> Question:
    for _ in range(1000):
        shape = rng.choice(list(SHAPES))
        rule_attrs = rng.sample(ATTRS, n_rules)
        others = [a for a in ATTRS if a not in rule_attrs]
        noise = rng.choice(others) if n_rules == 1 and rng.random() < 0.5 else None
        values: dict[str, list[int]] = {}
        rules: dict[str, tuple] = {}
        for a in ATTRS:
            m = MOD[a]
            if a in rule_attrs:
                rules[a] = _rule_seq(rng, a)
                values[a] = [seq_value(rules[a], i, m) for i in range(N_SEQ)]
            elif a == noise:
                values[a] = [rng.randrange(m) for _ in range(N_SEQ)]
            else:
                c = rng.randrange(m)
                rules[a] = ("arith", c, 0)
                values[a] = [c] * N_SEQ
        odd = rng.randrange(N_SEQ)
        broken = rng.choice(rule_attrs)
        expected = values[broken][odd]
        values[broken][odd] = rng.choice([v for v in range(MOD[broken]) if v != expected])

        ok = True
        for a in ATTRS:
            perfect, single, best = analyse_seq(values[a], MOD[a])
            if a == noise:
                ok = best >= 3  # clearly random, not "a rule with one exception"
            elif a == broken:
                ok = perfect is None and set(single) == {odd}
            else:
                ok = perfect is not None
            if not ok:
                break
        if ok:
            break
    else:  # pragma: no cover - defensive
        raise RuntimeError("could not generate an unambiguous odd-one-out puzzle")

    items = [{a: values[a][i] for a in ATTRS} for i in range(N_SEQ)]
    constant = [ATTR_LABEL[a].lower() for a in ATTRS if a not in rule_attrs and a != noise]
    steps = [f"**{ATTR_LABEL[a]}**: {describe_seq(a, rules[a])}." for a in rule_attrs]
    if noise:
        steps.append(f"**{ATTR_LABEL[noise]}** changes at random. It's a distraction, not a rule.")
    if constant:
        steps.append(f"Everything else ({', '.join(constant)}) is the same in every figure.")
    steps.append(f"Figure **{odd + 1}** breaks the {ATTR_LABEL[broken].lower()} rule: it is "
                 f"*{name(broken, values[broken][odd])}*, but the rule needs *{name(broken, expected)}*.")
    tags = ["correct" if i == odd else f"missed_{broken}" for i in range(N_SEQ)]
    notes = ["Correct." if i == odd else
             f"Figure {i + 1} follows every rule. The odd one breaks the {ATTR_LABEL[broken].lower()} rule."
             for i in range(N_SEQ)]
    return Question(
        section=SECTION,
        qtype=f"Odd one out · {n_rules} rule{'s' if n_rules > 1 else ''}",
        prompt="Which figure breaks the rule that all the others follow?",
        options=[str(i + 1) for i in range(N_SEQ)],
        correct_index=odd,
        explanation=steps,
        option_tags=tags,
        option_notes=notes,
        payload={"format": "odd", "shape": shape, "items": items, "rule_attrs": rule_attrs,
                 "noise": noise, "broken": broken},
    )


# --------------------------------------------------------------------- matrix


def grid_value(h: tuple, r: int, c: int, m: int) -> int:
    if h[0] == "arith":
        _, a, x, y = h
        return (a + x * r + y * c) % m
    _, vals, x, y = h
    return vals[(x * r + y * c) % 3]


def grid_hypotheses(m: int):
    for a, x, y in product(range(m), repeat=3):
        yield ("arith", a, x, y)
    for vals in permutations(range(m), 3):
        for x, y in product(range(3), repeat=2):
            yield ("latin", vals, x, y)


def grid_predictions(known: dict[tuple[int, int], int], missing: tuple[int, int], m: int) -> set[int]:
    preds = set()
    for h in grid_hypotheses(m):
        if all(grid_value(h, r, c, m) == v for (r, c), v in known.items()):
            preds.add(grid_value(h, *missing, m))
    return preds


def _rule_grid(rng: random.Random, attr: str) -> tuple:
    m = MOD[attr]
    if attr in ("rotation", "position"):
        steps = [1, 2, -1, -2] if attr == "rotation" else [1, -1]
        form = rng.choice(["row", "col", "both"])
        x = rng.choice(steps) % m if form in ("col", "both") else 0  # change going down a column
        y = rng.choice(steps) % m if form in ("row", "both") else 0  # change going along a row
        return ("arith", rng.randrange(m), x, y)
    vals = tuple(rng.sample(range(m), 3))
    x, y = rng.choice([(1, 1), (1, 2), (0, 1), (1, 0)])
    return ("latin", vals, x, y)


def describe_grid(attr: str, h: tuple) -> str:
    lab = ATTR_LABEL[attr].lower()
    if h[0] == "arith":
        _, a, x, y = h
        parts = []
        if y:
            parts.append(f"along each row (left → right) the {lab} {_step_text(attr, y)}")
        if x:
            parts.append(f"down each column (top → bottom) it {_step_text(attr, x)}")
        return "; ".join(parts)
    _, vals, x, y = h
    names = [name(attr, v) for v in vals]
    if (x, y) == (0, 1):
        return f"every row goes {', '.join(names)} from left to right"
    if (x, y) == (1, 0):
        return f"the top row is all {names[0]}, the middle row {names[1]}, the bottom row {names[2]}"
    return f"each row and each column contains {', '.join(names)} exactly once"


def gen_matrix(rng: random.Random, n_rules: int) -> Question:
    for _ in range(500):
        shape = rng.choice(list(SHAPES))
        rule_attrs = rng.sample(ATTRS, n_rules)
        rules = {}
        for a in ATTRS:
            rules[a] = _rule_grid(rng, a) if a in rule_attrs else ("arith", rng.randrange(MOD[a]), 0, 0)
        missing = (2, 2) if rng.random() < 0.7 else (rng.randrange(3), rng.randrange(3))
        grid = {(r, c): {a: grid_value(rules[a], r, c, MOD[a]) for a in ATTRS} for r in range(3) for c in range(3)}
        known_cells = [rc for rc in grid if rc != missing]
        if all(grid_predictions({rc: grid[rc][a] for rc in known_cells}, missing, MOD[a]) == {grid[missing][a]}
               for a in ATTRS):
            break
    else:  # pragma: no cover
        raise RuntimeError("could not generate an unambiguous matrix puzzle")

    answer = dict(grid[missing])
    # Distractors: change exactly one attribute. Prefer "plausible" values taken from neighbouring cells.
    plausible = []
    for a in rule_attrs:
        for rc in known_cells:
            if rc[0] == missing[0] or rc[1] == missing[1]:
                v = grid[rc][a]
                if v != answer[a]:
                    plausible.append((a, v))
    rng.shuffle(plausible)
    anything = [(a, v) for a in ATTRS for v in range(MOD[a]) if v != answer[a]]
    rng.shuffle(anything)
    choices, tags, used, per_attr = [], [], {tuple(answer.values())}, {}
    for a, v in plausible + anything:
        if len(choices) == 4:
            break
        if per_attr.get(a, 0) >= 2:
            continue
        cand = dict(answer, **{a: v})
        key = tuple(cand.values())
        if key in used:
            continue
        used.add(key)
        per_attr[a] = per_attr.get(a, 0) + 1
        choices.append(cand)
        tags.append(a)
    order = list(range(5))
    rng.shuffle(order)
    all_choices = [answer] + choices
    all_tags = ["correct"] + [f"missed_{a}" for a in tags]
    options_fig = [all_choices[i] for i in order]
    option_tags = [all_tags[i] for i in order]
    correct_index = option_tags.index("correct")
    letters = "ABCDE"
    notes = []
    for f, t in zip(options_fig, option_tags):
        if t == "correct":
            notes.append("Correct.")
        else:
            a = t.removeprefix("missed_")
            notes.append(f"Wrong {ATTR_LABEL[a].lower()}: {name(a, f[a])} instead of {name(a, answer[a])}.")

    constant = [ATTR_LABEL[a].lower() for a in ATTRS if a not in rule_attrs]
    steps = [f"**{ATTR_LABEL[a]}**: {describe_grid(a, rules[a])}." for a in rule_attrs]
    if constant:
        steps.append(f"Everything else ({', '.join(constant)}) is the same in every cell.")
    steps.append(f"So the missing cell (row {missing[0] + 1}, column {missing[1] + 1}) is a "
                 f"{describe_figure(answer, shape)}: option **{letters[correct_index]}**.")
    return Question(
        section=SECTION,
        qtype=f"Matrix · {n_rules} rule{'s' if n_rules > 1 else ''}",
        prompt="Which option completes the grid?",
        options=list(letters),
        correct_index=correct_index,
        explanation=steps,
        option_tags=option_tags,
        option_notes=notes,
        payload={"format": "matrix", "shape": shape,
                 "grid": [[None if (r, c) == missing else grid[(r, c)] for c in range(3)] for r in range(3)],
                 "missing": list(missing), "choices": options_fig, "rule_attrs": rule_attrs},
    )


# ------------------------------------------------------------------ public API

GENERATORS = {
    "odd1": lambda rng: gen_odd(rng, 1),
    "odd2": lambda rng: gen_odd(rng, 2),
    "matrix1": lambda rng: gen_matrix(rng, 1),
    "matrix2": lambda rng: gen_matrix(rng, 2),
}


def generate_test(seed: int, n_questions: int = 16, matrix_share: float = 0.25) -> list[Question]:
    """Mostly odd-one-out rows (the scales ix format), plus some matrices. Difficulty rises through the test."""
    rng = random.Random(seed)
    n_matrix = round(n_questions * matrix_share)
    kinds = ["matrix"] * n_matrix + ["odd"] * (n_questions - n_matrix)
    rng.shuffle(kinds)
    qs = []
    for i, k in enumerate(kinds):
        two_rule_chance = 0.25 + 0.5 * i / max(1, n_questions - 1)  # 25% early → 75% late
        n_rules = 2 if rng.random() < two_rule_chance else 1
        qs.append(GENERATORS[f"{k}{n_rules}"](rng))
    return qs


def generate_single(seed: int, kind: str) -> Question:
    return GENERATORS[kind](random.Random(seed))


# ------------------------------------------------------------------ rendering


def _draw_panel(ax, f: dict | None, shape: str, label: str | None = None):
    from matplotlib.patches import Circle, Polygon, Rectangle
    import math

    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.set_aspect("equal")
    ax.set_xticks([])
    ax.set_yticks([])
    for s in ax.spines.values():
        s.set_color("#999999")
    if label:
        ax.set_xlabel(label, fontsize=12, fontweight="bold", labelpad=4)
    if f is None:
        ax.text(0.5, 0.5, "?", fontsize=30, ha="center", va="center", color="#999999", fontweight="bold")
        return
    r = 0.27 * SIZES[f["size"]]
    ang = -math.radians(f["rotation"] * 45)  # clockwise
    ca, sa = math.cos(ang), math.sin(ang)
    pts = [(0.5 + r * (x * ca - y * sa), 0.56 + r * (x * sa + y * ca)) for x, y in SHAPES[shape]]
    ax.add_patch(Polygon(pts, closed=True, fc=COLOURS[f["colour"]][0], ec="#222222", lw=1.2))
    cx, cy = [(0.1, 0.9), (0.9, 0.9), (0.9, 0.1), (0.1, 0.1)][f["position"]]
    ax.add_patch(Rectangle((cx - 0.055, cy - 0.055), 0.11, 0.11, fc="#111111"))
    n = f["count"] + 1
    for k in range(n):
        ax.add_patch(Circle((0.5 + (k - (n - 1) / 2) * 0.1, 0.12), 0.032, fc="#111111"))


def render(q: Question) -> dict:
    """Return {'main': fig, 'options': fig or None}."""
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    p = q.payload
    if p["format"] == "odd":
        fig, axes = plt.subplots(1, N_SEQ, figsize=(13.5, 1.9), dpi=110)
        for i, (ax, f) in enumerate(zip(axes, p["items"])):
            _draw_panel(ax, f, p["shape"], str(i + 1))
        fig.subplots_adjust(left=0.01, right=0.99, top=0.97, bottom=0.18, wspace=0.12)
        return {"main": fig, "options": None}
    fig, axes = plt.subplots(3, 3, figsize=(4.2, 4.2), dpi=110)
    for r in range(3):
        for c in range(3):
            _draw_panel(axes[r][c], p["grid"][r][c], p["shape"])
    fig.subplots_adjust(left=0.02, right=0.98, top=0.98, bottom=0.02, wspace=0.06, hspace=0.06)
    ofig, oaxes = plt.subplots(1, 5, figsize=(7.5, 1.9), dpi=110)
    for ax, f, letter in zip(oaxes, p["choices"], q.options):
        _draw_panel(ax, f, p["shape"], letter)
    ofig.subplots_adjust(left=0.01, right=0.99, top=0.97, bottom=0.18, wspace=0.12)
    return {"main": fig, "options": ofig}
