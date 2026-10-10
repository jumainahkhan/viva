"""Mock student agent: takes a full Viva exam through the real API, by voice, and checks the results.

A Gemini "student" with a chosen profile answers each question. In voice mode the answer is spoken
with Gradium TTS and uploaded as 24 kHz WAV, exactly like the browser does, so the whole STT -> panel
-> chair -> TTS loop is exercised.

Run from backend/ with the API running on :8077:
    uv run python scripts/simulate_student.py --profile bluffer
    uv run python scripts/simulate_student.py --profile strong --text --de
    uv run python scripts/simulate_student.py --profile weak --panel '{"strictness":{"skeptic":"tough"}}'
"""

import argparse
import asyncio
import io
import json
import sys
import time
import wave
from pathlib import Path

import httpx
from pydantic import BaseModel

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from agents.blueprint import extract_pages  # noqa: E402
from gemini_client import generate  # noqa: E402
from gradium_client import tts  # noqa: E402

API = "http://localhost:8077"
DEFAULT_PDF = Path(__file__).resolve().parent.parent.parent / "samples" / "intro_ml_lecture.pdf"
STUDENT_VOICE = {"en": "s_k3kLBbgeK9-xUg", "de": "2cx941cbFIXRc0ok"}  # Freddie / Wastl

PROFILES = {
    "strong": "You are a well-prepared student. Answer accurately and concisely using the lecture content, "
              "with the key definitions and one concrete example where it helps.",
    "bluffer": "You did not study. You try to sound impressive: confident buzzwords, vague generalities, "
               "never a precise definition or formula. Never admit you do not know.",
    "weak": "You studied a little. You get the gist of some answers but miss details, sometimes repeat a "
            "common misconception, and honestly say 'I'm not sure' when you really don't know.",
}


class StudentAnswer(BaseModel):
    answer: str


async def student_answer(profile: str, question: str, slides: str, history: list[str], lang: str) -> str:
    system = (
        f"You are a university student in a spoken oral exam. {PROFILES[profile]}\n"
        "Reply with what you would SAY aloud: 1-4 sentences, max 60 words, no lists or markdown. "
        f"Answer in {'German' if lang == 'de' else 'English'}."
    )
    prompt = (
        f"Lecture slides (what you could have studied):\n{slides[:8000]}\n\n"
        f"Exam so far:\n{chr(10).join(history[-6:]) or '(start)'}\n\nExaminer's question: {question}"
    )
    return (await generate(StudentAnswer, prompt, system=system, tier="fast", temperature=0.9)).answer


