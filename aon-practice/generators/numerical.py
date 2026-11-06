"""Numerical reasoning generator (Aon / cut-e "scales numerical" style).

The real test shows a *case*: one data set split across several tabs (tables
and charts), with several questions underneath. Each question belongs to one
tab. You have to find the right figures, sometimes across tabs, and calculate.

All data is random but seeded. The correct answer is always *computed* from the
numbers shown on screen, never hardcoded. Distractors are built from common
mistakes: wrong row, wrong column, wrong base for a %, inverted rate, rounding
too early, forgetting a step, decimal slips.
"""
from __future__ import annotations

import math
import random
from dataclasses import dataclass, field
from statistics import median
from typing import Callable

from .common import Distractor, Question, build_options, fmt_money, fmt_num, fmt_pct

SECTION = "numerical"

# --------------------------------------------------------------------- data model


@dataclass
class Tab:
    """A tab of data. For charts, ``cols`` are the x-axis and ``rows`` the series."""

    key: str
    title: str
    kind: str  # "table" | "bar" | "line"
    unit: str
    rows: list[str]
    cols: list[str]
    values: list[list[float]]
    decimals: int = 0
    row_decimals: dict[str, int] = field(default_factory=dict)

    def v(self, row: str, col: str) -> float:
        return self.values[self.rows.index(row)][self.cols.index(col)]

    def row(self, row: str) -> list[float]:
        return list(self.values[self.rows.index(row)])

    def col(self, col: str) -> list[float]:
        j = self.cols.index(col)
        return [r[j] for r in self.values]

    def dp(self, row: str) -> int:
        return self.row_decimals.get(row, self.decimals)

    def show(self, row: str, col: str) -> str:
        return f"{self.v(row, col):,.{self.dp(row)}f}"


@dataclass
class Case:
    cid: str
    kind: str
    title: str
    tabs: list[Tab]
    meta: dict = field(default_factory=dict)

    def tab(self, key: str) -> Tab:
        for t in self.tabs:
            if t.key == key:
                return t
        raise KeyError(key)


# ------------------------------------------------------------------ constants

CURRENCIES = {  # code: (symbol used in answers, approx units per 1 USD, decimals shown)
    "USD": ("$", 1.0, 4),
    "EUR": ("€", 0.92, 4),
    "GBP": ("£", 0.79, 4),
    "CHF": ("CHF ", 0.88, 4),
    "CAD": ("C$", 1.36, 4),
    "AUD": ("A$", 1.52, 4),
    "JPY": ("¥", 150.0, 2),
}
BASES = ["GBP", "EUR", "USD"]
REGION_SETS = [
    ["North", "South", "East", "West", "Central", "Midlands"],
    ["UK", "France", "Germany", "Spain", "Italy", "Nordics"],
    ["Americas", "EMEA", "APAC", "LatAm", "Middle East", "Africa"],
]
COST_CATEGORIES = ["Staff", "Materials", "Energy", "Marketing", "IT", "Logistics", "Premises"]
COMPANIES = ["Alder Ltd", "Brookfield plc", "Corvex", "Dunmore & Co", "Elmstone", "Fairlight", "Granton", "Halcyon"]
QUARTERS = ["Q1", "Q2", "Q3", "Q4"]
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"]


def pct_change(old: float, new: float) -> float:
    return (new - old) / old * 100


def _walk(rng: random.Random, start: float, n: int, lo: float, hi: float) -> list[float]:
    """Random walk with a meaningful step each period (|step| between lo and hi)."""
    out = [start]
    for _ in range(n - 1):
        step = rng.uniform(lo, hi) * rng.choice([-1, 1])
        out.append(out[-1] * (1 + step))
    return out


def _rate(rng: random.Random, base: str, ccy: str) -> float:
    return CURRENCIES[ccy][1] / CURRENCIES[base][1] * rng.uniform(0.95, 1.05)


# --------------------------------------------------------------------- cases


def case_regional(rng: random.Random, cid: str) -> Case:
    base = rng.choice(BASES)
    sym = CURRENCIES[base][0]
    regions = rng.sample(rng.choice(REGION_SETS), 5)
    sales = [[round(x) for x in _walk(rng, rng.randint(180, 900), 4, 0.04, 0.28)] for _ in regions]
    staff = [[rng.randint(6, 48) for _ in regions]]
    fx_ccys = rng.sample([c for c in CURRENCIES if c != base], 3)
    fx = []
    for c in fx_ccys:
        dp = CURRENCIES[c][2]
        fx.append([round(x, dp) for x in _walk(rng, _rate(rng, base, c), 4, 0.005, 0.03)])
    tabs = [
        Tab("sales", "Sales by region", "table", f"{base} thousands", regions, QUARTERS, sales),
        Tab("staff", "Sales staff", "bar", "Number of employees (full year)", ["Employees"], regions, staff),
        Tab("fx", "Exchange rates", "table", f"Units of currency per 1 {base} (quarterly average)",
            fx_ccys, QUARTERS, fx, 4, {c: CURRENCIES[c][2] for c in fx_ccys}),
    ]
    return Case(cid, "regional", "Regional sales performance", tabs, {"base": base, "sym": sym})


