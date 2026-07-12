import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    (window as any).__bsharp_test_deterministic_color = "red";
  });
  await page.goto("/");
});

test("play action cue", async ({ page }) => {
  await expect(page.locator("#play-button")).toHaveClass(/ready-action/);
  await expect(page.locator(".control-wrapper")).toHaveScreenshot("play-action-cue.png");
});

test("next action cue after a correct answer", async ({ page }) => {
  await page.locator("#play-button").click();
  await page.waitForTimeout(1000);
  await page.locator("#red-flag .flag").click();
  await expect(page.locator("#next-chord")).toHaveClass(/ready-action/);
  await expect(page.locator(".control-wrapper")).toHaveScreenshot("next-action-cue.png");
});