def pcm_to_wav(pcm: bytes, rate: int = 24000) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm)
    return buf.getvalue()


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--profile", choices=PROFILES, default="bluffer")
    ap.add_argument("--pdf", default=str(DEFAULT_PDF))
    ap.add_argument("--questions", type=int, default=4)
    ap.add_argument("--de", action="store_true")
    ap.add_argument("--text", action="store_true", help="send typed answers instead of voice")
    ap.add_argument("--panel", default="", help="PanelConfig JSON")
    args = ap.parse_args()
    lang = "de" if args.de else "en"
    pdf = Path(args.pdf).read_bytes()
    slides = "\n".join(f"[Slide {i}] {t}" for i, t in enumerate(extract_pages(pdf), 1))
    problems: list[str] = []
    rows = []

    async with httpx.AsyncClient(base_url=API, timeout=120) as api:
        t0 = time.perf_counter()
        form = {"num_questions": str(args.questions), "language": lang, "exam_date": "2026-10-28"}
        if args.panel:
            form["panel"] = args.panel
        r = await api.post("/api/session", files={"pdf": ("slides.pdf", pdf, "application/pdf")}, data=form)
        r.raise_for_status()
        s = r.json()
        sid, turn = s["session_id"], s["turn"]
        print(f"[{args.profile}] session {sid}: {s['blueprint']['course_title']} "
              f"({len(s['blueprint']['topics'])} topics) in {time.perf_counter() - t0:.1f}s  panel={s['panel']}")

        history: list[str] = []
        while True:
            # The browser would play the question: make sure the streamed audio really arrives.
            t0 = time.perf_counter()
            audio = await api.get(turn["audio_url"])
            audio_s = time.perf_counter() - t0
            if audio.status_code != 200 or len(audio.content) < 10_000:
                problems.append(f"Q{turn['question_number']} audio: HTTP {audio.status_code}, {len(audio.content)} B")
            print(f"\n  {turn['speaker'].upper():<12} [{turn['topic_id']}] {turn['question']}"
                  f"\n  {'':<12} (audio {len(audio.content) // 1024} KB in {audio_s:.1f}s)")
            if turn["end_exam"]:
                break

            answer = await student_answer(args.profile, turn["question"], slides, history, lang)
            history += [f"Examiner: {turn['question']}", f"Student: {answer}"]
            if args.text:
                r = await api.post(f"/api/session/{sid}/answer", data={"text": answer})
            else:
                wav = pcm_to_wav(await tts(answer, STUDENT_VOICE[lang], output_format="pcm_24000"))
                r = await api.post(f"/api/session/{sid}/answer", files={"audio": ("answer.wav", wav, "audio/wav")})
            if r.status_code != 200:
                problems.append(f"answer HTTP {r.status_code}: {r.text[:200]}")
                print(f"  ! {r.status_code} {r.text[:200]}")
                break
            res = r.json()
            print(f"  {'STUDENT':<12} said:  {answer}")
            if not args.text:
                print(f"  {'':<12} heard: {res['transcript']}")
            a = {x["professor"]: x for x in res["assessments"]}
            rows.append((turn["speaker"], res["turn"]["speaker"], max(x["bluff_signal"] for x in a.values()),
                         [a[p]["score_0_to_10"] for p in ("theorist", "practitioner", "skeptic")], res["timings"]))
            print(f"  {'':<12} scores T/P/S {rows[-1][3]}  max bluff {rows[-1][2]:.2f}  timings {res['timings']}")
            turn = res["turn"]

        t0 = time.perf_counter()
        r = await api.post(f"/api/session/{sid}/report")
        if r.status_code != 200:
            problems.append(f"report HTTP {r.status_code}: {r.text[:200]}")
            print(f"  ! report failed: {r.text[:300]}")
            report = None
        else:
            report = r.json()
        print(f"\nReport in {time.perf_counter() - t0:.1f}s")
        if report:
            rep, plan = report["report"], report["plan"]
            print(f"  Grade {rep['grade']}  |  {rep['summary']}")
            print("  Improve: " + " / ".join(rep["improvements"]))
            print(f"  {len(rep['answer_reviews'])} answer reviews, {len(plan['sessions'])} study sessions, "
                  f"{len(plan['flashcards'])} flashcards, {len(report['transcript'])} transcript turns")
            if len(rep["answer_reviews"]) != len(rows):
                problems.append(f"{len(rep['answer_reviews'])} answer reviews for {len(rows)} answers")
            ics = await api.get(report["ics_url"])
            n_events = ics.text.count("BEGIN:VEVENT")
            print(f"  .ics: HTTP {ics.status_code}, {n_events} events")
            if ics.status_code != 200 or n_events == 0:
                problems.append("calendar file missing or empty")

    # Behavioural checks on the panel.
    skeptic_after_bluff = [nxt == "skeptic" for _, nxt, bluff, _, _ in rows if bluff > 0.6]
    if args.profile == "bluffer" and not any(skeptic_after_bluff):
        problems.append("Skeptic never took the floor after a bluffed answer")
    speakers = [turn_speaker for turn_speaker, *_ in rows]
    if any(speakers[i] == speakers[i + 1] == speakers[i + 2] for i in range(len(speakers) - 2)):
        problems.append("A professor spoke three turns in a row")

    print("\nRESULT:", "PASS" if not problems else "ISSUES")
    for p in problems:
        print("  -", p)
    print(json.dumps({"profile": args.profile, "grade": report and report["report"]["grade"],
                      "problems": problems}))


if __name__ == "__main__":
    asyncio.run(main())
