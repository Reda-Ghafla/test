# Aon-style graduate assessment practice

A Streamlit app for practising Aon (formerly cut-e) "scales" style online tests.
Questions are generated procedurally from a random seed, so every attempt is new.

| Section | Time | Status |
|---|---|---|
| Numerical reasoning | 12 min | ✅ ready |
| Inductive reasoning | 8 min | 🚧 next |
| Verbal reasoning (True / False / Cannot say) | 12 min | 🚧 planned |
| Personality (Likert, unscored) | untimed | 🚧 planned |

## Run it

```bash
cd aon-practice
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
streamlit run app.py
```

Then open http://localhost:8501.

## Run the tests

```bash
cd aon-practice
pytest -q
```

`tests/test_numerical.py` generates every numerical template across hundreds of
seeds and checks that:

- each question has 5 distinct options and exactly one is correct
- the correct option matches the answer recomputed **independently** from the
  raw table/chart data (the test has its own evaluator for each question's formula)
- options are in ascending order, and most distractors are named mistakes
  rather than random fillers

## How the numerical section matches the real test

- **Cases with tabs.** Each data set is split over 2–3 tabs (tables, bar charts,
  line charts), with about 4 questions per data set. Some questions need
  figures from two tabs.
- **Strict tab rule (on by default).** Each question belongs to one tab. On the
  real test, answering while another tab is open is marked wrong even if the
  number is right. The app does the same, so you build the habit of switching back.
- **Time pressure.** 12 minutes. The real test has about 37 items (≈20 s each).
  The default here is 24 (30 s each). Raise it with the slider as you get faster.
- **Distractors come from real mistakes:** wrong row or column, wrong base for
  a %, % points vs %, inverted exchange rate, rounding too early, missing a step
  in a two-step question, decimal slips, wrong divisor for an average.
- **Question types:** percentage change, share of total, average, ratio per
  head, currency conversion (both directions), cross rates, profit margin,
  percentage of a total, two-step % change, percent vs percentage points.

## Modes

- **Exam:** countdown timer, auto-submits when time runs out, no feedback until the end.
- **Practice:** untimed. After each answer you see whether it was right, the
  likely mistake behind your choice, and a step-by-step worked solution.

After each section you get your score, accuracy (correct ÷ answered), average
seconds per question, a penalised score (correct − wrong), a breakdown by
question type and by mistake, and a full review.

## Data

Every attempt is saved to `data/attempts.db` (SQLite, git-ignored), with one row
per attempt and one per question. The **Progress** page shows your score over
time and your most common mistakes, and lets you download both tables as CSV.
Set `AON_DB=/path/to/file.db` to use a different database.

To replay a test, enter its seed (shown in the sidebar and on the results page).

## Project layout

```
aon-practice/
├── app.py                  # Streamlit UI: start, test runner, results, progress
├── generators/
│   ├── common.py           # Question dataclass, option builder, number formatting
│   └── numerical.py        # data cases + question templates + chart rendering
├── storage.py              # SQLite persistence + CSV export
├── charts.py               # progress / breakdown charts (matplotlib)
├── data/                   # attempts.db is created here
└── tests/                  # pytest suite
```
