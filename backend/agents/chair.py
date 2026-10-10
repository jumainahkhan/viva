"""The chair decides who asks next and what. Hard rules are enforced in code."""

from agents.professors import LANG_NAME, PERSONAS
from gemini_client import generate
from schemas import ChairDecision, Professor, ProfessorAssessment

BLUFF_THRESHOLD = 0.6
MAX_QUESTIONS_PER_TOPIC = 2

SYSTEM = """You chair a three-professor oral exam panel at a Swiss university. You decide who speaks next
and write the exact words they will say aloud.

The professors:
- theorist: {theorist}
- practitioner: {practitioner}
- skeptic: {skeptic}

Write `question` as natural speech in the chosen professor's own style:
- At most 30 words. Exactly one question. No lists, no markdown, no stage directions.
- Theorist and practitioner may open with a very short acknowledgement ("Good.", "Right, thank you.").
  The skeptic is drier and may challenge directly ("You said X. What exactly do you mean?").
- If the topic changes, introduce it in a few words so the student knows we moved on.
- Ground every question in the blueprint and slides. Never ask about content the lecture does not cover.
- Write `question` in {language}. `reasoning` is a short internal note in English for the panel notes.

Obey every CONSTRAINT you are given exactly."""

OPENING_SYSTEM = """You chair a three-professor oral exam panel at a Swiss university.
Write the opening of the exam, spoken aloud by Prof. Theorist ({theorist}).
One short welcome sentence, then one clear opening question on the given topic. At most 40 words total.
No lists or markdown. Write `question` in {language}. Set next_speaker to "theorist", end_exam to false."""

CLOSING = {
    "en": "Thank you, that concludes the exam. The panel will now confer on your grade.",
    "de": "Vielen Dank, damit ist die Prüfung beendet. Die Kommission berät sich nun über Ihre Note.",
}


def _personas() -> dict[str, str]:
    return {k: v["persona"] for k, v in PERSONAS.items()}


async def opening(session) -> ChairDecision:
    topic = session.blueprint.topics[0]
    decision = await generate(
        ChairDecision,
        f"Course: {session.blueprint.course_title}\nOpening topic: {topic.title} (id: {topic.id})\n"
        f"Key concepts: {'; '.join(topic.key_concepts)}\n"
        f"Slide text:\n{session.slide_text(topic.slide_refs)}",
        system=OPENING_SYSTEM.format(language=LANG_NAME[session.language], **_personas()),
    )
    decision.next_speaker = "theorist"
    decision.topic_id = topic.id
    decision.end_exam = False
    return decision


def closing(session) -> ChairDecision:
    return ChairDecision(
        next_speaker="theorist",
        question=CLOSING[session.language],
        topic_id=session.current_topic.id,
        reasoning="Question limit reached.",
        end_exam=True,
    )


def constraints(session, assessments: list[ProfessorAssessment]) -> tuple[Professor | None, set[Professor], str | None]:
    """Return (forced_speaker, banned_speakers, forced_topic_id) from the panel rules."""
    recent = [t.speaker for t in session.turns[-2:]]
    banned: set[Professor] = {recent[0]} if len(recent) == 2 and recent[0] == recent[1] else set()

    forced: Professor | None = None
    max_bluff = max(a.bluff_signal for a in assessments)
    if max_bluff > BLUFF_THRESHOLD and "skeptic" not in banned:
        forced = "skeptic"

    move_votes = sum(a.move_to_new_topic for a in assessments)
    on_topic = session.questions_on_current_topic()
    forced_topic = None
    # A Skeptic follow-up on a bluff gets one extra question on the same topic.
    limit = MAX_QUESTIONS_PER_TOPIC + (1 if forced == "skeptic" else 0)
    if (move_votes >= 2 and forced != "skeptic") or on_topic >= limit:
        forced_topic = session.next_topic_id()
    return forced, banned, forced_topic


async def decide(session, assessments: list[ProfessorAssessment]) -> ChairDecision:
    if session.answered_count() >= session.num_questions:
        return closing(session)

    forced, banned, forced_topic = constraints(session, assessments)
    rules = [f"This is question {session.answered_count() + 1} of {session.num_questions}."]
    if forced:
        rules.append(f"CONSTRAINT: next_speaker MUST be {forced} (the answer looked vague or bluffed).")
    if banned:
        rules.append(f"CONSTRAINT: next_speaker must NOT be {', '.join(banned)} (spoke twice in a row).")
    if forced_topic and forced_topic != session.current_topic.id:
        t = session.topic(forced_topic)
        rules.append(
            f"CONSTRAINT: move to the new topic '{t.title}' (topic_id: {t.id}). "
            f"Key concepts: {'; '.join(t.key_concepts)}. Slide text:\n{session.slide_text(t.slide_refs)}"
        )
    else:
        rules.append(f"Stay on topic_id {session.current_topic.id} unless the panel clearly wants to move.")

    notes = "\n".join(
        f"- {a.professor}: score {a.score_0_to_10}/10, bluff {a.bluff_signal:.2f}, urgency {a.urgency:.2f}, "
        f"move_on={a.move_to_new_topic}. Good: {a.what_was_good} Gaps: {'; '.join(a.gaps) or 'none'}. "
        f"Proposed follow-up: {a.proposed_followup}"
        for a in assessments
    )
    topics = ", ".join(f"{t.id} ({t.title})" for t in session.blueprint.topics)
    prompt = (
        f"Course: {session.blueprint.course_title}\nAll topics: {topics}\n"
        f"Topics already examined: {', '.join(session.covered_topic_ids()) or 'none'}\n\n"
        f"Transcript:\n{session.transcript()}\n\nPanel assessments of the latest answer:\n{notes}\n\n"
        + "\n".join(rules)
    )
    decision = await generate(
        ChairDecision,
        prompt,
        system=SYSTEM.format(language=LANG_NAME[session.language], **_personas()),
    )

    # Enforce the hard rules even if the model ignored them.
    by_prof = {a.professor: a for a in assessments}
    if forced and decision.next_speaker != forced:
        decision.next_speaker = forced
        decision.question = by_prof[forced].proposed_followup
        decision.reasoning += f" [rule: {forced} forced]"
    if decision.next_speaker in banned:
        options = sorted((a for a in assessments if a.professor not in banned), key=lambda a: -a.urgency)
        decision.next_speaker = options[0].professor
        decision.question = options[0].proposed_followup
        decision.reasoning += " [rule: no three in a row]"
    valid_ids = {t.id for t in session.blueprint.topics}
    if forced_topic:
        decision.topic_id = forced_topic
    elif decision.topic_id not in valid_ids:
        decision.topic_id = session.current_topic.id
    decision.end_exam = False
    return decision
