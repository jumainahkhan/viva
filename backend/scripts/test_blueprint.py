"""Milestone 1: build a blueprint from a PDF and print it.

Run from backend/:  uv run python scripts/test_blueprint.py [path.pdf] [en|de]
"""

import asyncio
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from agents.blueprint import build_blueprint  # noqa: E402

DEFAULT = Path(__file__).resolve().parent.parent.parent / "samples" / "intro_ml_lecture.pdf"


async def main() -> None:
    pdf = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT
    lang = sys.argv[2] if len(sys.argv) > 2 else "en"
    t0 = time.perf_counter()
    bp = await build_blueprint(pdf.read_bytes(), lang)
    print(bp.model_dump_json(indent=2))
    print(f"\n{len(bp.topics)} topics in {time.perf_counter() - t0:.1f}s")


if __name__ == "__main__":
    asyncio.run(main())
