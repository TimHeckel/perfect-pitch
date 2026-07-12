import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/");
});

test("practice screen has no instructional overlay or redundant heading", async ({ page }) => {
  await expect(page.locator("#onboarding-overlay")).toHaveCount(0);
  await expect(page.getByText("Listening trail", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Find the color you hear.", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Tap play to hear the trail sound", { exact: true })).toHaveCount(0);
});

test("play is the only pulsing button at the start", async ({ page }) => {
  const play = page.locator("#play-button");
  const next = page.locator("#next-chord");
  await expect(play).toHaveClass(/ready-action/);
  await expect(next).not.toHaveClass(/ready-action/);
  await expect.poll(() => play.evaluate((element) =>
    getComputedStyle(element, "::after").animationName,
  )).toBe("action-ready");
});

test("next becomes the only pulsing button after an answer", async ({ page }) => {
  await page.locator("#play-button").click();
  await page.waitForTimeout(1100);
  await page.locator("#red-flag").click();
  await expect(page.locator("#play-button")).not.toHaveClass(/ready-action/);
  await expect(page.locator("#next-chord")).toHaveClass(/ready-action/);
});
