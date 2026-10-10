"""Pydantic models. Most double as Gemini structured-output schemas."""

from typing import Literal

from pydantic import BaseModel, Field

Professor = Literal["theorist", "practitioner", "skeptic"]
Language = Literal["en", "de"]
Strictness = Literal["gentle", "balanced", "tough"]


class PanelConfig(BaseModel):
    """How the student tuned the panel on the Setup screen."""
    strictness: dict[Professor, Strictness] = Field(
        default_factory=lambda: {"theorist": "balanced", "practitioner": "balanced", "skeptic": "balanced"}
    )
    focus: str = Field("", max_length=400, description="Free-text instruction from the student to the panel")


# --- Blueprint -------------------------------------------------------------

class Topic(BaseModel):
    id: str
    title: str
    key_concepts: list[str]
    strong_answer_includes: list[str]
    common_misconceptions: list[str]
    slide_refs: list[int]


class Blueprint(BaseModel):
    course_title: str
    topics: list[Topic]


# --- Exam turn -------------------------------------------------------------

class ProfessorAssessment(BaseModel):
    professor: Professor
    score_0_to_10: int
    what_was_good: str
    gaps: list[str]
    bluff_signal: float = Field(description="0-1: vagueness, hedging, buzzwords without substance")
    proposed_followup: str = Field(description="One short spoken question, max ~25 words")
    urgency: float = Field(description="0-1: how much this professor wants the floor")
    move_to_new_topic: bool


class ChairDecision(BaseModel):
    next_speaker: Professor
    question: str = Field(description="Final spoken text, natural, max ~30 words")
    topic_id: str
    reasoning: str = Field(description="Shown in the panel notes, not spoken")
    end_exam: bool


# --- Final report ----------------------------------------------------------

class DeliberationLine(BaseModel):
    professor: Professor
    text: str


class TopicFeedback(BaseModel):
    topic_id: str
    score: float = Field(description="Swiss scale 1-6 for this topic")
    feedback: str


class AnswerReview(BaseModel):
    question_number: int
    verdict: str = Field(description="One short phrase, e.g. 'Solid', 'Vague', 'Partly right'")
    what_to_improve: str
    stronger_answer: str = Field(description="A concise model answer in 2-4 spoken sentences, grounded in the slides")


class FinalReport(BaseModel):
    deliberation: list[DeliberationLine]
    grade: float = Field(description="Swiss 1-6 scale, 0.25 steps, 4 = pass")
    summary: str = Field(description="2-3 sentence overall analysis of the performance")
    strengths: list[str]
    improvements: list[str] = Field(description="3-5 concrete, actionable things to work on, most important first")
    per_topic: list[TopicFeedback]
    answer_reviews: list[AnswerReview]
    weakest_topics: list[str]


class Flashcard(BaseModel):
    front: str
    back: str
    topic_id: str


class StudySession(BaseModel):
    date: str = Field(description="ISO date YYYY-MM-DD")
    duration_min: int
    topic_ids: list[str]
    goal: str


class RevisionPlan(BaseModel):
    sessions: list[StudySession]
    flashcards: list[Flashcard]


# --- Session state (not sent to Gemini) -----------------------------------

class Turn(BaseModel):
    speaker: Professor
    question: str
    topic_id: str
    answer: str | None = None
    assessments: list[ProfessorAssessment] = []
    reasoning: str = ""
