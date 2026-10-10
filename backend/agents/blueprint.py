"""Turn lecture slides into an exam blueprint."""

from io import BytesIO

from pypdf import PdfReader

from gemini_client import generate, pdf_part
from schemas import Blueprint, Language

LANG_NAME = {"en": "English", "de": "German"}

SYSTEM = """You are the chair of an oral examination board at a Swiss university.
You receive a student's lecture slides and design the blueprint for a short oral exam on them.

Rules:
- Use ONLY content that appears in the slides. Never add material the lecture does not cover.
- Pick 3 to 6 examinable topics, ordered as they appear in the lecture. Skip admin slides (title, agenda, references).
- Topic ids are short snake_case slugs, e.g. "gradient_descent".
- key_concepts: 3-6 terms or ideas per topic.
- strong_answer_includes: 3-5 concrete points a top student would mention.
- common_misconceptions: 2-4 typical mistakes students make on this topic.
- slide_refs: 1-based page numbers where the topic is covered.
- Write all text in {language}."""


def extract_pages(pdf: bytes) -> list[str]:
    """Plain text per page (1-based index = list index + 1)."""
    reader = PdfReader(BytesIO(pdf))
    return [(page.extract_text() or "").strip() for page in reader.pages]


async def build_blueprint(pdf: bytes, language: Language = "en") -> Blueprint:
    pages = extract_pages(pdf)
    page_text = "\n\n".join(f"[Slide {i}]\n{t}" for i, t in enumerate(pages, 1) if t)
    contents = [
        pdf_part(pdf),
        "Extracted text per slide, for reference when citing slide numbers:\n\n" + page_text[:60_000],
        "Build the exam blueprint.",
    ]
    return await generate(
        Blueprint, contents, system=SYSTEM.format(language=LANG_NAME[language]), tier="smart", temperature=0.3
    )
