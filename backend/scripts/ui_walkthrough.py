"""Drive the real web UI in headless Chromium and screenshot every screen.

Uses typed answers (no mic in headless mode). Run from backend/ with the API on :8077:
    uv run --with playwright python scripts/ui_walkthrough.py [--chromium PATH] [--out DIR]
"""

import argparse
import asyncio
from pathlib import Path

from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parent.parent.parent
ANSWERS = [
    "Empirical risk is the average loss over the training examples, (1/n) times the sum of loss(f_w(x_i), y_i). "
    "We minimise it because the true risk over the real data distribution is unknown.",
    "Basically it's a very powerful paradigm that leverages gradients to kind of synergistically optimise things.",
    "The update rule is w becomes w minus eta times the gradient of L. If eta is too large it oscillates or diverges, "
    "if it is too small training is very slow.",
    "I'm not sure about that one, honestly.",
]


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--chromium", default=None)
    ap.add_argument("--out", default=str(ROOT / "backend" / "out" / "ui"))
    ap.add_argument("--url", default="http://localhost:8077")
    args = ap.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(executable_path=args.chromium, args=["--autoplay-policy=no-user-gesture-required"])
        page = await browser.new_page(viewport={"width": 1440, "height": 900})
        errors: list[str] = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: m.type == "error" and errors.append(m.text))

        await page.goto(args.url)
        await page.screenshot(path=out / "1_setup.png", full_page=True)

        await page.set_input_files("input[type=file]", str(ROOT / "samples" / "intro_ml_lecture.pdf"))
        await page.fill("#exam-date", "2026-10-28")
        await page.get_by_text("Tough").nth(2).click()  # Skeptic: tough
        await page.fill("#focus", "Focus on gradient descent, I'm weak there")
        await page.screenshot(path=out / "2_setup_filled.png", full_page=True)
        await page.get_by_role("button", name="Start exam").click()
        await page.wait_for_selector("text=Replay question", timeout=90_000)
        await page.screenshot(path=out / "3_exam_first_question.png", full_page=True)

        for i, answer in enumerate(ANSWERS):
            if await page.get_by_role("button", name="View results").count():
                break
            if await page.get_by_role("button", name="Type answer").count():
                await page.get_by_role("button", name="Type answer").click()
            await page.fill("#typed", answer)
            await page.get_by_role("button", name="Submit answer").click()
            await page.wait_for_selector("text=The panel is assessing your answer.", timeout=10_000)
            if i == 0:
                await page.screenshot(path=out / "4_exam_conferring.png", full_page=True)
            await page.wait_for_selector("text=The panel is assessing your answer.", state="detached", timeout=120_000)
            await page.screenshot(path=out / f"5_exam_after_answer_{i + 1}.png", full_page=True)

        await page.get_by_role("tab", name="Transcript").click()
        await page.screenshot(path=out / "6_exam_transcript_tab.png", full_page=True)
        await page.get_by_role("button", name="View results").click()
        await page.wait_for_selector("text=Examination record", timeout=120_000)
        await page.get_by_text("Show model answer").first.click()
        await page.screenshot(path=out / "7_report.png", full_page=True)

        await page.set_viewport_size({"width": 390, "height": 844})
        await page.screenshot(path=out / "8_report_mobile.png", full_page=True)

        print("Screenshots in", out)
        print("Browser errors:", errors or "none")
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