def case_costs(rng: random.Random, cid: str) -> Case:
    base = rng.choice(BASES)
    sym = CURRENCIES[base][0]
    end = rng.randint(2021, 2025)
    years = [str(y) for y in range(end - 4, end + 1)]
    cats = rng.sample(COST_CATEGORIES, 4)
    costs = [[round(x) for x in _walk(rng, rng.randint(80, 480), 5, 0.03, 0.22)] for _ in cats]
    totals = [sum(c[j] for c in costs) for j in range(5)]
    revenue = [[round(t * rng.uniform(1.08, 1.35)) for t in totals]]
    tabs = [
        Tab("costs", "Operating costs", "bar", f"{base} thousands", cats, years, costs),
        Tab("revenue", "Revenue", "line", f"{base} thousands", ["Revenue"], years, revenue),
    ]
    return Case(cid, "costs", "Operating costs and revenue", tabs, {"base": base, "sym": sym})


def case_market(rng: random.Random, cid: str) -> Case:
    base = rng.choice(BASES)
    sym = CURRENCIES[base][0]
    end = rng.randint(2021, 2025)
    years = [str(end - 1), str(end)]
    comps = rng.sample(COMPANIES, 5)

    def shares(weights: list[float]) -> list[float]:
        tot = sum(weights)
        s = [round(w / tot * 100, 1) for w in weights]
        s[-1] = round(100 - sum(s[:-1]), 1)
        return s

    while True:
        w1 = [rng.uniform(1.0, 3.0) for _ in comps]
        w2 = [w * rng.uniform(0.75, 1.3) for w in w1]
        s1, s2 = shares(w1), shares(w2)
        if all(abs(a - b) >= 0.3 for a, b in zip(s1, s2)) and min(s1 + s2) >= 5:
            break
    m1 = rng.randint(200, 900)
    m2 = round(m1 * (1 + rng.uniform(0.04, 0.25) * rng.choice([-1, 1])))
    tabs = [
        Tab("share", "Market share", "table", "% of total market sales", comps, years,
            [[a, b] for a, b in zip(s1, s2)], 1),
        Tab("size", "Market size", "bar", f"Total market sales, {base} millions", ["Market size"], years, [[m1, m2]]),
    ]
    return Case(cid, "market", "Market share", tabs, {"base": base, "sym": sym})


def case_fx(rng: random.Random, cid: str) -> Case:
    base = rng.choice(BASES)
    sym = CURRENCIES[base][0]
    ccys = rng.sample([c for c in CURRENCIES if c != base], 4)
    rates, receipts = [], []
    for c in ccys:
        dp = CURRENCIES[c][2]
        rates.append([round(x, dp) for x in _walk(rng, _rate(rng, base, c), 6, 0.004, 0.035)])
        scale = CURRENCIES[c][1] / CURRENCIES[base][1]
        receipts.append([round(x * scale) for x in _walk(rng, rng.uniform(150, 700), 6, 0.03, 0.25)])
    tabs = [
        Tab("fx", "Exchange rates", "table", f"Units of currency per 1 {base} (monthly average)",
            ccys, MONTHS, rates, 4, {c: CURRENCIES[c][2] for c in ccys}),
        Tab("receipts", "Overseas receipts", "table", "Thousands, in local currency", ccys, MONTHS, receipts),
    ]
    return Case(cid, "fx", "Exchange rates and overseas receipts", tabs, {"base": base, "sym": sym})


# -------------------------------------------------------------------- helpers


def _make(rng, case, tab, qtype, prompt, correct, distractors, fmt, steps, calc) -> Question:
    options, idx, tags, notes = build_options(rng, correct, distractors, fmt)
    return Question(
        section=SECTION,
        qtype=qtype,
        prompt=prompt,
        options=options,
        correct_index=idx,
        explanation=steps,
        option_tags=tags,
        option_notes=notes,
        payload={"case_id": case.cid, "tab": tab, "correct_value": correct},
        calc=calc,
    )


def poss(name: str) -> str:
    return f"{name}'" if name.endswith("s") else f"{name}'s"


def _other(rng, items, *exclude):
    return rng.choice([x for x in items if x not in exclude])


