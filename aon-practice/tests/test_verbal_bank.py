from collections import Counter

from generators import verbal
from generators.verbal import LABELS


def test_bank_schema():
    bank = verbal.load_bank()
    assert len(bank) >= 20
    ids = [p["id"] for p in bank]
    assert len(ids) == len(set(ids)), "passage ids must be unique"
    for p in bank:
        assert p["title"].strip()
        words = len(p["text"].split())
        assert 90 <= words <= 200, f"{p['id']} has {words} words"
        assert len(p["statements"]) == 3, p["id"]
        for s in p["statements"]:
            assert s["text"].strip() and s["why"].strip()
            assert s["answer"] in LABELS


def test_answer_mix_is_balanced():
    counts = Counter(s["answer"] for p in verbal.load_bank() for s in p["statements"])
    total = sum(counts.values())
    for lab in LABELS:
        assert counts[lab] / total >= 0.25, f"too few '{lab}' statements: {counts}"


def test_generate_test():
    passages, qs = verbal.generate_test(3, n_passages=5)
    assert len(passages) == 5 and len(qs) == 15
    for q in qs:
        assert q.options == LABELS
        assert q.option_tags[q.correct_index] == "correct"
        assert q.option_tags.count("correct") == 1
        assert q.payload["passage_id"] in passages
    _, again = verbal.generate_test(3, n_passages=5)
    assert [q.prompt for q in qs] == [q.prompt for q in again]


def test_mistake_tags():
    assert verbal.mistake_tag("Cannot say", "True") == "assumed_info"
    assert verbal.mistake_tag("True", "Cannot say") == "too_cautious"
    assert verbal.mistake_tag("True", "False") == "misread"
