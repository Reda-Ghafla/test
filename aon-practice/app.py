"""Aon-style graduate assessment simulator (Streamlit).

Run with:  streamlit run app.py
"""
from __future__ import annotations

import io
import random
import time
import uuid
from datetime import datetime

import matplotlib.pyplot as plt
import pandas as pd
import streamlit as st

import charts
import storage
from generators import numerical

st.set_page_config(page_title="Aon-style Practice Tests", page_icon="⏱️", layout="wide")

SECTIONS = {
    "numerical": {"label": "Numerical reasoning", "minutes": 12, "available": True,
                  "blurb": "Data on several tabs (tables and charts). Find the right figures and calculate. "
                           "5 options, one correct. A calculator and scrap paper are allowed."},
    "inductive": {"label": "Inductive reasoning", "minutes": 8, "available": False, "blurb": "Coming next."},
    "verbal": {"label": "Verbal reasoning", "minutes": 12, "available": False, "blurb": "Coming soon."},
    "personality": {"label": "Personality (practice)", "minutes": None, "available": False, "blurb": "Coming soon."},
}

MISTAKE_LABELS = {
    "wrong_row": "Wrong row",
    "wrong_column": "Wrong column / period",
    "wrong_base": "Wrong base for %",
    "wrong_direction": "Sign / direction error",
    "forgot_step": "Missed a step",
    "wrong_measure": "Calculated a different measure",
    "inverted_rate": "Inverted rate or ratio",
    "decimal_slip": "Decimal slip",
    "pp_vs_pct": "% points vs %",
    "rounding": "Rounded too early",
    "wrong_divisor": "Wrong divisor",
    "wrong_operation": "Wrong operation",
    "wrong_period": "Wrong period",
    "near_miss": "Near miss",
    "wrong_tab": "Answered with the wrong tab open",
    "unanswered": "Not answered",
}


# ------------------------------------------------------------------ run state


def start_run(section: str, mode: str, n_questions: int, strict_tabs: bool, seed: int | None):
    seed = seed if seed is not None else random.randrange(1, 10**9)
    cases, questions = numerical.generate_test(seed, n_questions=n_questions)
    now = time.time()
    limit = SECTIONS[section]["minutes"] * 60 if mode == "exam" else None
    st.session_state.run = {
        "id": uuid.uuid4().hex[:8],
        "section": section,
        "mode": mode,
        "seed": seed,
        "strict_tabs": strict_tabs,
        "cases": cases,
        "questions": questions,
        "idx": 0,
        "answers": {},
        "started": now,
        "started_iso": datetime.now().isoformat(timespec="seconds"),
        "time_limit": limit,
        "deadline": now + limit if limit else None,
        "q_started": now,
        "phase": "question",  # question | feedback | done
        "timed_out": False,
        "img_cache": {},
        "settings": {"n_questions": n_questions, "strict_tabs": strict_tabs, "mode": mode, "section": section},
    }


def time_left(run) -> float | None:
    return None if run["deadline"] is None else run["deadline"] - time.time()


def record_answer(run, chosen: int | None, active_tab: str | None):
    q = run["questions"][run["idx"]]
    seconds = time.time() - run["q_started"]
    tab_ok = active_tab == q.payload["tab"]
    right_option = chosen == q.correct_index
    is_correct = right_option and (tab_ok or not run["strict_tabs"])
    if chosen is None:
        mistake = "unanswered"
    elif not right_option:
        mistake = q.option_tags[chosen]
    elif not is_correct:
        mistake = "wrong_tab"
    else:
        mistake = None
    run["answers"][run["idx"]] = {
        "chosen": chosen, "is_correct": is_correct, "mistake": mistake,
        "seconds": seconds, "tab_ok": tab_ok, "active_tab": active_tab,
    }


def advance(run):
    run["idx"] += 1
    run["q_started"] = time.time()
    run["phase"] = "question"
    if run["idx"] >= len(run["questions"]):
        finish(run)


