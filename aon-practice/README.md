# Aon-style graduate assessment practice

A Streamlit app for practising Aon (formerly cut-e) "scales" style online tests.
Questions are generated procedurally from a random seed, so every attempt is new.

| Section | Time | Format |
|---|---|---|
| Numerical reasoning | 12 min | Tabbed tables/charts, 5-option calculations |
| Inductive reasoning | 8 min | Odd one out in a row of 9 figures (scales ix style) + 3×3 matrices |
| Verbal reasoning | 12 min | Business passages, True / False / Cannot say |
| Personality | untimed | Agree–disagree scale or paired statements (ADEPT-15 style), unscored |

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

What the tests check:

- `test_inductive.py`: for every generated puzzle, a brute-force search over all
  candidate rules (progressions and repeating patterns) confirms that exactly
  one figure or option is defensible. In odd-one-out rows, random "distraction"
  attributes are checked to be clearly random rather than almost-rules.
- `test_verbal_bank.py`: validates `data/verbal_bank.json` (schema, 3 statements
  per passage, length, balanced True / False / Cannot say).
- `test_numerical.py`: generates every numerical template across hundreds of
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

## Inductive section

Each figure has five attributes: **direction** (8 ways), **corner square**
(4 corners), **dots** (1–4), **colour** (4) and **size** (3). Rules are
progressions ("turns 90° clockwise each step", "moves one corner anticlockwise")
or repeating patterns ("blue, yellow, then again"). Puzzles have 1 or 2 rules.
Later puzzles are more likely to have 2. Some 1-rule puzzles add an attribute
that changes at random, to train you to ignore noise.

- **Odd one out** (about 75% of puzzles): 9 figures in a row, and one breaks a rule.
- **Matrix**: 3×3 grid, one cell missing, 5 options. Each wrong option differs
  from the answer in exactly one attribute.

## Verbal section

22 hand-written passages × 3 statements (22 True, 22 False, 22 Cannot say) in
`data/verbal_bank.json`. To add your own, copy an entry, give it a new `id`,
write 3 statements with `answer` set to `True`, `False` or `Cannot say`, add a
one-line `why`, then run `pytest tests/test_verbal_bank.py`.

Results break your mistakes down into: *went beyond the text* (said True/False
when the answer was Cannot say), *too cautious* (said Cannot say when the
passage did settle it), and *misread* (True ↔ False).

## Personality section

Unscored and not saved, for familiarity only. Choose an agree–disagree scale
or paired statements, where you slide towards the statement more like you (the
forced-choice style Aon's ADEPT-15 uses). Afterwards you see how you used the
scale and whether you agreed with oppositely worded statements, which is the
kind of inconsistency real questionnaires look for.

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
│   ├── numerical.py        # data cases + question templates + chart rendering
│   ├── inductive.py        # rule engine, uniqueness check, matplotlib figures
│   ├── verbal.py           # loads data/verbal_bank.json
│   └── personality.py      # Likert / paired statement bank
├── storage.py              # SQLite persistence + CSV export
├── charts.py               # progress / breakdown charts (matplotlib)
├── data/
│   ├── verbal_bank.json    # extend with your own passages
│   └── attempts.db         # created on first run
└── tests/                  # pytest suite
```
