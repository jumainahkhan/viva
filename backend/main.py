"""Viva API. Run from backend/:  uv run uvicorn main:app --reload --port 8000"""

import logging
import struct
import time
import uuid
from datetime import date
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles

import config
import gradium_client
from agents.blueprint import build_blueprint, extract_pages
from agents.deliberation import final_report
from agents.professors import PERSONAS
from agents.revision import build_ics, revision_plan
from exam import SESSIONS, ExamSession
from schemas import ChairDecision, PanelConfig

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
log = logging.getLogger("viva.api")

app = FastAPI(title="Viva", description="Multi-agent oral exam panel (Gemini + Gradium)")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

SKIP_TEXT = {"en": "I'm not sure, could we move on?", "de": "Ich bin mir nicht sicher, können wir weitermachen?"}


# --- helpers ---------------------------------------------------------------

def _fix_wav_header(wav: bytes) -> bytes:
    """Gradium streams WAV with unknown-length headers; set real sizes so every browser can seek."""
    if wav[:4] != b"RIFF":
        return wav
    data_at = wav.find(b"data", 12)
    if data_at < 0:
        return wav
    data_len = len(wav) - (data_at + 8)
    return (
        wav[:4] + struct.pack("<I", len(wav) - 8) + wav[8:data_at + 4]
        + struct.pack("<I", data_len) + wav[data_at + 8:]
    )


# Questions waiting to be spoken: audio_id -> (text, voice_id). Synthesised on first GET.
_PENDING_AUDIO: dict[str, tuple[str, str]] = {}


def _speak(session: ExamSession, decision: ChairDecision) -> str:
    """Register the question for TTS in the speaker's voice and return its audio URL.

    The audio is streamed from Gradium when the browser requests it, so the question text
    reaches the student without waiting for synthesis.
    """
    audio_id = uuid.uuid4().hex
    _PENDING_AUDIO[audio_id] = (decision.question, config.VOICES[session.language][decision.next_speaker])
    return f"/api/audio/{audio_id}.wav"


def _turn_payload(session: ExamSession, decision: ChairDecision, audio_url: str) -> dict:
    return {
        "speaker": decision.next_speaker,
        "question": decision.question,
        "topic_id": decision.topic_id,
        "topic_title": session.topic(decision.topic_id).title,
        "reasoning": decision.reasoning,
        "audio_url": audio_url,
        "question_number": min(session.answered_count() + 1, session.num_questions),
        "total_questions": session.num_questions,
        "end_exam": decision.end_exam,
    }


def _get(session_id: str) -> ExamSession:
    session = SESSIONS.get(session_id)
    if not session:
        raise HTTPException(404, "This exam session has expired. Please start a new one.")
    return session


# --- routes ----------------------------------------------------------------

@app.get("/api/health")
async def health() -> dict:
    return {
        "status": "ok",
        "gemini_key": bool(config.GEMINI_API_KEY),
        "gradium_key": bool(config.GRADIUM_API_KEY),
        "models": {"fast": config.GEMINI_MODEL_FAST, "smart": config.GEMINI_MODEL_SMART},
    }


@app.post("/api/session")
async def create_session(
    pdf: UploadFile = File(...),
    exam_date: str | None = Form(None),
    num_questions: int = Form(6),
    language: str = Form("en"),
    panel: str | None = Form(None, description="JSON PanelConfig: per-professor strictness and a focus note"),
) -> dict:
    try:
        panel_config = PanelConfig.model_validate_json(panel) if panel else PanelConfig()
    except ValueError as e:
        raise HTTPException(400, "The panel settings were not valid.") from e
    data = await pdf.read()
    if not data.startswith(b"%PDF"):
        raise HTTPException(400, "That file doesn't look like a PDF. Please upload your lecture slides as a PDF.")
    if language not in config.LANGUAGES:
        language = "en"
    t0 = time.perf_counter()
    try:
        blueprint = await build_blueprint(data, language)
    except Exception as e:
        log.exception("blueprint failed")
        raise HTTPException(502, "We couldn't read your slides just now. Please try again in a moment.") from e
    if not blueprint.topics:
        raise HTTPException(422, "We couldn't find examinable topics in these slides. Try a different PDF.")

    session = ExamSession(
        blueprint=blueprint,
        pages=extract_pages(data),
        language=language,
        num_questions=max(2, min(10, num_questions)),
        exam_date=date.fromisoformat(exam_date) if exam_date else None,
        panel=panel_config,
    )
    SESSIONS[session.id] = session
    decision = await session.start()
    audio_url = _speak(session, decision)
    log.info("session %s ready in %.1fs", session.id, time.perf_counter() - t0)
    return {
        "session_id": session.id,
        "language": session.language,
        "blueprint": blueprint.model_dump(),
        "professors": [{"id": k, "name": v["name"], "tagline": v["tagline"]} for k, v in PERSONAS.items()],
        "panel": session.panel.model_dump(),
        "turn": _turn_payload(session, decision, audio_url),
    }


