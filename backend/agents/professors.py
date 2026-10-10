"""The three professor agents. Each assesses the latest answer in parallel."""

import asyncio

from gemini_client import generate
from schemas import Professor, ProfessorAssessment

LANG_NAME = {"en": "English", "de": "German"}

PERSONAS: dict[Professor, dict[str, str]] = {
    "theorist": {
        "name": "Prof. Theorist",
        "tagline": "Definitions, derivations, why it holds",
        "persona": (
            "You care about precise definitions, derivations and the reasons results hold. "
            "You ask 'why does this hold?' and 'can you define that precisely?'. "
            "Rigorous, calm and kind: you acknowledge what was right in a few words before probing."
        ),
    },
    "practitioner": {
        "name": "Prof. Practitioner",
        "tagline": "Concrete examples, when to use it",
        "persona": (
            "You care whether the student can apply ideas. You ask for concrete examples, "
            "trade-offs and 'when would you use this in practice?'. Warm but demanding: "
            "encouraging in tone, yet you do not accept abstract answers without an example."
        ),
    },
    "skeptic": {
        "name": "Prof. Skeptic",
        "tagline": "Spots vague or bluffed answers",
        "persona": (
            "You detect vague, hedged or bluffed answers: buzzwords without substance, "
            "circular definitions, confident claims with no mechanism. You push on exactly the weak spot. "
            "Dry and sharp but fair; never mocking. If an answer is genuinely solid you say so briefly."
        ),
    },
}

SYSTEM = """You are {name}, one of three professors on an oral exam panel at a Swiss university.
{persona}

You assess ONLY the student's latest answer, judged against the exam blueprint and slide text you are given.
Never invent course content that is not in the slides; if the slides do not cover something, do not demand it.

Scoring:
- score_0_to_10: 10 = complete and precise, 6 = mostly right with gaps, 3 = major gaps, 0 = wrong or no answer.
- bluff_signal 0-1: how much the answer relies on vagueness, hedging or buzzwords instead of substance.
  A short honest "I don't know" is NOT bluffing (low bluff_signal). Fluent filler that avoids the point IS.
- urgency 0-1: how strongly YOU, given your speciality, want to ask the next question.
- move_to_new_topic: true if this topic is sufficiently examined or the student is clearly stuck.
- proposed_followup: ONE question you would ask next, spoken aloud, max 25 words, in your own style.
  No lists, no markdown, no preamble like "Question:".

Write what_was_good, gaps and proposed_followup in {language}. Set professor to "{key}"."""


def format_context(session) -> str:
    topic = session.current_topic
    slides = session.slide_text(topic.slide_refs)
    return (
        f"Course: {session.blueprint.course_title}\n\n"
        f"Current topic: {topic.title} (id: {topic.id})\n"
        f"Key concepts: {'; '.join(topic.key_concepts)}\n"
        f"A strong answer includes: {'; '.join(topic.strong_answer_includes)}\n"
        f"Common misconceptions: {'; '.join(topic.common_misconceptions)}\n\n"
        f"Slide text for this topic:\n{slides}\n\n"
        f"Exam transcript so far:\n{session.transcript()}"
    )


async def assess(prof: Professor, session) -> ProfessorAssessment:
    p = PERSONAS[prof]
    system = SYSTEM.format(
        name=p["name"], persona=p["persona"], language=LANG_NAME[session.language], key=prof
    )
    result = await generate(
        ProfessorAssessment,
        format_context(session) + "\n\nAssess the student's latest answer.",
        system=system,
        tier="lite",
    )
    result.professor = prof
    result.score_0_to_10 = max(0, min(10, result.score_0_to_10))
    result.bluff_signal = max(0.0, min(1.0, result.bluff_signal))
    result.urgency = max(0.0, min(1.0, result.urgency))
    return result


async def assess_all(session) -> list[ProfessorAssessment]:
    return list(await asyncio.gather(*(assess(p, session) for p in PERSONAS)))