def _pct_change_q(rng, case, tabkey, what, qtype):
    """Shared % change template: rows = items, cols = periods."""
    t = case.tab(tabkey)
    r = rng.choice(t.rows)
    i, j = sorted(rng.sample(range(len(t.cols)), 2))
    a, b = t.cols[i], t.cols[j]
    old, new = t.v(r, a), t.v(r, b)
    correct = pct_change(old, new)
    r2 = _other(rng, t.rows, r)
    c3 = t.cols[rng.choice([k for k in range(len(t.cols)) if k not in (i, j)])]
    dp = 2 if tabkey == "fx" else 1
    fmt = fmt_pct(dp, signed=True)
    d = [
        Distractor((new - old) / new * 100, "wrong_base",
                   f"Wrong base: divided the change by the {b} value ({t.show(r, b)}) instead of the starting {a} value ({t.show(r, a)})."),
        Distractor(pct_change(t.v(r2, a), t.v(r2, b)), "wrong_row", f"Wrong row: used {r2} instead of {r}."),
        Distractor(pct_change(old, t.v(r, c3)), "wrong_column", f"Wrong column: used {c3} instead of {b}."),
        Distractor(-correct, "wrong_direction", "Sign error: worked out the change in the wrong direction."),
    ]
    steps = [
        f"Open the **{t.title}** tab, row **{r}**: {a} = {t.show(r, a)}, {b} = {t.show(r, b)}.",
        f"Change = {t.show(r, b)} − {t.show(r, a)} = {new - old:,.{t.dp(r)}f}.",
        f"Divide by the **starting** value ({a}): {new - old:,.{t.dp(r)}f} ÷ {t.show(r, a)} = {(new - old) / old:.5f}.",
        f"× 100 = **{fmt(correct)}**.",
    ]
    prompt = f"By what percentage did {what(r)} change from {a} to {b}?"
    calc = ["pct_change", ["cell", tabkey, r, a], ["cell", tabkey, r, b]]
    return _make(rng, case, tabkey, "Percentage change", prompt, correct, d, fmt, steps, calc)


def _share_q(rng, case, tabkey, what, total_what):
    t = case.tab(tabkey)
    r = rng.choice(t.rows)
    c = rng.choice(t.cols)
    v, total = t.v(r, c), sum(t.col(c))
    correct = v / total * 100
    r2 = _other(rng, t.rows, r)
    c2 = _other(rng, t.cols, c)
    fmt = fmt_pct(1)
    d = [
        Distractor(v / (total - v) * 100, "wrong_base",
                   f"Wrong base: divided by the *other* rows' total ({total - v:,}) instead of the overall total ({total:,})."),
        Distractor(t.v(r2, c) / total * 100, "wrong_row", f"Wrong row: used {r2} instead of {r}."),
        Distractor(t.v(r, c2) / sum(t.col(c2)) * 100, "wrong_column", f"Wrong column: used {c2} instead of {c}."),
        Distractor(v / total, "decimal_slip", "Decimal slip: forgot to multiply the fraction by 100."),
    ]
    adds = " + ".join(f"{x:,}" for x in t.col(c))
    steps = [
        f"Open the **{t.title}** tab, column **{c}**. {r} = {v:,}.",
        f"{total_what} for {c} = {adds} = {total:,}.",
        f"Share = {v:,} ÷ {total:,} = {v / total:.5f}.",
        f"× 100 = **{fmt(correct)}**.",
    ]
    prompt = f"What percentage of {total_what.lower()} in {c} came from {what(r)}?"
    calc = ["pct", ["cell", tabkey, r, c], ["col_sum", tabkey, c]]
    return _make(rng, case, tabkey, "Share of total", prompt, correct, d, fmt, steps, calc)


def _average_q(rng, case, tabkey, what, sym):
    t = case.tab(tabkey)
    r = rng.choice(t.rows)
    row = t.row(r)
    n = len(row)
    correct = sum(row) / n
    r2 = _other(rng, t.rows, r)
    fmt = fmt_money(sym, 2)
    d = [
        Distractor(sum(row) / (n - 1), "wrong_divisor", f"Wrong divisor: divided by {n - 1} instead of {n}."),
        Distractor(sum(t.row(r2)) / n, "wrong_row", f"Wrong row: averaged {r2} instead of {r}."),
        Distractor((row[0] + row[-1]) / 2, "forgot_step",
                   f"Shortcut: averaged only {t.cols[0]} and {t.cols[-1]} instead of all {n} periods."),
        Distractor(median(row), "wrong_measure", "Wrong measure: took the median instead of the mean."),
    ]
    steps = [
        f"Open the **{t.title}** tab, row **{r}**: {', '.join(f'{x:,}' for x in row)}.",
        f"Sum = {' + '.join(f'{x:,}' for x in row)} = {sum(row):,}.",
        f"Mean = {sum(row):,} ÷ {n} = **{fmt(correct)}** (figures are in thousands).",
    ]
    period = "quarterly" if t.cols[0].startswith("Q") else "annual"
    prompt = f"What were the average {period} {what(r)} from {t.cols[0]} to {t.cols[-1]}?"
    calc = ["row_mean", tabkey, r]
    return _make(rng, case, tabkey, "Average", prompt, correct, d, fmt, steps, calc)