@app.post("/api/session/{session_id}/answer")
async def answer(
    session_id: str,
    audio: UploadFile | None = File(None),
    text: str | None = Form(None),
    skip: bool = Form(False),
) -> dict:
    session = _get(session_id)
    if session.answered_count() >= session.num_questions:
        raise HTTPException(409, "The exam is already over.")
    timings: dict[str, float] = {}

    if skip:
        transcript = SKIP_TEXT[session.language]
    elif audio is not None:
        t0 = time.perf_counter()
        raw = await audio.read()
        try:
            transcript = await gradium_client.stt(raw, language=session.language)
        except Exception as e:
            log.warning("STT failed: %s", e)
            raise HTTPException(502, "Sorry, we couldn't process that recording. Try again, or type your answer.") from e
        timings["stt_s"] = round(time.perf_counter() - t0, 2)
        if not transcript.strip():
            raise HTTPException(422, "I didn't quite catch that. Could you try again, a little closer to the mic?")
    elif text and text.strip():
        transcript = text.strip()
    else:
        raise HTTPException(400, "Please record or type an answer.")

    try:
        assessments, decision, agent_timings = await session.answer(transcript)
    except Exception as e:
        log.exception("panel failed")
        session.current_turn.answer = None  # let the student retry this turn
        raise HTTPException(502, "The panel lost its train of thought. Please send your answer again.") from e
    timings.update(agent_timings)

    audio_url = _speak(session, decision)
    log.info("turn timings %s", timings)

    return {
        "transcript": transcript,
        "assessments": [a.model_dump() for a in assessments],
        "turn": _turn_payload(session, decision, audio_url),
        "timings": timings,
    }


@app.post("/api/session/{session_id}/report")
async def report(session_id: str) -> dict:
    session = _get(session_id)
    if session.report:
        return session.report
    if session.answered_count() == 0:
        raise HTTPException(409, "Answer at least one question before asking for a report.")
    try:
        rep = await final_report(session)
        plan = await revision_plan(session, rep)
    except Exception as e:
        log.exception("report failed")
        raise HTTPException(502, "The panel couldn't agree just now. Please try again.") from e
    session.report = {
        "report": rep.model_dump(),
        "plan": plan.model_dump(),
        "ics_url": f"/api/session/{session.id}/calendar.ics",
        "course_title": session.blueprint.course_title,
        "topics": {t.id: t.title for t in session.blueprint.topics},
        "exam_date": session.exam_date.isoformat() if session.exam_date else None,
        "transcript": [t.model_dump() for t in session.turns if t.answer is not None],
        "panel": session.panel.model_dump(),
    }
    session.plan = plan
    return session.report


@app.get("/api/session/{session_id}/calendar.ics")
async def calendar(session_id: str) -> Response:
    session = _get(session_id)
    plan = session.plan
    if plan is None:
        raise HTTPException(409, "Generate the report first.")
    ics = build_ics(plan, session.blueprint.course_title, {t.id: t.title for t in session.blueprint.topics})
    return Response(
        ics,
        media_type="text/calendar",
        headers={"Content-Disposition": 'attachment; filename="viva-revision-plan.ics"'},
    )


@app.get("/api/audio/{audio_id}.wav")
async def audio(audio_id: str) -> Response:
    if not audio_id.isalnum():
        raise HTTPException(404, "Audio not found")
    path = config.AUDIO_DIR / f"{audio_id}.wav"
    if path.exists():
        return FileResponse(path, media_type="audio/wav")
    pending = _PENDING_AUDIO.get(audio_id)
    if pending is None:
        raise HTTPException(404, "Audio not found")
    text, voice = pending

    async def relay():
        chunks = []
        try:
            async for chunk in gradium_client.tts_stream(text, voice):
                chunks.append(chunk)
                yield chunk
        except Exception as e:  # the caption is already on screen; just end the audio
            log.warning("TTS stream failed: %s", e)
            return
        path.write_bytes(_fix_wav_header(b"".join(chunks)))  # cached for Replay
        _PENDING_AUDIO.pop(audio_id, None)

    return StreamingResponse(relay(), media_type="audio/wav")


# Serve the built frontend (frontend/dist) when present, for a one-command demo.
_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if _DIST.exists():
    app.mount("/", StaticFiles(directory=_DIST, html=True), name="frontend")