def finish(run, timed_out: bool = False):
    if run["phase"] == "done":
        return
    run["phase"] = "done"
    run["timed_out"] = timed_out
    run["finished"] = time.time()
    qs = run["questions"]
    responses = []
    for i, q in enumerate(qs):
        a = run["answers"].get(i, {"chosen": None, "is_correct": False, "mistake": "unanswered", "seconds": None})
        responses.append({
            "q_index": i, "qtype": q.qtype, "prompt": q.prompt, "chosen": a["chosen"],
            "correct_index": q.correct_index, "is_correct": a["is_correct"],
            "mistake": a["mistake"], "seconds": a["seconds"],
        })
    answered = [r for r in responses if r["chosen"] is not None]
    n_correct = sum(r["is_correct"] for r in responses)
    used = run["finished"] - run["started"]
    if run["time_limit"]:
        used = min(used, run["time_limit"])
    secs = [r["seconds"] for r in answered if r["seconds"] is not None]
    attempt = {
        "started_at": run["started_iso"],
        "finished_at": datetime.now().isoformat(timespec="seconds"),
        "section": run["section"], "mode": run["mode"], "seed": run["seed"],
        "n_questions": len(qs), "n_answered": len(answered), "n_correct": n_correct,
        "n_wrong": len(answered) - n_correct, "time_limit_s": run["time_limit"], "time_used_s": used,
        "avg_seconds": sum(secs) / len(secs) if secs else None, "timed_out": timed_out,
    }
    run["summary"] = attempt
    run["responses"] = responses
    try:
        run["saved_id"] = storage.save_attempt(attempt, responses)
    except Exception as exc:  # never lose the results screen because of disk issues
        run["save_error"] = str(exc)


# ------------------------------------------------------------------ rendering helpers


def fig_png(fig) -> bytes:
    buf = io.BytesIO()
    fig.savefig(buf, format="png", bbox_inches="tight")
    plt.close(fig)
    return buf.getvalue()


def tab_table(tab: numerical.Tab) -> pd.DataFrame:
    data = {c: [tab.show(r, c) for r in tab.rows] for c in tab.cols}
    return pd.DataFrame(data, index=tab.rows)


def show_tab(run, case: numerical.Case, tab: numerical.Tab):
    st.caption(tab.unit)
    if tab.kind == "table":
        st.table(tab_table(tab))
    else:
        key = (case.cid, tab.key)
        if key not in run["img_cache"]:
            run["img_cache"][key] = fig_png(numerical.render_tab(tab))
        st.image(run["img_cache"][key], width="stretch")


@st.fragment(run_every=1)
def timer_widget():
    run = st.session_state.get("run")
    if not run or run["phase"] == "done" or run["deadline"] is None:
        return
    left = time_left(run)
    if left <= 0:
        st.rerun(scope="app")  # the main script sees the expired deadline and auto-submits
    m, s = divmod(int(left), 60)
    colour = "red" if left < 60 else "orange" if left < 180 else "inherit"
    st.markdown(f"<div style='font-size:1.6rem;font-weight:700;color:{colour};text-align:right'>⏱ {m:02d}:{s:02d}</div>",
                unsafe_allow_html=True)
    st.progress(max(0.0, left / run["time_limit"]))


def mistake_label(tag: str | None) -> str:
    return MISTAKE_LABELS.get(tag or "", tag or "")


# ------------------------------------------------------------------ pages


def page_start():
    st.title("Aon-style graduate assessment practice")
    st.write("Every test is generated fresh from a random seed. **Exam** mode is timed, with no feedback until the end. "
             "**Practice** mode is untimed and gives a worked solution after every question.")

    c1, c2 = st.columns([3, 2])
    with c1:
        section = st.radio(
            "Section", list(SECTIONS),
            format_func=lambda k: f"{SECTIONS[k]['label']}" + (f" ({SECTIONS[k]['minutes']} min)" if SECTIONS[k]["minutes"] else "")
            + ("" if SECTIONS[k]["available"] else " · coming soon"),
        )
        st.info(SECTIONS[section]["blurb"])
    with c2:
        mode = st.radio("Mode", ["exam", "practice"], format_func=str.capitalize, horizontal=True)
        n_q = st.slider("Number of questions", 8, 40, 24, step=4,
                        help="The real scales numerical has about 37 items in 12 min (~20 s each). "
                             "24 gives you 30 s per question; push it up as you get faster.")
        strict = st.checkbox("Strict tab rule", value=True,
                             help="On the real test, each question belongs to one tab. If you answer while a "
                                  "different tab is open, the answer is marked wrong even if the option is right.")
        seed_txt = st.text_input("Seed (optional)", "", help="Leave blank for a new random test. Enter a seed to replay one.")

    if mode == "exam":
        st.caption(f"⏱ {SECTIONS[section]['minutes']} minutes for {n_q} questions ≈ "
                   f"{SECTIONS[section]['minutes'] * 60 / n_q:.0f} s each. The section auto-submits when time runs out.")
    disabled = not SECTIONS[section]["available"]
    if st.button("Start", type="primary", disabled=disabled):
        seed = int(seed_txt) if seed_txt.strip().isdigit() else None
        start_run(section, mode, n_q, strict, seed)
        st.rerun()


