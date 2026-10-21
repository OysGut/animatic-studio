"""Python Playwright fallback for the encoder-only B-105a check."""
import asyncio
import sys
from pathlib import Path
from playwright.async_api import async_playwright


async def main():
    base = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080"
    output = Path(sys.argv[2] if len(sys.argv) > 2 else "/tmp/browser/b105a-adapter")
    output.mkdir(parents=True, exist_ok=True)
    source = Path(__file__).with_suffix(".mjs").read_text()
    expression = source.split("const result = await page.evaluate(")[1].split("\n  });\n  check(")[0] + "\n  }"
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 1280, "height": 1800})
        try:
            await page.goto(base, wait_until="domcontentloaded")
            result = await page.evaluate(expression)
            checks = [
                (result["originalUnchanged"], "Originalens fil og SHA-256 er uendret"),
                (result["sizes"]["original"] == [6000, 4000], "Originalen beholder 6000 × 4000"),
                (result["sizes"]["working"] == [3840, 2560], "Arbeidskopien har 3840 × 2560"),
                (result["sizes"]["proxy"] == [1920, 1280], "Proxyen har 1920 × 1280"),
                (result["sizes"]["thumbnail"] == [256, 171], "Miniatyren har 256 × 171"),
                (result["proxyMime"] == result["thumbnailMime"] == "image/webp", "Begge avledede filer er WebP"),
            ]
            for passed, description in checks:
                print(f" {'ok' if passed else 'FEIL'} {description}")
            await page.screenshot(path=str(output / "encoded-images.png"))
            failed = sum(not passed for passed, _ in checks)
            print(f"RESULTAT {len(checks) - failed} bestått, {failed} feilet")
            if failed:
                raise SystemExit(1)
        finally:
            await browser.close()


asyncio.run(main())