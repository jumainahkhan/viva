"""Final panel deliberation and grade on the Swiss 1-6 scale."""

from agents.professors import LANG_NAME, PERSONAS
from gemini_client import generate
from schemas import FinalReport

SYSTEM = """You are a three-professor oral exam panel at a Swiss university, deliberating after the exam.
The professors: {personas}

Produce:
- deliberation: 4 to 6 short spoken lines (max 30 words each) between the professors, in character.
  They may disagree; the skeptic may argue for a lower grade, the practitioner may credit practical
  intuition. End with agreement on the grade.
- grade: Swiss scale 1 to 6 in 0.25 steps. 6 = excellent, 5 = good, 4 = sufficient (pass),
  below 4 = fail. Base it on the scores and the transcript; an honest "I don't know" is better than a bluff.
- summary: 2-3 sentences of honest overall analysis: knowledge, precision, and how the student communicated
  (e.g. hedging, bluffing, rambling, or clear and structured).
- strengths: 2 to 4 specific things the student did well (find genuine ones, even in a weak exam).
- improvements: 3 to 5 concrete, actionable things to work on, most important first. Each starts with a verb
  ("Learn the update rule w <- w - eta * grad L by heart", not "Improve your knowledge").
- answer_reviews: one entry for EVERY answered question, using its Q number. verdict = a 1-3 word label;
  what_to_improve = one or two specific sentences; stronger_answer = a concise model answer the student
  could have given aloud (2-4 sentences), grounded only in the lecture content.
- per_topic: one entry for every topic that was examined, with a 1-6 score and 1-2 sentences of
  constructive, specific feedback that points to what to revise.
- weakest_topics: topic ids that need the most revision, weakest first.

Address the student directly as "you" in summary, strengths, improvements, answer_reviews and per_topic
(the deliberation lines stay in character, professors talking to each other about "the student").
Be fair, specific and encouraging in tone, but do not inflate the grade.
Write all text in {language}."""


def _round_grade(g: float) -> float:
    return min(6.0, max(1.0, round(g * 4) / 4))


async def final_report(session) -> FinalReport:
    personas = "; ".join(f"{k}: {v['persona']}" for k, v in PERSONAS.items())
    scores, qa = [], []
    for i, t in enumerate(session.turns, 1):
        if t.answer is None:
            continue
        qa.append(f"Q{i} [{t.speaker}, topic {t.topic_id}]: {t.question}\nA{i}: {t.answer}")
        marks = ", ".join(f"{a.professor} {a.score_0_to_10}/10 (bluff {a.bluff_signal:.1f})" for a in t.assessments)
        gaps = "; ".join(g for a in t.assessments for g in a.gaps[:2])
        scores.append(f"Q{i} [{t.topic_id}] {marks}. Gaps noted: {gaps}")
    topics = "\n".join(f"- {t.id}: {t.title}" for t in session.blueprint.topics)
    prompt = (
        f"Course: {session.blueprint.course_title}\nTopics:\n{topics}\n\n"
        f"Numbered questions and answers:\n" + "\n\n".join(qa)
        + "\n\nPanel scores per question:\n" + "\n".join(scores)
    )
    report = await generate(
        FinalReport,
        prompt,
        system=SYSTEM.format(personas=personas, language=LANG_NAME[session.language]),
        tier="smart",
        temperature=0.5,
    )
    report.grade = _round_grade(report.grade)
    for pt in report.per_topic:
        pt.score = _round_grade(pt.score)
    return report
