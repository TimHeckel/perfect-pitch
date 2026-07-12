import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("pitchtrail_info_seen_v1", "true");
    (window as any).__bsharp_test_deterministic_color = "red";
  });
  await page.goto("/");
});

test("play action cue", async ({ page }) => {
  await expect(page.locator("#play-button")).toHaveClass(/ready-action/);
  await expect(page.locator(".control-wrapper")).toHaveScreenshot("play-action-cue.png");
});

test("next action cue after an incorrect answer", async ({ page }) => {
  await page.locator("#play-button").click();
  await page.waitForTimeout(1000);
  await page.locator("#yellow-flag .flag").click();
  await expect(page.locator("#next-chord")).toHaveClass(/ready-action/);
  await expect(page.locator(".control-wrapper")).toHaveScreenshot("next-action-cue.png");
});

test("Play first dialog", async ({ page }) => {
  await page.locator("#red-flag").click();
  await expect(page.locator("#play-first-dialog")).toHaveScreenshot("play-first-dialog.png");
});