# ----------------------------------------------------------------- templates


def t_regional_pct_change(rng, case):
    return _pct_change_q(rng, case, "sales", lambda r: f"sales in {r}", "Percentage change")


def t_regional_share(rng, case):
    return _share_q(rng, case, "sales", lambda r: r, "Total sales")


def t_regional_average(rng, case):
    return _average_q(rng, case, "sales", lambda r: f"sales in {r}", case.meta["sym"])


def t_regional_per_head(rng, case):
    s, st = case.tab("sales"), case.tab("staff")
    sym = case.meta["sym"]
    r = rng.choice(s.rows)
    annual = sum(s.row(r))
    staff = st.v("Employees", r)
    correct = annual / staff
    r2 = _other(rng, s.rows, r)
    q = rng.choice(QUARTERS)
    fmt = fmt_money(sym, 2)
    d = [
        Distractor(s.v(r, q) / staff, "forgot_step", f"Missed a step: used only {q} sales, not the full-year total."),
        Distractor(annual / st.v("Employees", r2), "wrong_row", f"Wrong row: used {poss(r2)} staff number instead of {poss(r)}."),
        Distractor(sum(s.row(r2)) / staff, "wrong_row", f"Wrong row: used {poss(r2)} sales instead of {poss(r)}."),
        Distractor(annual / 4 / staff, "wrong_period", "Wrong period: gave the average *quarterly* sales per employee, not annual."),
    ]
    steps = [
        f"**Sales by region** tab, row {r}: {' + '.join(f'{x:,}' for x in s.row(r))} = {annual:,} (thousands) for the year.",
        f"**Sales staff** tab: {r} has {staff:g} employees.",
        f"Sales per employee = {annual:,} ÷ {staff:g} = **{fmt(correct)}**.",
    ]
    prompt = f"What were {poss(r)} full-year sales per sales employee?"
    calc = ["div", ["row_sum", "sales", r], ["cell", "staff", "Employees", r]]
    return _make(rng, case, "staff", "Ratio (per head)", prompt, correct, d, fmt, steps, calc)


def _round_rate(rate: float) -> float:
    return round(rate, 1) if rate < 20 else round(rate, -1)


def t_regional_convert(rng, case):
    s, fx = case.tab("sales"), case.tab("fx")
    base = case.meta["base"]
    r, q, c = rng.choice(s.rows), rng.choice(QUARTERS), rng.choice(fx.rows)
    v, rate = s.v(r, q), fx.v(c, q)
    correct = v * rate
    sym = CURRENCIES[c][0]
    fmt = fmt_money(sym, 0 if c == "JPY" else 1)
    q2 = _other(rng, QUARTERS, q)
    c2 = _other(rng, fx.rows, c)
    d = [
        Distractor(v / rate, "inverted_rate", f"Inverted the rate: divided by {fx.show(c, q)} instead of multiplying."),
        Distractor(v * fx.v(c, q2), "wrong_column", f"Wrong column: used the {q2} rate instead of {q}."),
        Distractor(v * fx.v(c2, q), "wrong_row", f"Wrong row: used the {c2} rate instead of {c}."),
        Distractor(v * _round_rate(rate), "rounding", f"Rounded too early: used {_round_rate(rate):g} instead of {fx.show(c, q)}."),
    ]
    steps = [
        f"**Sales by region** tab: {r}, {q} = {base} {v:,}k.",
        f"**Exchange rates** tab: in {q}, 1 {base} = {fx.show(c, q)} {c}.",
        f"{base} → {c}: **multiply** by the rate. {v:,} × {fx.show(c, q)} = **{fmt(correct)}**.",
    ]
    prompt = f"Using the {q} average exchange rate, what were {poss(r)} {q} sales in {c}?"
    calc = ["mul", ["cell", "sales", r, q], ["cell", "fx", c, q]]
    return _make(rng, case, "fx", "Currency conversion", prompt, correct, d, fmt, steps, calc)


def t_costs_pct_change(rng, case):
    return _pct_change_q(rng, case, "costs", lambda r: f"{r} costs", "Percentage change")


def t_costs_share(rng, case):
    return _share_q(rng, case, "costs", lambda r: f"{r}", "Total operating costs")


def t_costs_average(rng, case):
    return _average_q(rng, case, "costs", lambda r: f"{r} costs", case.meta["sym"])


