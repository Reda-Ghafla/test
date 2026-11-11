from generators import personality as pers


def test_blocks():
    block = pers.likert_block(1, 20)
    assert len(block) == 20 and len(set(block)) == 20
    pairs = pers.paired_block(1, 10)
    assert len(pairs) == 10
    for a, b in pairs:
        assert a[1] != b[1], "paired statements should come from different dimensions"


def test_every_dimension_has_a_reverse_item():
    dims = {}
    for _, dim, rev in pers.ITEMS:
        dims.setdefault(dim, set()).add(rev)
    assert all(v == {True, False} for v in dims.values())


def test_consistency_flags():
    agree_both = {"I plan my work in detail before I start.": 4, "I often leave things until the last minute.": 4}
    assert len(pers.consistency_flags(agree_both)) == 1
    consistent = {"I plan my work in detail before I start.": 4, "I often leave things until the last minute.": 0}
    assert pers.consistency_flags(consistent) == []
