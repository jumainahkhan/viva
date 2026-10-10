"""Gradium speech-to-text and text-to-speech over the REST API.

Docs: https://docs.gradium.ai/api-reference/endpoint/tts-post
      https://docs.gradium.ai/api-reference/endpoint/stt-post
"""

import asyncio
import json

import httpx

from config import GRADIUM_API_KEY, GRADIUM_BASE_URL

TIMEOUT = httpx.Timeout(60.0, connect=10.0)

# The account allows 2 concurrent Gradium sessions; queue anything beyond that.
_SESSIONS = asyncio.Semaphore(2)


class GradiumError(RuntimeError):
    pass


def _headers(**extra: str) -> dict[str, str]:
    if not GRADIUM_API_KEY:
        raise GradiumError("GRADIUM_API_KEY is not set")
    return {"x-api-key": GRADIUM_API_KEY, **extra}


async def tts(text: str, voice_id: str, output_format: str = "wav") -> bytes:
    """Synthesise `text` in `voice_id`; returns raw audio bytes (48 kHz WAV by default)."""
    payload = {"text": text, "voice_id": voice_id, "output_format": output_format, "only_audio": True}
    async with _SESSIONS, httpx.AsyncClient(timeout=TIMEOUT) as client:
        resp = await client.post(
            f"{GRADIUM_BASE_URL}/post/speech/tts",
            headers=_headers(**{"Content-Type": "application/json"}),
            json=payload,
        )
    if resp.status_code != 200:
        raise GradiumError(f"TTS failed ({resp.status_code}): {resp.text[:300]}")
    return resp.content


async def stt(audio: bytes, language: str = "en", content_type: str = "audio/wav") -> str:
    """Transcribe a complete audio file. Accepts WAV, raw PCM or Ogg-Opus (not WebM)."""
    params = {"json_config": json.dumps({"language": language})}
    async with _SESSIONS, httpx.AsyncClient(timeout=TIMEOUT) as client:
        resp = await client.post(
            f"{GRADIUM_BASE_URL}/post/speech/asr",
            headers=_headers(**{"Content-Type": content_type}),
            params=params,
            content=audio,
        )
    if resp.status_code != 200:
        raise GradiumError(f"STT failed ({resp.status_code}): {resp.text[:300]}")

    words: list[str] = []
    for line in resp.text.splitlines():
        if not line.strip():
            continue
        msg = json.loads(line)
        if msg.get("type") == "text":
            words.append(msg.get("text", ""))
        elif msg.get("type") == "error":
            raise GradiumError(f"STT stream error: {msg.get('message')}")
    return " ".join(w.strip() for w in words if w.strip())


async def list_voices(include_catalog: bool = True) -> list[dict]:
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        resp = await client.get(
            f"{GRADIUM_BASE_URL}/voices/",
            headers=_headers(),
            params={"include_catalog": str(include_catalog).lower(), "limit": 200},
        )
    if resp.status_code != 200:
        raise GradiumError(f"List voices failed ({resp.status_code}): {resp.text[:300]}")
    return resp.json()
