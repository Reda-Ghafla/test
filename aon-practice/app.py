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
from generators import inductive, numerical, personality, verbal

st.set_page_config(page_title="Aon-style Practice Tests", page_icon="⏱️", layout="wide")

SECTIONS = {
    "numerical": {"label": "Numerical reasoning", "minutes": 12,
                  "blurb": "Data on several tabs (tables and charts). Find the right figures and calculate. "
                           "5 options, one correct. A calculator and scrap paper are allowed."},
    "inductive": {"label": "Inductive reasoning", "minutes": 8,
                  "blurb": "Mostly rows of 9 figures that follow hidden rules (direction, corner square, dots, colour, "
                           "size). Pick the one figure that breaks a rule. Some questions are 3×3 grids with a "
                           "missing cell instead."},
    "verbal": {"label": "Verbal reasoning", "minutes": 12,
               "blurb": "Short business passages. Mark each statement True, False or Cannot say, using only the "
                        "passage, never outside knowledge."},
    "personality": {"label": "Personality (practice)", "minutes": None,
                    "blurb": "Unscored. A short questionnaire so the format is familiar on the day. Answers are "
                             "not saved."},
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
    "missed_rotation": "Missed the direction rule",
    "missed_position": "Missed the corner-square rule",
    "missed_count": "Missed the dots rule",
    "missed_colour": "Missed the colour rule",
    "missed_size": "Missed the size rule",
    "assumed_info": "Went beyond the text (answer was Cannot say)",
    "too_cautious": "Too cautious (chose Cannot say)",
    "misread": "Misread (True ↔ False)",
    "unanswered": "Not answered",
}


# ------------------------------------------------------------------ run state


def start_run(section: str, mode: str, n_questions: int, strict_tabs: bool, seed: int | None):
    """n_questions means passages for verbal and statements for personality."""
    seed = seed if seed is not None else random.randrange(1, 10**9)
    cases: dict = {}
    if section == "numerical":
        cases, questions = numerical.generate_test(seed, n_questions=n_questions)
    elif section == "inductive":
        questions = inductive.generate_test(seed, n_questions=n_questions)
        strict_tabs = False
    elif section == "verbal":
        cases, questions = verbal.generate_test(seed, n_passages=n_questions)
        strict_tabs = False
    else:
        questions = []
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
    tab_ok = active_tab == q.payload.get("tab", active_tab)
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


def inductive_images(run, i: int) -> dict:
    key = ("ind", i)
    if key not in run["img_cache"]:
        figs = inductive.render(run["questions"][i])
        run["img_cache"][key] = {k: fig_png(f) if f is not None else None for k, f in figs.items()}
    return run["img_cache"][key]


def show_inductive(run, i: int):
    imgs = inductive_images(run, i)
    if imgs["options"] is None:
        st.image(imgs["main"], width="stretch")
    else:
        c1, c2 = st.columns([2, 3])
        c1.image(imgs["main"], width="stretch")
        with c2:
            st.caption("Options")
            st.image(imgs["options"], width="stretch")


def show_passage(passage: dict):
    st.markdown(f"#### {passage['title']}")
    st.markdown(f"<div style='line-height:1.65;font-size:1.02rem'>{passage['text']}</div>", unsafe_allow_html=True)


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
            format_func=lambda k: f"{SECTIONS[k]['label']}" + (f" ({SECTIONS[k]['minutes']} min)" if SECTIONS[k]["minutes"] else ""),
        )
        st.info(SECTIONS[section]["blurb"])
    strict = False
    with c2:
        if section == "personality":
            mode = "practice"
            fmt = st.radio("Format", ["likert", "paired"], horizontal=True,
                           format_func={"likert": "Agree / disagree scale", "paired": "Paired statements (ADEPT-15 style)"}.get)
            n_q = st.slider("Number of statements" if fmt == "likert" else "Number of pairs",
                            6, 30 if fmt == "likert" else 15, 20 if fmt == "likert" else 10)
        else:
            mode = st.radio("Mode", ["exam", "practice"], format_func=str.capitalize, horizontal=True)
            if section == "numerical":
                n_q = st.slider("Number of questions", 8, 40, 24, step=4,
                                help="The real scales numerical has about 37 items in 12 min (~20 s each). "
                                     "24 gives you 30 s per question; push it up as you get faster.")
                strict = st.checkbox("Strict tab rule", value=True,
                                     help="On the real test, each question belongs to one tab. If you answer while a "
                                          "different tab is open, the answer is marked wrong even if the option is right.")
            elif section == "inductive":
                n_q = st.slider("Number of puzzles", 8, 30, 16, step=2,
                                help="16 puzzles in 8 minutes gives 30 s each. Later puzzles are more likely to have 2 rules.")
            else:
                n_bank = len(verbal.load_bank())
                n_q = st.slider("Number of passages", 3, n_bank, min(12, n_bank),
                                help="Each passage has 3 statements. 12 passages = 36 statements in 12 minutes (20 s each). "
                                     "Add your own passages to data/verbal_bank.json.")
        seed_txt = st.text_input("Seed (optional)", "", help="Leave blank for a new random test. Enter a seed to replay one.")

    if section != "personality" and mode == "exam":
        n_items = n_q * 3 if section == "verbal" else n_q
        st.caption(f"⏱ {SECTIONS[section]['minutes']} minutes for {n_items} {'statements' if section == 'verbal' else 'questions'} ≈ "
                   f"{SECTIONS[section]['minutes'] * 60 / n_items:.0f} s each. The section auto-submits when time runs out.")
    if st.button("Start", type="primary"):
        seed = int(seed_txt) if seed_txt.strip().isdigit() else None
        if section == "personality":
            start_personality(fmt, n_q, seed)
        else:
            start_run(section, mode, n_q, strict, seed)
        st.rerun()


