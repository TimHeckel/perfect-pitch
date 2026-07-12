import { chromium, type Page } from "playwright";
import path from "path";
import fs from "fs";

const OUTPUT_DIR = path.join(__dirname, "..", "android", "play-store-screenshots");

const VIEWPORTS = [
  { name: "phone", width: 393, height: 851 },
  { name: "tablet", width: 800, height: 1280 },
];

async function setupPage(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem(
      "bsharp_session_history",
      JSON.stringify({ "100": { chord: [{ identifications: 1 }] } }),
    );
    (window as any).__bsharp_test_deterministic_color = "red";
  });
  await page.goto("http://localhost:8080");
  // Dismiss play onboarding overlay
  await page.locator("#onboarding-overlay").evaluate((el) => {
    el.classList.remove("visible");
  });
}

async function captureMainGame(page: Page, outputPath: string): Promise<void> {
  await setupPage(page);
  await page.locator("#play-button").click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: outputPath });
  console.log(`  Saved ${outputPath}`);
}

async function captureCorrectAnswer(page: Page, outputPath: string): Promise<void> {
  await setupPage(page);
  await page.locator("#play-button").click();
  await page.waitForTimeout(1000);
  // Red is the forced color, so clicking red is correct
  await page.locator("#red-flag .flag").click();
  await page.waitForSelector("#red-flag .flag.flag-correct", { timeout: 5000 });
  await page.screenshot({ path: outputPath });
  console.log(`  Saved ${outputPath}`);
}

async function main(): Promise<void> {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const browser = await chromium.launch();

  for (const vp of VIEWPORTS) {
    console.log(`Capturing ${vp.name} (${vp.width}x${vp.height})...`);
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
    });

    const page1 = await context.newPage();
    await captureMainGame(page1, path.join(OUTPUT_DIR, `${vp.name}-main-game.png`));

    const page2 = await context.newPage();
    await captureCorrectAnswer(page2, path.join(OUTPUT_DIR, `${vp.name}-correct-answer.png`));

    await context.close();
  }

  await browser.close();
  console.log("Done!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