def page_run(run):
    # Auto-submit on timeout. This is checked on every rerun, including the ones the timer triggers.
    left = time_left(run)
    if left is not None and left <= 0:
        finish(run, timed_out=True)
        st.rerun()

    q = run["questions"][run["idx"]]
    case = run["cases"][q.payload["case_id"]]
    n = len(run["questions"])

    h1, h2 = st.columns([3, 1])
    with h1:
        st.subheader(f"{SECTIONS[run['section']]['label']} · Question {run['idx'] + 1} of {n}")
        st.progress(run["idx"] / n)
    with h2:
        if run["deadline"] is not None:
            timer_widget()
        else:
            st.markdown("<div style='text-align:right;color:#888'>Practice · untimed</div>", unsafe_allow_html=True)

    left_col, right_col = st.columns([3, 2], gap="large")
    tab_key = f"tab_{run['id']}_{case.cid}"
    with left_col:
        st.markdown(f"#### {case.title}")
        tab_keys = [t.key for t in case.tabs]
        active = st.segmented_control(
            "Data tabs", tab_keys, format_func=lambda k: case.tab(k).title,
            default=tab_keys[0], key=tab_key, label_visibility="collapsed",
        ) or tab_keys[0]
        show_tab(run, case, case.tab(active))

    with right_col:
        home = case.tab(q.payload["tab"])
        st.caption(f"📑 This question belongs to the **{home.title}** tab")
        st.markdown(f"**{q.prompt}**")
        feedback = run["phase"] == "feedback"
        choice = st.radio(
            "Answer", list(range(len(q.options))), format_func=lambda i: q.options[i],
            index=None, key=f"ans_{run['id']}_{run['idx']}", label_visibility="collapsed", disabled=feedback,
        )
        if not feedback:
            b1, b2 = st.columns(2)
            if b1.button("Submit answer", type="primary", disabled=choice is None, width="stretch"):
                record_answer(run, choice, active)
                if run["mode"] == "practice":
                    run["phase"] = "feedback"
                else:
                    advance(run)
                st.rerun()
            if b2.button("Skip", width="stretch"):
                record_answer(run, None, active)
                if run["mode"] == "practice":
                    run["phase"] = "feedback"
                else:
                    advance(run)
                st.rerun()
        else:
            show_feedback(run, q, run["answers"][run["idx"]])
            if st.button("Next question →", type="primary"):
                advance(run)
                st.rerun()

    with st.sidebar:
        st.markdown(f"**Mode:** {run['mode'].capitalize()}  \n**Seed:** `{run['seed']}`")
        if st.button("End section now"):
            finish(run)
            st.rerun()
        if st.button("Abandon (don't save)"):
            del st.session_state["run"]
            st.rerun()


def show_feedback(run, q, ans):
    chosen = ans["chosen"]
    if ans["is_correct"]:
        st.success(f"✅ Correct: {q.correct_option}")
    elif chosen is None:
        st.warning(f"Skipped. The answer is **{q.correct_option}**.")
    elif ans["mistake"] == "wrong_tab":
        home = run["cases"][q.payload["case_id"]].tab(q.payload["tab"])
        st.error(f"Right number, but you had another tab open. On the real test this scores as wrong. "
                 f"Switch back to **{home.title}** before answering.")
    else:
        st.error(f"❌ You chose **{q.options[chosen]}**. The answer is **{q.correct_option}**.  \n"
                 f"_Likely mistake: {q.option_notes[chosen]}_")
    st.markdown("**Worked solution**")
    st.markdown("\n".join(f"{i}. {s}" for i, s in enumerate(q.explanation, 1)))
    with st.expander("Where every option comes from"):
        for opt, note in zip(q.options, q.option_notes):
            st.markdown(f"- **{opt}**: {note}")