def page_run(run):
    # Auto-submit on timeout. This is checked on every rerun, including the ones the timer triggers.
    left = time_left(run)
    if left is not None and left <= 0:
        finish(run, timed_out=True)
        st.rerun()

    q = run["questions"][run["idx"]]
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

    active = None
    section = run["section"]
    if section == "numerical":
        case = run["cases"][q.payload["case_id"]]
        left_col, right_col = st.columns([3, 2], gap="large")
        with left_col:
            st.markdown(f"#### {case.title}")
            tab_keys = [t.key for t in case.tabs]
            active = st.segmented_control(
                "Data tabs", tab_keys, format_func=lambda k: case.tab(k).title,
                default=tab_keys[0], key=f"tab_{run['id']}_{case.cid}", label_visibility="collapsed",
            ) or tab_keys[0]
            show_tab(run, case, case.tab(active))
        with right_col:
            st.caption(f"📑 This question belongs to the **{case.tab(q.payload['tab']).title}** tab")
            answer_block(run, q, active, horizontal=False)
    elif section == "inductive":
        st.markdown(f"**{q.prompt}**")
        show_inductive(run, run["idx"])
        answer_block(run, q, None, horizontal=True)
    else:
        passage = run["cases"][q.payload["passage_id"]]
        left_col, right_col = st.columns([3, 2], gap="large")
        with left_col:
            show_passage(passage)
        with right_col:
            k = sum(1 for qq in run["questions"][: run["idx"]] if qq.payload["passage_id"] == q.payload["passage_id"])
            st.caption(f"Statement {k + 1} of 3 for this passage")
            answer_block(run, q, None, horizontal=True)

    with st.sidebar:
        st.markdown(f"**Mode:** {run['mode'].capitalize()}  \n**Seed:** `{run['seed']}`")
        if st.button("End section now"):
            finish(run)
            st.rerun()
        if st.button("Abandon (don't save)"):
            del st.session_state["run"]
            st.rerun()


def answer_block(run, q, active, horizontal: bool):
    """Options, Submit/Skip, and (in practice mode) the feedback panel."""
    if run["section"] != "inductive":
        st.markdown(f"**{q.prompt}**")
    feedback = run["phase"] == "feedback"
    choice = st.radio(
        "Answer", list(range(len(q.options))), format_func=lambda i: q.options[i],
        index=None, key=f"ans_{run['id']}_{run['idx']}", label_visibility="collapsed", disabled=feedback,
        horizontal=horizontal,
    )
    if feedback:
        show_feedback(run, q, run["answers"][run["idx"]])
        if st.button("Next question →", type="primary"):
            advance(run)
            st.rerun()
        return
    b1, b2 = st.columns(2)
    submit = b1.button("Submit answer", type="primary", disabled=choice is None, width="stretch")
    skip = b2.button("Skip", width="stretch")
    if submit or skip:
        record_answer(run, choice if submit else None, active)
        if run["mode"] == "practice":
            run["phase"] = "feedback"
        else:
            advance(run)
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
    if run["section"] == "numerical" or (run["section"] == "inductive" and q.payload["format"] == "matrix"):
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
        title = q.prompt if run["section"] != "inductive" else ""
        with st.expander(f"{icon} Q{i + 1} · {q.qtype}{secs}{': ' + title if title else ''}"):
            if run["section"] == "inductive":
                show_inductive(run, i)
            elif run["section"] == "verbal":
                p = run["cases"][q.payload["passage_id"]]
                st.caption(f"{p['title']}: {p['text']}")
            if r["chosen"] is not None:
                st.markdown(f"Your answer: **{q.options[r['chosen']]}**: {q.option_notes[r['chosen']]}")
                if r["mistake"] == "wrong_tab":
                    case = run["cases"][q.payload["case_id"]]
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


