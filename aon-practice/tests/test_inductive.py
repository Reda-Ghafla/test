"""Inductive puzzles must have exactly one defensible answer.

The checks below re-derive the answer by brute force over every candidate rule,
using this file's own rule enumeration, not the generator's.
"""
from itertools import permutations, product

import pytest

from generators import inductive as ind
from generators.inductive import ATTRS, MOD

SEEDS = range(150)


def seq_fits(values, m):
    """Yield the mismatch index lists for every candidate sequence rule."""
    n = len(values)
    candidates = []
    for a, s in product(range(m), repeat=2):  # arithmetic progressions, incl. constant
        candidates.append([(a + s * i) % m for i in range(n)])
    for p in (2, 3):  # repeating patterns
        for pat in product(range(m), repeat=p):
            candidates.append([pat[i % p] for i in range(n)])
    for cand in candidates:
        yield [i for i in range(n) if cand[i] != values[i]]


def check_odd(q):
    items = q.payload["items"]
    assert len(items) == len(q.options) == 9
    candidates = set(range(9))
    for a in ATTRS:
        values = [f[a] for f in items]
        fits = list(seq_fits(values, MOD[a]))
        best = min(len(f) for f in fits)
        if best == 0:
            continue  # explained perfectly: any figure could be the odd one as far as this attribute goes
        if best == 1:
            candidates &= {f[0] for f in fits if len(f) == 1}
        else:
            # Unexplained attributes must be clearly random, not "a rule with two exceptions".
            assert best >= 3, f"{a} is almost a rule: {values}"
    assert candidates == {q.correct_index}, f"answer not unique: {candidates} vs {q.correct_index}"


def grid_rules(m):
    for a, x, y in product(range(m), repeat=3):
        yield lambda r, c, a=a, x=x, y=y: (a + x * r + y * c) % m
    for vals in permutations(range(m), 3):
        for x, y in product(range(3), repeat=2):
            yield lambda r, c, vals=vals, x=x, y=y: vals[(x * r + y * c) % 3]


def check_matrix(q):
    grid, choices = q.payload["grid"], q.payload["choices"]
    missing = tuple(q.payload["missing"])
    assert grid[missing[0]][missing[1]] is None
    assert len(choices) == len(q.options) == 5
    assert len({tuple(sorted(c.items())) for c in choices}) == 5, "duplicate options"
    predicted = {}
    for a in ATTRS:
        preds = set()
        for rule in grid_rules(MOD[a]):
            if all(rule(r, c) == grid[r][c][a] for r in range(3) for c in range(3) if (r, c) != missing):
                preds.add(rule(*missing))
        assert len(preds) == 1, f"{a}: several rules fit with different answers {preds}"
        predicted[a] = preds.pop()
    matching = [i for i, ch in enumerate(choices) if all(ch[a] == predicted[a] for a in ATTRS)]
    assert matching == [q.correct_index]


@pytest.mark.parametrize("kind", ["odd1", "odd2"])
def test_odd_one_out_has_unique_answer(kind):
    for seed in SEEDS:
        q = ind.generate_single(seed, kind)
        check_odd(q)
        assert q.option_tags.count("correct") == 1 and q.option_tags[q.correct_index] == "correct"


@pytest.mark.parametrize("kind", ["matrix1", "matrix2"])
def test_matrix_has_unique_answer(kind):
    for seed in range(60):
        check_matrix(ind.generate_single(seed, kind))


def test_rule_counts_match_labels():
    for seed in range(40):
        for kind, n in [("odd1", 1), ("odd2", 2), ("matrix1", 1), ("matrix2", 2)]:
            q = ind.generate_single(seed, kind)
            assert len(q.payload["rule_attrs"]) == n
            assert q.qtype.endswith(f"{n} rule" + ("s" if n > 1 else ""))


def test_full_test_mix_and_determinism():
    a = ind.generate_test(5, n_questions=16)
    b = ind.generate_test(5, n_questions=16)
    assert len(a) == 16
    assert [q.correct_index for q in a] == [q.correct_index for q in b]
    assert {q.payload["format"] for q in a} == {"odd", "matrix"}
    for q in a:
        assert q.explanation


def test_rendering_smoke():
    import matplotlib.pyplot as plt
    for kind in ind.GENERATORS:
        figs = ind.render(ind.generate_single(1, kind))
        assert figs["main"] is not None
        for f in figs.values():
            if f is not None:
                plt.close(f)