def page_results(run):
    s = run["summary"]
    st.title("Results")
    if run["timed_out"]:
        st.warning("⏱ Time ran out. The section was submitted automatically.")
    if run.get("save_error"):
        st.error(f"Could not save this attempt: {run['save_error']}")
    elif run.get("saved_id"):
        st.caption(f"Saved as attempt #{run['saved_id']} · seed `{run['seed']}`")

    n, n_ans, n_ok = s["n_questions"], s["n_answered"], s["n_correct"]
    m = st.columns(5)
    m[0].metric("Score", f"{n_ok} / {n}", f"{n_ok / n:.0%}", delta_color="off")
    m[1].metric("Accuracy", f"{n_ok / n_ans:.0%}" if n_ans else "–", help="Correct ÷ answered")
    m[2].metric("Answered", f"{n_ans} / {n}")
    m[3].metric("Avg time / question", f"{s['avg_seconds']:.1f} s" if s["avg_seconds"] else "–")
    m[4].metric("Penalised score", f"{n_ok - s['n_wrong']}",
                help="Correct minus wrong. Some Aon tests penalise wrong answers, so guessing can cost you.")
    if run["time_limit"]:
        target = run["time_limit"] / n
        st.caption(f"Time used: {s['time_used_s'] / 60:.1f} of {run['time_limit'] / 60:.0f} min. "
                   f"Pace needed to finish: {target:.0f} s per question.")

    df = pd.DataFrame(run["responses"])
    df["result"] = df.apply(lambda r: "unanswered" if pd.isna(r["chosen"]) else ("correct" if r["is_correct"] else "wrong"), axis=1)

    c1, c2 = st.columns(2)
    with c1:
        st.markdown("#### By question type")
        by_type = (df.pivot_table(index="qtype", columns="result", values="q_index", aggfunc="count", fill_value=0)
                   .reindex(columns=["correct", "wrong", "unanswered"], fill_value=0))
        by_type["accuracy"] = (by_type["correct"] / (by_type["correct"] + by_type["wrong"]).replace(0, pd.NA)).map(
            lambda x: "–" if pd.isna(x) else f"{x:.0%}")
        st.dataframe(by_type.sort_values("wrong", ascending=False), width="stretch")
    with c2:
        st.markdown("#### Mistakes you made")
        wrong = df[df["result"] == "wrong"]
        if wrong.empty:
            st.success("No wrong answers. 🎉")
        else:
            counts = wrong["mistake"].map(mistake_label).value_counts()
            st.image(fig_png(charts.breakdown_figure(counts, "Wrong answers by likely mistake")))

    st.markdown("#### Review")
    for i, q in enumerate(run["questions"]):
        r = run["responses"][i]
        icon = {"correct": "✅", "wrong": "❌", "unanswered": "⬜"}[df.loc[i, "result"]]
        secs = f" · {r['seconds']:.0f}s" if r["seconds"] else ""
        with st.expander(f"{icon} Q{i + 1} · {q.qtype}{secs}: {q.prompt}"):
            case = run["cases"][q.payload["case_id"]]
            if r["chosen"] is not None:
                st.markdown(f"Your answer: **{q.options[r['chosen']]}**: {q.option_notes[r['chosen']]}")
                if r["mistake"] == "wrong_tab":
                    st.markdown(f"⚠️ Marked wrong under the strict tab rule. You answered with a different tab open than "
                                f"**{case.tab(q.payload['tab']).title}**.")
            st.markdown(f"Correct answer: **{q.correct_option}**")
            st.markdown("\n".join(f"{k}. {step}" for k, step in enumerate(q.explanation, 1)))

    b1, b2, _ = st.columns([1, 1, 3])
    if b1.button("New test (same settings)", type="primary"):
        cfg = run["settings"]
        start_run(cfg["section"], cfg["mode"], cfg["n_questions"], cfg["strict_tabs"], None)
        st.rerun()
    if b2.button("Back to start"):
        del st.session_state["run"]
        st.rerun()


def page_progress():
    st.title("Progress")
    attempts = storage.load_attempts()
    if attempts.empty:
        st.info("No attempts saved yet. Finish a section and it will show up here.")
        return
    st.image(fig_png(charts.progress_figure(attempts)))

    responses = storage.load_responses()
    c1, c2 = st.columns(2)
    recent_ids = attempts["id"].tail(10)
    recent = responses[responses["attempt_id"].isin(recent_ids)]
    with c1:
        wrong_types = recent[(recent["is_correct"] == 0) & recent["chosen"].notna()]["qtype"].value_counts()
        if not wrong_types.empty:
            st.image(fig_png(charts.breakdown_figure(wrong_types, "Wrong answers by question type (last 10 attempts)")))
    with c2:
        mistakes = recent[(recent["is_correct"] == 0) & recent["chosen"].notna()]["mistake"].map(mistake_label).value_counts()
        if not mistakes.empty:
            st.image(fig_png(charts.breakdown_figure(mistakes, "Most common mistakes (last 10 attempts)", "#E07B39")))

    st.markdown("#### All attempts")
    view = attempts[["finished_at", "section", "mode", "n_correct", "n_questions", "n_answered",
                     "score_pct", "accuracy", "avg_seconds", "timed_out", "seed"]].copy()
    view["score_pct"] = view["score_pct"].round(0)
    view["accuracy"] = (view["accuracy"] * 100).round(0)
    view["avg_seconds"] = view["avg_seconds"].round(1)
    st.dataframe(view.iloc[::-1], width="stretch", hide_index=True)
    d1, d2, _ = st.columns([1, 1, 3])
    d1.download_button("Download attempts.csv", attempts.to_csv(index=False), "attempts.csv", "text/csv")
    d2.download_button("Download responses.csv", responses.to_csv(index=False), "responses.csv", "text/csv")


# ------------------------------------------------------------------ main


def main():
    run = st.session_state.get("run")
    in_test = run is not None and run["phase"] != "done"
    page = "Test" if in_test else st.sidebar.radio("Go to", ["Test", "Progress"])
    if page == "Progress":
        page_progress()
    elif run is None:
        page_start()
    elif in_test:
        page_run(run)
    else:
        page_results(run)


main()
