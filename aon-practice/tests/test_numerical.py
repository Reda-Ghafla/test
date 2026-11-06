"""Checks every generated numerical question has exactly one correct option and
that the answer is mathematically right.

The answer is recomputed here from the raw tab data, using this file's own
evaluator for the question's formula tree. It doesn't reuse the generator's
arithmetic, so a bug in either side shows up as a mismatch.
"""
import re

import pytest

from generators.numerical import CASE_TYPES, generate_single, generate_test

SEEDS = range(300)


def evaluate(expr, case):
    op, *args = expr
    if op == "const":
        return float(args[0])
    if op == "cell":
        tab, row, col = args
        t = case.tab(tab)
        return float(t.values[t.rows.index(row)][t.cols.index(col)])
    if op == "row_sum":
        tab, row = args
        t = case.tab(tab)
        return float(sum(t.values[t.rows.index(row)]))
    if op == "row_mean":
        tab, row = args
        t = case.tab(tab)
        vals = t.values[t.rows.index(row)]
        return sum(vals) / len(vals)
    if op == "col_sum":
        tab, col = args
        t = case.tab(tab)
        j = t.cols.index(col)
        return float(sum(r[j] for r in t.values))
    a, b = (evaluate(x, case) for x in args)
    if op == "add":
        return a + b
    if op == "sub":
        return a - b
    if op == "mul":
        return a * b
    if op == "div":
        return a / b
    if op == "pct":
        return a / b * 100
    if op == "pct_change":
        return (b - a) / a * 100
    raise ValueError(f"unknown op {op}")


NUM_RE = re.compile(r"[-+]?\d[\d,]*(?:\.\d+)?")


def parse(option: str) -> tuple[float, int]:
    """Return (numeric value, decimals shown) from strings like '£1,234.5k', '+3.2%', 'C$12.00m'."""
    m = NUM_RE.search(option.replace("C$", "").replace("A$", ""))
    assert m, f"no number in option {option!r}"
    text = m.group(0).replace(",", "")
    neg = option.lstrip().startswith("-")
    value = float(text) * (-1 if neg and not text.startswith("-") else 1)
    decimals = len(text.split(".")[1]) if "." in text else 0
    return value, decimals


def check_question(case, q):
    assert len(q.options) == 5
    assert len(set(q.options)) == 5, f"duplicate options: {q.options}"
    assert len(q.option_tags) == len(q.option_notes) == 5
    assert q.option_tags.count("correct") == 1
    assert q.option_tags[q.correct_index] == "correct"

    expected = evaluate(q.calc, case)
    parsed = [parse(o) for o in q.options]
    # Exactly one option matches the independently computed answer at the precision shown.
    matches = [i for i, (v, dp) in enumerate(parsed) if abs(v - expected) <= 0.5 * 10 ** -dp + 1e-9]
    assert matches == [q.correct_index], (
        f"{q.qtype}: expected {expected!r}, options {q.options}, correct={q.correct_option}"
    )
    # The generator's own stored value agrees with the independent computation.
    assert q.payload["correct_value"] == pytest.approx(expected, rel=1e-9, abs=1e-9)
    # Options are presented in ascending numeric order, as on the real test.
    values = [v for v, _ in parsed]
    assert values == sorted(values)
    # The question's home tab exists in the case.
    case.tab(q.payload["tab"])
    assert q.explanation and all(isinstance(s, str) and s for s in q.explanation)


@pytest.mark.parametrize(
    "kind,ti",
    [(k, i) for k, (_, ts) in CASE_TYPES.items() for i in range(len(ts))],
)
def test_every_template_has_exactly_one_correct_option(kind, ti):
    for seed in SEEDS:
        case, q = generate_single(seed, kind, ti)
        check_question(case, q)


def test_full_test_generation():
    for seed in range(100):
        cases, qs = generate_test(seed)
        assert len(qs) == 24
        for q in qs:
            check_question(cases[q.payload["case_id"]], q)


def test_generation_is_deterministic_per_seed_and_varies_across_seeds():
    _, a = generate_test(42)
    _, b = generate_test(42)
    _, c = generate_test(43)
    assert [q.prompt for q in a] == [q.prompt for q in b]
    assert [q.options for q in a] == [q.options for q in b]
    assert [q.options for q in a] != [q.options for q in c]


def test_distractors_mostly_come_from_named_mistakes():
    tags = []
    for seed in range(200):
        _, qs = generate_test(seed)
        for q in qs:
            tags += [t for t in q.option_tags if t != "correct"]
    near_miss_share = tags.count("near_miss") / len(tags)
    assert near_miss_share < 0.1, f"too many filler distractors: {near_miss_share:.1%}"


def test_custom_question_count():
    for n in (5, 10, 37):
        _, qs = generate_test(7, n_questions=n)
        assert len(qs) == n
