"""In-memory exam session state and the per-turn orchestration."""

import time
import uuid
from dataclasses import dataclass, field
from datetime import date

from agents import chair, professors
from schemas import Blueprint, ChairDecision, Language, ProfessorAssessment, RevisionPlan, Topic, Turn


@dataclass
class ExamSession:
    blueprint: Blueprint
    pages: list[str]
    language: Language = "en"
    num_questions: int = 6
    exam_date: date | None = None
    id: str = field(default_factory=lambda: uuid.uuid4().hex[:12])
    turns: list[Turn] = field(default_factory=list)
    report: dict | None = None
    plan: RevisionPlan | None = None

    # --- state helpers used by the agents ---

    @property
    def current_turn(self) -> Turn:
        return self.turns[-1]

    @property
    def current_topic(self) -> Topic:
        topic_id = self.turns[-1].topic_id if self.turns else self.blueprint.topics[0].id
        return self.topic(topic_id)

    def topic(self, topic_id: str) -> Topic:
        return next((t for t in self.blueprint.topics if t.id == topic_id), self.blueprint.topics[0])

    def slide_text(self, refs: list[int], limit: int = 6000) -> str:
        chunks = [f"[Slide {r}] {self.pages[r - 1]}" for r in refs if 0 < r <= len(self.pages)]
        return "\n".join(chunks)[:limit] or "(no slide text available)"

    def answered_count(self) -> int:
        return sum(1 for t in self.turns if t.answer is not None)

    def questions_on_current_topic(self) -> int:
        n = 0
        for t in reversed(self.turns):
            if t.topic_id != self.current_topic.id:
                break
            n += 1
        return n

    def covered_topic_ids(self) -> list[str]:
        return list(dict.fromkeys(t.topic_id for t in self.turns))

    def next_topic_id(self) -> str:
        covered = set(self.covered_topic_ids())
        for t in self.blueprint.topics:
            if t.id not in covered:
                return t.id
        # Every topic covered: revisit the one after the current topic.
        ids = [t.id for t in self.blueprint.topics]
        return ids[(ids.index(self.current_topic.id) + 1) % len(ids)]

    def transcript(self, last: int = 8) -> str:
        lines = []
        for t in self.turns[-last:]:
            lines.append(f"[{t.speaker}, topic {t.topic_id}] {t.question}")
            if t.answer is not None:
                lines.append(f"[student] {t.answer}")
        return "\n".join(lines) or "(exam not started)"

    # --- turn orchestration ---

    async def start(self) -> ChairDecision:
        decision = await chair.opening(self)
        self.turns.append(Turn(speaker=decision.next_speaker, question=decision.question,
                               topic_id=decision.topic_id, reasoning=decision.reasoning))
        return decision

    async def answer(self, text: str) -> tuple[list[ProfessorAssessment], ChairDecision, dict]:
        """Record the student's answer, run the panel, and queue the next question."""
        timings: dict[str, float] = {}
        self.current_turn.answer = text.strip() or "(no answer)"

        t0 = time.perf_counter()
        assessments = await professors.assess_all(self)
        timings["professors_s"] = round(time.perf_counter() - t0, 2)
        self.current_turn.assessments = assessments

        t0 = time.perf_counter()
        decision = await chair.decide(self, assessments)
        timings["chair_s"] = round(time.perf_counter() - t0, 2)

        if not decision.end_exam:
            self.turns.append(Turn(speaker=decision.next_speaker, question=decision.question,
                                   topic_id=decision.topic_id, reasoning=decision.reasoning))
        return assessments, decision, timings


SESSIONS: dict[str, ExamSession] = {}
