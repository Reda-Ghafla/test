"""Local persistence of attempts (SQLite), with CSV export.

Two tables:
- attempts:  one row per finished section attempt (score, timing, mode, seed)
- responses: one row per question in that attempt (type, chosen option, mistake tag, seconds)
"""
from __future__ import annotations

import sqlite3
from contextlib import closing
from datetime import datetime
from pathlib import Path

import os

import pandas as pd

DEFAULT_DB = Path(__file__).resolve().parent / "data" / "attempts.db"


def db_path_default() -> Path:
    """The database path: $AON_DB if set, otherwise data/attempts.db."""
    return Path(os.environ.get("AON_DB") or DEFAULT_DB)

SCHEMA = """
CREATE TABLE IF NOT EXISTS attempts (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at    TEXT NOT NULL,
    finished_at   TEXT NOT NULL,
    section       TEXT NOT NULL,
    mode          TEXT NOT NULL,
    seed          INTEGER NOT NULL,
    n_questions   INTEGER NOT NULL,
    n_answered    INTEGER NOT NULL,
    n_correct     INTEGER NOT NULL,
    n_wrong       INTEGER NOT NULL,
    time_limit_s  REAL,
    time_used_s   REAL NOT NULL,
    avg_seconds   REAL,
    timed_out     INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS responses (
    attempt_id    INTEGER NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
    q_index       INTEGER NOT NULL,
    qtype         TEXT NOT NULL,
    prompt        TEXT NOT NULL,
    chosen        INTEGER,
    correct_index INTEGER NOT NULL,
    is_correct    INTEGER NOT NULL,
    mistake       TEXT,
    seconds       REAL,
    PRIMARY KEY (attempt_id, q_index)
);
"""


def connect(db_path: Path | str | None = None) -> sqlite3.Connection:
    db_path = Path(db_path) if db_path else db_path_default()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(SCHEMA)
    return conn


def save_attempt(attempt: dict, responses: list[dict], db_path: Path | str | None = None) -> int:
    """Insert one attempt and its responses; return the new attempt id."""
    cols = ["started_at", "finished_at", "section", "mode", "seed", "n_questions", "n_answered",
            "n_correct", "n_wrong", "time_limit_s", "time_used_s", "avg_seconds", "timed_out"]
    row = {c: attempt.get(c) for c in cols}
    row["finished_at"] = row["finished_at"] or datetime.now().isoformat(timespec="seconds")
    row["timed_out"] = int(bool(row["timed_out"]))
    with closing(connect(db_path)) as conn, conn:
        cur = conn.execute(
            f"INSERT INTO attempts ({', '.join(cols)}) VALUES ({', '.join('?' * len(cols))})",
            [row[c] for c in cols],
        )
        attempt_id = cur.lastrowid
        conn.executemany(
            "INSERT INTO responses (attempt_id, q_index, qtype, prompt, chosen, correct_index, is_correct, mistake, seconds)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [
                (attempt_id, r["q_index"], r["qtype"], r["prompt"], r.get("chosen"), r["correct_index"],
                 int(bool(r["is_correct"])), r.get("mistake"), r.get("seconds"))
                for r in responses
            ],
        )
    return attempt_id


def load_attempts(db_path: Path | str | None = None) -> pd.DataFrame:
    with closing(connect(db_path)) as conn:
        df = pd.read_sql_query("SELECT * FROM attempts ORDER BY finished_at, id", conn)
    if not df.empty:
        df["accuracy"] = df["n_correct"] / df["n_answered"].where(df["n_answered"] > 0)
        df["score_pct"] = df["n_correct"] / df["n_questions"] * 100
    return df


def load_responses(db_path: Path | str | None = None) -> pd.DataFrame:
    with closing(connect(db_path)) as conn:
        return pd.read_sql_query(
            "SELECT r.*, a.section, a.mode, a.finished_at FROM responses r JOIN attempts a ON a.id = r.attempt_id"
            " ORDER BY a.finished_at, r.attempt_id, r.q_index",
            conn,
        )


def export_csv(out_dir: Path | str | None = None, db_path: Path | str | None = None) -> tuple[Path, Path]:
    out_dir = Path(out_dir) if out_dir else (Path(db_path) if db_path else db_path_default()).parent
    out_dir.mkdir(parents=True, exist_ok=True)
    a, r = out_dir / "attempts.csv", out_dir / "responses.csv"
    load_attempts(db_path).to_csv(a, index=False)
    load_responses(db_path).to_csv(r, index=False)
    return a, r