def t_costs_margin(rng, case):
    co, rv = case.tab("costs"), case.tab("revenue")
    y = rng.choice(co.cols)
    rev = rv.v("Revenue", y)
    tot = sum(co.col(y))
    correct = (rev - tot) / rev * 100
    y2 = _other(rng, co.cols, y)
    skip = rng.choice(co.rows)
    fmt = fmt_pct(1)
    d = [
        Distractor((rev - tot) / tot * 100, "wrong_base", "Wrong base: divided profit by costs instead of by revenue."),
        Distractor((rev - (tot - co.v(skip, y))) / rev * 100, "forgot_step",
                   f"Missed a step: left {skip} out of total costs."),
        Distractor((rv.v("Revenue", y2) - sum(co.col(y2))) / rv.v("Revenue", y2) * 100, "wrong_column",
                   f"Wrong column: used {y2} instead of {y}."),
        Distractor(tot / rev * 100, "wrong_measure", "Wrong measure: gave costs as a % of revenue, not profit."),
    ]
    steps = [
        f"**Operating costs** tab, {y}: {' + '.join(f'{x:,}' for x in co.col(y))} = {tot:,}.",
        f"**Revenue** tab, {y}: {rev:,}.",
        f"Profit = {rev:,} − {tot:,} = {rev - tot:,}.",
        f"Margin = profit ÷ revenue = {rev - tot:,} ÷ {rev:,} × 100 = **{fmt(correct)}**.",
    ]
    prompt = f"What was the operating profit margin in {y} (revenue minus all operating costs, as a % of revenue)?"
    calc = ["pct", ["sub", ["cell", "revenue", "Revenue", y], ["col_sum", "costs", y]], ["cell", "revenue", "Revenue", y]]
    return _make(rng, case, "revenue", "Profit margin", prompt, correct, d, fmt, steps, calc)


def t_market_sales(rng, case):
    sh, sz = case.tab("share"), case.tab("size")
    sym = case.meta["sym"]
    c = rng.choice(sh.rows)
    y = rng.choice(sh.cols)
    y2 = _other(rng, sh.cols, y)
    s, m = sh.v(c, y), sz.v("Market size", y)
    correct = s / 100 * m
    c2 = _other(rng, sh.rows, c)
    fmt = fmt_money(sym, 2, "m")
    d = [
        Distractor(sh.v(c, y2) / 100 * m, "wrong_column", f"Wrong column: used {poss(c)} {y2} share."),
        Distractor(s / 100 * sz.v("Market size", y2), "wrong_column", f"Wrong column: used the {y2} market size."),
        Distractor(sh.v(c2, y) / 100 * m, "wrong_row", f"Wrong row: used {poss(c2)} share."),
        Distractor(s / 10 * m, "decimal_slip", "Decimal slip: divided the percentage by 10 instead of 100."),
    ]
    steps = [
        f"**Market share** tab: {c} in {y} = {s:.1f}%.",
        f"**Market size** tab: {y} = {sym}{m:,}m.",
        f"Sales = {s:.1f}% × {m:,} = {s / 100:.3f} × {m:,} = **{fmt(correct)}**.",
    ]
    prompt = f"What were {poss(c)} sales in {y}?"
    calc = ["div", ["mul", ["cell", "share", c, y], ["cell", "size", "Market size", y]], ["const", 100]]
    return _make(rng, case, "size", "Percentage of a total", prompt, correct, d, fmt, steps, calc)


def t_market_sales_change(rng, case):
    sh, sz = case.tab("share"), case.tab("size")
    sym = case.meta["sym"]
    c = rng.choice(sh.rows)
    y1, y2 = sh.cols
    s1, s2 = sh.v(c, y1), sh.v(c, y2)
    m1, m2 = sz.v("Market size", y1), sz.v("Market size", y2)
    v1, v2 = s1 / 100 * m1, s2 / 100 * m2
    correct = pct_change(v1, v2)
    fmt = fmt_pct(1, signed=True)
    d = [
        Distractor(pct_change(s1, s2), "forgot_step",
                   "Missed a step: worked out the change in *share* only and ignored the change in market size."),
        Distractor(s2 - s1, "pp_vs_pct", "Percentage points vs percent: gave the change in share in percentage points."),
        Distractor(pct_change(m1, m2), "wrong_row", "Wrong figure: used the change in the whole market, not this company's sales."),
        Distractor((v2 - v1) / v2 * 100, "wrong_base", f"Wrong base: divided by the {y2} sales instead of the {y1} sales."),
    ]
    steps = [
        f"{y1} sales = {s1:.1f}% × {sym}{m1:,}m = {sym}{v1:,.3f}m.",
        f"{y2} sales = {s2:.1f}% × {sym}{m2:,}m = {sym}{v2:,.3f}m.",
        f"Change = {v2:,.3f} − {v1:,.3f} = {v2 - v1:,.3f}.",
        f"% change = {v2 - v1:,.3f} ÷ {v1:,.3f} × 100 = **{fmt(correct)}**.",
        "Shortcut: (1 + share change) × (1 + market change) − 1.",
    ]
    prompt = f"By what percentage did {poss(c)} sales (in {case.meta['base']}) change from {y1} to {y2}?"
    sales = lambda y: ["mul", ["cell", "share", c, y], ["cell", "size", "Market size", y]]  # noqa: E731
    calc = ["pct_change", sales(y1), sales(y2)]
    return _make(rng, case, "share", "Two-step % change", prompt, correct, d, fmt, steps, calc)


