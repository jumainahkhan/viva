"""Milestone 0: synthesise a line in every professor voice, then transcribe one back.

Run from backend/:  uv run python scripts/gradium_smoke_test.py
Outputs WAV files to backend/out/.
"""

import asyncio
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config import VOICES  # noqa: E402
from gradium_client import list_voices, stt, tts  # noqa: E402

OUT = Path(__file__).resolve().parent.parent / "out"
OUT.mkdir(exist_ok=True)

LINES = {
    "en": "Good afternoon. Could you explain why gradient descent converges on a convex function?",
    "de": "Guten Tag. Können Sie erklären, warum das Gradientenverfahren bei einer konvexen Funktion konvergiert?",
}


async def main() -> None:
    voices = await list_voices()
    by_id = {v["uid"]: v for v in voices}
    print(f"Gradium voices available: {len(voices)}")

    async def one(lang: str, prof: str, voice_id: str) -> Path:
        t0 = time.perf_counter()
        audio = await tts(LINES[lang], voice_id)
        path = OUT / f"{lang}_{prof}.wav"
        path.write_bytes(audio)
        name = by_id.get(voice_id, {}).get("name", "?")
        print(f"  TTS {lang} {prof:<12} {name:<12} {len(audio) / 1024:6.0f} KB  {time.perf_counter() - t0:.1f}s")
        return path

    jobs = [one(lang, prof, vid) for lang, profs in VOICES.items() for prof, vid in profs.items()]
    paths = await asyncio.gather(*jobs)

    for lang in ("en", "de"):
        sample = next(p for p in paths if p.name.startswith(lang))
        t0 = time.perf_counter()
        text = await stt(sample.read_bytes(), language=lang)
        print(f"  STT {lang} ({sample.name}, {time.perf_counter() - t0:.1f}s): {text!r}")

    print("\nGerman catalog voices (to compare picks):")
    for v in voices:
        if (v.get("language") or "").lower().startswith("de"):
            print(f"  {v['uid']}  {v['name']:<12} {(v.get('description') or '')[:70]}")


if __name__ == "__main__":
    asyncio.run(main())
