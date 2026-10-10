"""Thin async wrapper around google-genai with structured output and model fallback."""

import asyncio
import logging
from typing import TypeVar

from google import genai
from google.genai import errors, types
from pydantic import BaseModel

import config
from config import GEMINI_API_KEY, GEMINI_MODEL_FAST, GEMINI_MODEL_SMART

log = logging.getLogger("viva.gemini")
T = TypeVar("T", bound=BaseModel)

_client = (
    genai.Client(vertexai=True, project=config.GOOGLE_CLOUD_PROJECT, location=config.GOOGLE_CLOUD_LOCATION)
    if config.USE_VERTEX
    else genai.Client(api_key=GEMINI_API_KEY)
)

# Tried in order when a model is overloaded (503) or out of quota (429). Each model has its own
# quota, so the extra models keep the app running on a free-tier key (20 requests/day/model).
_LITE = "gemini-3.5-flash-lite"
_EXTRA = ["gemini-3-flash-preview", "gemini-3.1-flash-lite"]
CHAINS = {
    "lite": list(dict.fromkeys([_LITE, GEMINI_MODEL_FAST, *_EXTRA, GEMINI_MODEL_SMART])),
    "fast": list(dict.fromkeys([GEMINI_MODEL_FAST, "gemini-3-flash-preview", _LITE, GEMINI_MODEL_SMART, *_EXTRA])),
    "smart": list(dict.fromkeys([GEMINI_MODEL_SMART, GEMINI_MODEL_FAST, "gemini-3-flash-preview", _LITE, *_EXTRA])),
}

# Models that returned a daily-quota 429 are skipped for the rest of the process lifetime.
_EXHAUSTED: set[str] = set()
_RETRYABLE = {429, 500, 503, 504}


async def generate(
    schema: type[T],
    contents: list | str,
    *,
    system: str,
    tier: str = "fast",
    temperature: float = 0.7,
) -> T:
    """Call Gemini and parse the response into `schema`, falling back across models."""
    config = types.GenerateContentConfig(
        system_instruction=system,
        response_mime_type="application/json",
        response_schema=schema,
        temperature=temperature,
        thinking_config=types.ThinkingConfig(thinking_level="low"),
    )
    last_error: Exception | None = None
    for model in [m for m in CHAINS[tier] if m not in _EXHAUSTED] or CHAINS[tier]:
        for attempt in range(2):
            try:
                resp = await _client.aio.models.generate_content(model=model, contents=contents, config=config)
                if isinstance(resp.parsed, schema):
                    return resp.parsed
                return schema.model_validate_json(resp.text)
            except errors.APIError as e:
                last_error = e
                if e.code not in _RETRYABLE:
                    raise
                log.warning("%s attempt %d failed with %s", model, attempt + 1, e.code)
                if e.code == 429:  # per-model quota: waiting won't help, try the next model
                    if "PerDay" in str(e):
                        _EXHAUSTED.add(model)
                    break
                await asyncio.sleep(0.5)
            except ValueError as e:  # malformed JSON from the model
                last_error = e
                log.warning("%s returned unparsable output: %s", model, e)
    raise RuntimeError(f"All Gemini models failed: {last_error}")


def pdf_part(data: bytes) -> types.Part:
    return types.Part.from_bytes(data=data, mime_type="application/pdf")