def t_market_share_change(rng, case):
    sh, sz = case.tab("share"), case.tab("size")
    c = rng.choice(sh.rows)
    y1, y2 = sh.cols
    s1, s2 = sh.v(c, y1), sh.v(c, y2)
    correct = pct_change(s1, s2)
    c2 = _other(rng, sh.rows, c)
    m1, m2 = sz.v("Market size", y1), sz.v("Market size", y2)
    fmt = fmt_pct(1, signed=True)
    d = [
        Distractor(s2 - s1, "pp_vs_pct", "Percentage points vs percent: gave the difference in percentage points."),
        Distractor((s2 - s1) / s2 * 100, "wrong_base", f"Wrong base: divided by the {y2} share instead of the {y1} share."),
        Distractor(pct_change(sh.v(c2, y1), sh.v(c2, y2)), "wrong_row", f"Wrong row: used {c2} instead of {c}."),
        Distractor(pct_change(s1 * m1, s2 * m2), "wrong_measure",
                   "Wrong measure: worked out the change in sales value, not the change in market share."),
    ]
    steps = [
        f"**Market share** tab, {c}: {y1} = {s1:.1f}%, {y2} = {s2:.1f}%.",
        f"Difference = {s2 - s1:+.1f} percentage points. The question asks for a *percentage* change, so:",
        f"{s2 - s1:+.1f} ÷ {s1:.1f} × 100 = **{fmt(correct)}**.",
    ]
    prompt = f"By what percentage (not percentage points) did {poss(c)} market share change from {y1} to {y2}?"
    calc = ["pct_change", ["cell", "share", c, y1], ["cell", "share", c, y2]]
    return _make(rng, case, "share", "Percent vs percentage points", prompt, correct, d, fmt, steps, calc)


def t_market_ratio(rng, case):
    sh, sz = case.tab("share"), case.tab("size")
    y1, y2 = sh.cols
    y = rng.choice(sh.cols)
    yo = y2 if y == y1 else y1
    a, b = rng.sample(sh.rows, 2)
    sa, sb = sh.v(a, y), sh.v(b, y)
    correct = sa / sb
    c3 = _other(rng, sh.rows, a, b)
    fmt = fmt_num(2)
    d = [
        Distractor(sb / sa, "inverted_rate", f"Inverted the ratio: gave {b} ÷ {a} instead of {a} ÷ {b}."),
        Distractor(sh.v(a, yo) / sh.v(b, yo), "wrong_column", f"Wrong column: used the {yo} shares."),
        Distractor(sa / sh.v(c3, y), "wrong_row", f"Wrong row: compared with {c3} instead of {b}."),
        Distractor((sa - sb) / sb, "wrong_measure", "Wrong measure: gave how much *larger* (difference ÷ base), not the ratio."),
    ]
    steps = [
        f"Both companies are in the same market and year, so the market size cancels out: compare the shares.",
        f"**Market share** tab, {y}: {a} = {sa:.1f}%, {b} = {sb:.1f}%.",
        f"Ratio = {sa:.1f} ÷ {sb:.1f} = **{fmt(correct)}**.",
    ]
    prompt = f"In {y}, what was the ratio of {poss(a)} sales to {poss(b)} sales?"
    calc = ["div",
            ["mul", ["cell", "share", a, y], ["cell", "size", "Market size", y]],
            ["mul", ["cell", "share", b, y], ["cell", "size", "Market size", y]]]
    return _make(rng, case, "share", "Ratio", prompt, correct, d, fmt, steps, calc)