def start_personality(fmt: str, n: int, seed: int | None):
    seed = seed if seed is not None else random.randrange(1, 10**9)
    items = personality.likert_block(seed, n) if fmt == "likert" else personality.paired_block(seed, n)
    st.session_state.run = {"id": uuid.uuid4().hex[:8], "section": "personality", "format": fmt,
                            "items": items, "phase": "question", "seed": seed, "started": time.time()}


def page_personality(run):
    st.title("Personality questionnaire (practice)")
    st.caption("Unscored and not saved. The goal is to get used to the format. There are no right answers.")
    if run["phase"] == "question":
        with st.form(f"pers_{run['id']}"):
            answers = {}
            if run["format"] == "likert":
                for k, (text, _, _) in enumerate(run["items"], 1):
                    answers[text] = st.radio(f"{k}. {text}", list(range(5)), format_func=lambda i: personality.LIKERT[i],
                                             index=None, horizontal=True, key=f"p_{run['id']}_{k}")
            else:
                st.markdown("For each pair, slide towards the statement that is **more like you**.")
                scale = ["Much more A", "A", "Both equally", "B", "Much more B"]
                for k, (a, b) in enumerate(run["items"], 1):
                    st.markdown(f"**{k}.** A: _{a[0]}_  \nB: _{b[0]}_")
                    answers[k] = st.select_slider(f"Pair {k}", scale, value="Both equally",
                                                  key=f"p_{run['id']}_{k}", label_visibility="collapsed")
            submitted = st.form_submit_button("Finish", type="primary")
        if submitted:
            missing = [k for k, v in answers.items() if v is None]
            if missing:
                st.warning(f"{len(missing)} statement(s) not answered yet.")
            else:
                run["answers"] = answers
                run["phase"] = "done"
                run["seconds"] = time.time() - run["started"]
                st.rerun()
        if st.button("Back to start"):
            del st.session_state["run"]
            st.rerun()
        return

    n = len(run["items"])
    st.success(f"Done: {n} items in {run['seconds']:.0f} s ({run['seconds'] / n:.1f} s per item).")
    if run["format"] == "likert":
        answers = run["answers"]
        dist = pd.Series([personality.LIKERT[v] for v in answers.values()]).value_counts().reindex(
            personality.LIKERT, fill_value=0)
        c1, c2 = st.columns(2)
        with c1:
            st.markdown("#### How you used the scale")
            st.bar_chart(dist, horizontal=True)
            if dist["Neutral"] > n / 2:
                st.info("You answered 'Neutral' a lot. Real questionnaires give employers less to go on when you do this.")
        with c2:
            st.markdown("#### Consistency check")
            flags = personality.consistency_flags(answers)
            if flags:
                st.warning("You agreed with statements that point in opposite directions:")
                for a, b in flags:
                    st.markdown(f"- _{a}_  \n  and _{b}_")
            else:
                st.success("No contradictions between oppositely worded statements.")
        st.markdown("#### Your answers by work-style theme")
        rows = []
        for text, dim, rev in run["items"]:
            v = answers[text]
            rows.append({"Theme": dim, "Statement": text, "Your answer": personality.LIKERT[v],
                         "Reverse-worded": "yes" if rev else ""})
        st.dataframe(pd.DataFrame(rows).sort_values("Theme"), hide_index=True, width="stretch")
    else:
        rows = [{"A": a[0], "B": b[0], "Your choice": run["answers"][k]} for k, (a, b) in enumerate(run["items"], 1)]
        st.dataframe(pd.DataFrame(rows), hide_index=True, width="stretch")
        equal = sum(1 for v in run["answers"].values() if v == "Both equally")
        if equal > n / 2:
            st.info("You chose 'Both equally' for most pairs. In forced-choice formats, try to commit to a preference.")
    st.markdown("#### Tips")
    for t in personality.TIPS:
        st.markdown(f"- {t}")
    b1, b2, _ = st.columns([1, 1, 3])
    if b1.button("Another set", type="primary"):
        start_personality(run["format"], n, None)
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
    elif run is not None and run["section"] == "personality":
        page_personality(run)
    elif run is None:
        page_start()
    elif in_test:
        page_run(run)
    else:
        page_results(run)


main()
