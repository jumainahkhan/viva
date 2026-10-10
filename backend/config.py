"""Environment configuration. Reads the repo-root .env file."""

import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
# Optional: use Google Cloud credits through Vertex AI instead of an AI Studio key.
# Requires `gcloud auth application-default login` and a project with the Vertex AI API enabled.
GOOGLE_CLOUD_PROJECT = os.getenv("GOOGLE_CLOUD_PROJECT", "")
GOOGLE_CLOUD_LOCATION = os.getenv("GOOGLE_CLOUD_LOCATION", "global")
USE_VERTEX = os.getenv("GEMINI_USE_VERTEX", "").lower() in ("1", "true", "yes") and bool(GOOGLE_CLOUD_PROJECT)
GRADIUM_API_KEY = os.getenv("GRADIUM_API_KEY", "")

GEMINI_MODEL_FAST = os.getenv("GEMINI_MODEL_FAST") or "gemini-3.8-flash"
GEMINI_MODEL_SMART = os.getenv("GEMINI_MODEL_SMART") or "gemini-3.1-pro-preview"

GRADIUM_BASE_URL = "https://api.gradium.ai/api"

PROFESSORS = ("theorist", "practitioner", "skeptic")
LANGUAGES = ("en", "de")

VOICES: dict[str, dict[str, str]] = {
    lang: {p: os.getenv(f"VOICE_{p.upper()}_{lang.upper()}", "") for p in PROFESSORS}
    for lang in LANGUAGES
}

AUDIO_DIR = Path(__file__).resolve().parent / "audio_cache"
AUDIO_DIR.mkdir(exist_ok=True)