def t_fx_convert(rng, case):
    fx, rc = case.tab("fx"), case.tab("receipts")
    base, sym = case.meta["base"], case.meta["sym"]
    c, m = rng.choice(fx.rows), rng.choice(MONTHS)
    amt, rate = rc.v(c, m), fx.v(c, m)
    correct = amt / rate
    fmt = fmt_money(sym, 1)
    m2 = _other(rng, MONTHS, m)
    c2 = _other(rng, fx.rows, c)
    d = [
        Distractor(amt * rate, "inverted_rate", f"Inverted the rate: multiplied by {fx.show(c, m)} instead of dividing."),
        Distractor(amt / fx.v(c, m2), "wrong_column", f"Wrong column: used the {m2} rate instead of {m}."),
        Distractor(rc.v(c2, m) / fx.v(c2, m), "wrong_row", f"Wrong row: converted the {c2} receipts instead of {c}."),
        Distractor(amt / _round_rate(rate), "rounding", f"Rounded too early: used {_round_rate(rate):g} instead of {fx.show(c, m)}."),
    ]
    steps = [
        f"**Overseas receipts** tab: {c}, {m} = {amt:,}k {c}.",
        f"**Exchange rates** tab: in {m}, 1 {base} = {fx.show(c, m)} {c}.",
        f"{c} → {base}: **divide** by the rate. {amt:,} ÷ {fx.show(c, m)} = **{fmt(correct)}**.",
    ]
    prompt = f"What were the {m} receipts in {c} worth in {base}, at that month's average rate?"
    calc = ["div", ["cell", "receipts", c, m], ["cell", "fx", c, m]]
    return _make(rng, case, "receipts", "Currency conversion", prompt, correct, d, fmt, steps, calc)


def t_fx_rate_change(rng, case):
    base = case.meta["base"]
    return _pct_change_q(rng, case, "fx", lambda c: f"the value of 1 {base} in {c}", "Percentage change")


def t_fx_cross_rate(rng, case):
    fx = case.tab("fx")
    base = case.meta["base"]
    a, b = rng.sample(fx.rows, 2)
    m = rng.choice(MONTHS)
    ra, rb = fx.v(a, m), fx.v(b, m)
    correct = rb / ra
    m2 = _other(rng, MONTHS, m)
    c3 = _other(rng, fx.rows, a, b)
    fmt = fmt_num(2 if correct >= 20 else 4)
    d = [
        Distractor(ra / rb, "inverted_rate", f"Inverted: gave {b}→{a} ({fx.show(a, m)} ÷ {fx.show(b, m)}) instead of {a}→{b}."),
        Distractor(fx.v(b, m2) / fx.v(a, m2), "wrong_column", f"Wrong column: used {m2} rates instead of {m}."),
        Distractor(fx.v(c3, m) / ra, "wrong_row", f"Wrong row: used {c3} instead of {b}."),
        Distractor(ra * rb, "wrong_operation", "Wrong operation: multiplied the two rates."),
    ]
    steps = [
        f"**Exchange rates** tab, {m}: 1 {base} = {fx.show(a, m)} {a} and 1 {base} = {fx.show(b, m)} {b}.",
        f"So {fx.show(a, m)} {a} = {fx.show(b, m)} {b}, which means 1 {a} = {fx.show(b, m)} ÷ {fx.show(a, m)} {b}.",
        f"= **{fmt(correct)} {b}**.",
    ]
    prompt = f"Based on the {m} rates, how many {b} was 1 {a} worth?"
    calc = ["div", ["cell", "fx", b, m], ["cell", "fx", a, m]]
    return _make(rng, case, "fx", "Cross rate", prompt, correct, d, fmt, steps, calc)


def t_fx_receipts_change(rng, case):
    fx, rc = case.tab("fx"), case.tab("receipts")
    base, sym = case.meta["base"], case.meta["sym"]
    c = rng.choice(fx.rows)
    i, j = sorted(rng.sample(range(len(MONTHS)), 2))
    m1, m2 = MONTHS[i], MONTHS[j]
    v1, v2 = rc.v(c, m1) / fx.v(c, m1), rc.v(c, m2) / fx.v(c, m2)
    correct = pct_change(v1, v2)
    fmt = fmt_pct(1, signed=True)
    d = [
        Distractor(pct_change(rc.v(c, m1), rc.v(c, m2)), "forgot_step",
                   f"Missed a step: compared the {c} amounts and ignored the change in exchange rate."),
        Distractor(pct_change(rc.v(c, m1) * fx.v(c, m1), rc.v(c, m2) * fx.v(c, m2)), "inverted_rate",
                   "Inverted the rate: multiplied by the rates instead of dividing."),
        Distractor((v2 - v1) / v2 * 100, "wrong_base", f"Wrong base: divided by the {m2} value instead of the {m1} value."),
        Distractor(pct_change(rc.v(c, m1) / fx.v(c, m1), rc.v(c, m2) / fx.v(c, m1)), "wrong_column",
                   f"Wrong column: converted both months at the {m1} rate."),
    ]
    steps = [
        f"{m1}: {rc.v(c, m1):,} ÷ {fx.show(c, m1)} = {sym}{v1:,.3f}k.",
        f"{m2}: {rc.v(c, m2):,} ÷ {fx.show(c, m2)} = {sym}{v2:,.3f}k.",
        f"% change = ({v2:,.3f} − {v1:,.3f}) ÷ {v1:,.3f} × 100 = **{fmt(correct)}**.",
    ]
    prompt = f"Measured in {base}, by what percentage did the {c} receipts change from {m1} to {m2}?"
    calc = ["pct_change",
            ["div", ["cell", "receipts", c, m1], ["cell", "fx", c, m1]],
            ["div", ["cell", "receipts", c, m2], ["cell", "fx", c, m2]]]
    return _make(rng, case, "receipts", "Two-step % change", prompt, correct, d, fmt, steps, calc)


