"""Matplotlib charts for the Progress page."""
from __future__ import annotations

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import pandas as pd  # noqa: E402

SECTION_COLOURS = {
    "numerical": "#2E5A88",
    "inductive": "#E07B39",
    "verbal": "#4C9A6A",
}


def progress_figure(attempts: pd.DataFrame):
    """Score % per attempt over time, one line per section. Exam = filled marker, practice = hollow."""
    fig, ax = plt.subplots(figsize=(8, 3.6), dpi=110)
    for section, grp in attempts.groupby("section"):
        grp = grp.reset_index(drop=True)
        colour = SECTION_COLOURS.get(section, "#555555")
        x = pd.to_datetime(grp["finished_at"])
        ax.plot(x, grp["score_pct"], color=colour, alpha=0.6, linewidth=1.5, label=section.capitalize())
        exam = grp["mode"] == "exam"
        ax.scatter(x[exam], grp["score_pct"][exam], color=colour, s=36, zorder=3)
        ax.scatter(x[~exam], grp["score_pct"][~exam], facecolors="white", edgecolors=colour, s=36, zorder=3)
    ax.set_ylim(0, 105)
    ax.set_ylabel("Score (% of questions)")
    ax.grid(axis="y", alpha=0.3)
    ax.spines[["top", "right"]].set_visible(False)
    ax.legend(frameon=False, fontsize=9, loc="lower right")
    ax.set_title("● exam   ○ practice", fontsize=9, loc="left", color="#666666")
    fig.autofmt_xdate()
    fig.tight_layout()
    return fig


def breakdown_figure(counts: pd.Series, title: str, colour: str = "#B5485D"):
    """Horizontal bar chart for 'which question types / mistakes I get wrong'."""
    counts = counts.sort_values()
    fig, ax = plt.subplots(figsize=(6, 0.4 * len(counts) + 1), dpi=110)
    bars = ax.barh(counts.index, counts.values, color=colour)
    ax.bar_label(bars, padding=3, fontsize=9)
    ax.set_title(title, fontsize=10, loc="left")
    ax.spines[["top", "right"]].set_visible(False)
    ax.set_xticks([])
    fig.tight_layout()
    return fig
