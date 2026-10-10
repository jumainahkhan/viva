"""Revision plan, flashcards and the .ics study calendar."""

import uuid
from datetime import date, datetime, timedelta, timezone

from agents.professors import LANG_NAME
from gemini_client import generate
from schemas import FinalReport, RevisionPlan

SYSTEM = """You are a supportive study coach. Build a revision plan for a student from now until their oral exam.

Rules:
- sessions: between 3 and 10 study sessions, on dates strictly after today and on or before the exam date.
  Spread them out; put the weakest topics first and revisit them; the last session before the exam is a
  short mock oral exam. Each session 30-90 minutes with one concrete, specific goal.
- If the exam is very soon, fewer and shorter sessions.
- flashcards: 6 to 10 cards focused on the weakest topics. Front = a short question an examiner might ask;
  back = a crisp 1-3 sentence answer grounded in the course content. Only use content from the blueprint.
- Use ISO dates (YYYY-MM-DD) and the given topic ids.
- Write goal, front and back in {language}."""


async def revision_plan(session, report: FinalReport, today: date | None = None) -> RevisionPlan:
    today = today or date.today()
    exam_date = session.exam_date or today + timedelta(days=14)
    topics = "\n".join(
        f"- {t.id}: {t.title}. Key concepts: {'; '.join(t.key_concepts)}. "
        f"Strong answer includes: {'; '.join(t.strong_answer_includes)}"
        for t in session.blueprint.topics
    )
    feedback = "\n".join(f"- {p.topic_id}: score {p.score}/6. {p.feedback}" for p in report.per_topic)
    prompt = (
        f"Today: {today.isoformat()}\nExam date: {exam_date.isoformat()}\n"
        f"Course: {session.blueprint.course_title}\nTopics:\n{topics}\n\n"
        f"Mock exam grade: {report.grade}/6. Weakest topics: {', '.join(report.weakest_topics)}\n"
        f"Per-topic feedback:\n{feedback}"
    )
    plan = await generate(
        RevisionPlan, prompt, system=SYSTEM.format(language=LANG_NAME[session.language]), tier="fast"
    )
    # Keep only sessions inside the window, in date order.
    valid = []
    for s in plan.sessions:
        try:
            d = date.fromisoformat(s.date[:10])
        except ValueError:
            continue
        if today < d <= exam_date:
            s.date = d.isoformat()
            valid.append(s)
    plan.sessions = sorted(valid, key=lambda s: s.date)
    return plan


# --- .ics (RFC 5545) -------------------------------------------------------

def _escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


def _fold(line: str) -> str:
    """Fold lines longer than 75 octets, as RFC 5545 requires."""
    out, cur = [], ""
    for ch in line:
        if len((cur + ch).encode()) > 75:
            out.append(cur)
            cur = " " + ch
        else:
            cur += ch
    out.append(cur)
    return "\r\n".join(out)


def build_ics(plan: RevisionPlan, course: str, topic_titles: dict[str, str], start_hour: int = 18) -> str:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Viva//Oral Exam Coach//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:{_escape('Viva revision: ' + course)}",
    ]
    for s in plan.sessions:
        start = datetime.combine(date.fromisoformat(s.date), datetime.min.time()).replace(hour=start_hour)
        end = start + timedelta(minutes=s.duration_min)
        titles = ", ".join(topic_titles.get(t, t) for t in s.topic_ids)
        lines += [
            "BEGIN:VEVENT",
            f"UID:{uuid.uuid4()}@viva",
            f"DTSTAMP:{stamp}",
            f"DTSTART;TZID=Europe/Zurich:{start:%Y%m%dT%H%M%S}",
            f"DTEND;TZID=Europe/Zurich:{end:%Y%m%dT%H%M%S}",
            f"SUMMARY:{_escape('Revise: ' + titles)}",
            f"DESCRIPTION:{_escape(s.goal)}",
            "BEGIN:VALARM",
            "ACTION:DISPLAY",
            "TRIGGER:-PT15M",
            f"DESCRIPTION:{_escape('Study session: ' + titles)}",
            "END:VALARM",
            "END:VEVENT",
        ]
    lines.append("END:VCALENDAR")
    return "\r\n".join(_fold(l) for l in lines) + "\r\n"