CASE_TYPES: dict[str, tuple[Callable, list[Callable]]] = {
    "regional": (case_regional, [t_regional_pct_change, t_regional_share, t_regional_average,
                                 t_regional_per_head, t_regional_convert]),
    "costs": (case_costs, [t_costs_pct_change, t_costs_share, t_costs_average, t_costs_margin]),
    "market": (case_market, [t_market_sales, t_market_sales_change, t_market_share_change, t_market_ratio]),
    "fx": (case_fx, [t_fx_convert, t_fx_rate_change, t_fx_cross_rate, t_fx_receipts_change]),
}


# ------------------------------------------------------------------ public API


def generate_test(seed: int, n_questions: int = 24, per_case: int = 4) -> tuple[dict[str, Case], list[Question]]:
    """Generate a full numerical section: cases (data sets) and their questions, in order."""
    rng = random.Random(seed)
    n_cases = math.ceil(n_questions / per_case)
    kinds: list[str] = []
    while len(kinds) < n_cases:
        batch = list(CASE_TYPES)
        rng.shuffle(batch)
        kinds.extend(batch)
    cases: dict[str, Case] = {}
    questions: list[Question] = []
    for i, kind in enumerate(kinds[:n_cases]):
        build, templates = CASE_TYPES[kind]
        case = build(rng, f"case{i + 1}")
        cases[case.cid] = case
        picks = rng.sample(templates, min(per_case, len(templates)))
        while len(picks) < per_case:  # small template pools may repeat a template on new figures
            picks.append(rng.choice(templates))
        questions.extend(t(rng, case) for t in picks)
    return cases, questions[:n_questions]


def generate_single(seed: int, kind: str, template_index: int) -> tuple[Case, Question]:
    """Generate one specific (case type, template) combination. Used by the tests."""
    rng = random.Random(seed)
    build, templates = CASE_TYPES[kind]
    case = build(rng, "case1")
    return case, templates[template_index](rng, case)


# ------------------------------------------------------------------ rendering


def render_tab(tab: Tab):
    """Matplotlib figure for a chart tab, with values labelled as on the real test."""
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    fig, ax = plt.subplots(figsize=(7.2, 3.8), dpi=110)
    palette = ["#2E5A88", "#E07B39", "#4C9A6A", "#B5485D", "#7A68A6", "#C9A227"]
    x = list(range(len(tab.cols)))
    if tab.kind == "bar":
        n = len(tab.rows)
        width = 0.8 / n
        for k, (name, vals) in enumerate(zip(tab.rows, tab.values)):
            pos = [i - 0.4 + width * (k + 0.5) for i in x]
            bars = ax.bar(pos, vals, width * 0.92, label=name, color=palette[k % len(palette)])
            ax.bar_label(bars, labels=[f"{v:,.{tab.decimals}f}" for v in vals],
                         fontsize=7 if n > 2 else 9, padding=2)
        if n > 1:
            ax.legend(fontsize=8, ncol=n, loc="upper center", bbox_to_anchor=(0.5, -0.1), frameon=False)
    else:  # line
        for k, (name, vals) in enumerate(zip(tab.rows, tab.values)):
            ax.plot(x, vals, marker="o", color=palette[k % len(palette)], label=name)
            for xi, v in zip(x, vals):
                ax.annotate(f"{v:,.{tab.decimals}f}", (xi, v), textcoords="offset points",
                            xytext=(0, 9), ha="center", fontsize=9,
                            bbox={"boxstyle": "round,pad=0.15", "fc": "white", "ec": "none", "alpha": 0.85})
        lo = min(min(r) for r in tab.values)
        hi = max(max(r) for r in tab.values)
        ax.set_ylim(lo - (hi - lo) * 0.3 - 1, hi + (hi - lo) * 0.25 + 1)
    ax.set_xticks(x, tab.cols)
    ax.set_ylabel(tab.unit, fontsize=9)
    ax.spines[["top", "right"]].set_visible(False)
    ax.grid(axis="y", alpha=0.3)
    ax.margins(y=0.15)
    fig.tight_layout()
    return fig
