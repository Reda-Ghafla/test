import storage


def test_save_and_load_roundtrip(tmp_path):
    db = tmp_path / "t.db"
    attempt = {
        "started_at": "2026-01-01T10:00:00", "finished_at": "2026-01-01T10:12:00",
        "section": "numerical", "mode": "exam", "seed": 1, "n_questions": 3, "n_answered": 2,
        "n_correct": 1, "n_wrong": 1, "time_limit_s": 720, "time_used_s": 720, "avg_seconds": 30.0, "timed_out": True,
    }
    responses = [
        {"q_index": 0, "qtype": "Average", "prompt": "p0", "chosen": 1, "correct_index": 1, "is_correct": True, "mistake": None, "seconds": 20},
        {"q_index": 1, "qtype": "Share of total", "prompt": "p1", "chosen": 0, "correct_index": 2, "is_correct": False, "mistake": "wrong_base", "seconds": 40},
        {"q_index": 2, "qtype": "Cross rate", "prompt": "p2", "chosen": None, "correct_index": 3, "is_correct": False, "mistake": "unanswered", "seconds": None},
    ]
    aid = storage.save_attempt(attempt, responses, db)
    a = storage.load_attempts(db)
    r = storage.load_responses(db)
    assert a.loc[0, "id"] == aid and a.loc[0, "timed_out"] == 1
    assert a.loc[0, "accuracy"] == 0.5
    assert round(a.loc[0, "score_pct"], 2) == 33.33
    assert list(r["mistake"].fillna("")) == ["", "wrong_base", "unanswered"]
    a_csv, r_csv = storage.export_csv(tmp_path / "out", db)
    assert a_csv.exists() and r_csv.exists()


def test_env_override(tmp_path, monkeypatch):
    monkeypatch.setenv("AON_DB", str(tmp_path / "env.db"))
    assert storage.load_attempts().empty
    assert (tmp_path / "env.db").exists()
