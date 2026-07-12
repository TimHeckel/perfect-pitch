import { test, expect } from "@playwright/test";
import { openMenu } from "../ui/helpers";

// Status codes that indicate the URL exists but the server is blocking bots.
const BOT_BLOCKED = new Set([401, 403, 429]);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/");
});

test("all info panel links are reachable", async ({ page, context, request }) => {
  await openMenu(page);
  await page.locator("#i-infobox-trigger").click();
  await expect(page.locator("#i-infobox")).toHaveClass(/visible/);

  const hrefs = await page
    .locator("#i-infobox a[href^='http']")
    .evaluateAll((els) =>
      els.map((el) => [
        (el as HTMLAnchorElement).href,
        el.textContent?.trim(),
      ]),
    );
  expect(hrefs.length).toBeGreaterThan(0);

  for (const [href, label] of hrefs) {
    let status: number;

    // Direct file links (PDF, etc.) trigger downloads in the browser,
    // so check those with an HTTP HEAD request instead.
    if (/\.(pdf|zip|tar|gz)$/i.test(href!)) {
      const resp = await request.head(href!);
      status = resp.status();
    } else {
      const checkPage = await context.newPage();
      const resp = await checkPage.goto(href!, { waitUntil: "domcontentloaded" });
      status = resp?.status() ?? 0;
      await checkPage.close();
    }

    const reachable = (status >= 200 && status < 400) || BOT_BLOCKED.has(status);
    expect(reachable, `"${label}" (${href}) returned ${status}`).toBe(true);
  }
});
