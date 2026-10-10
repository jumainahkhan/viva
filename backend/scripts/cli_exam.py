"""Text-only exam in the terminal: the backup demo.

Run from backend/:  uv run python scripts/cli_exam.py [path.pdf] [--de] [--questions N] [--report]
"""

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from agents.blueprint import build_blueprint, extract_pages  # noqa: E402
from exam import ExamSession  # noqa: E402

DEFAULT = Path(__file__).resolve().parent.parent.parent / "samples" / "intro_ml_lecture.pdf"
NAMES = {"theorist": "Prof. Theorist", "practitioner": "Prof. Practitioner", "skeptic": "Prof. Skeptic"}


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", nargs="?", default=str(DEFAULT))
    ap.add_argument("--de", action="store_true")
    ap.add_argument("--questions", type=int, default=4)
    ap.add_argument("--report", action="store_true", help="generate the final report at the end")
    args = ap.parse_args()

    pdf = Path(args.pdf).read_bytes()
    lang = "de" if args.de else "en"
    print("Reading your slides and building the exam blueprint...")
    bp = await build_blueprint(pdf, lang)
    print(f"\n{bp.course_title}: " + ", ".join(t.title for t in bp.topics))

    s = ExamSession(blueprint=bp, pages=extract_pages(pdf), language=lang, num_questions=args.questions)
    d = await s.start()
    while True:
        print(f"\n\033[1m{NAMES[d.next_speaker]}\033[0m [{d.topic_id}]: {d.question}")
        if d.end_exam:
            break
        ans = input("\n\033[36mYou:\033[0m ")
        print("  (the panel is conferring...)")
        assessments, d, timings = await s.answer(ans)
        for a in assessments:
            print(f"  · {a.professor:<12} score {a.score_0_to_10:>2}/10  bluff {a.bluff_signal:.2f}  "
                  f"urgency {a.urgency:.2f}  move={a.move_to_new_topic}")
        print(f"  · chair: {d.reasoning}  ({timings})")

    if args.report:
        from agents.deliberation import final_report
        print("\nThe panel is deliberating...")
        report = await final_report(s)
        for line in report.deliberation:
            print(f"  {NAMES[line.professor]}: {line.text}")
        print(f"\nGrade: {report.grade}   Strengths: {'; '.join(report.strengths)}")
        for pt in report.per_topic:
            print(f"  [{pt.topic_id}] {pt.score}: {pt.feedback}")

        from datetime import date, timedelta
        from agents.revision import build_ics, revision_plan
        s.exam_date = s.exam_date or date.today() + timedelta(days=10)
        plan = await revision_plan(s, report)
        for st in plan.sessions:
            print(f"  {st.date} {st.duration_min}min {st.topic_ids}: {st.goal}")
        print(f"  {len(plan.flashcards)} flashcards, e.g. {plan.flashcards[0].front if plan.flashcards else '-'}")
        ics = build_ics(plan, bp.course_title, {t.id: t.title for t in bp.topics})
        out = Path(__file__).resolve().parent.parent / "out" / "revision.ics"
        out.write_text(ics)
        print(f"  wrote {out}")


if __name__ == "__main__":
    asyncio.run(main())
