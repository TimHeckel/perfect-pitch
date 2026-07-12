import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("pitchtrail_info_seen_v1", "true");
  });
  await page.goto("/");
});

test("app starts in light mode", async ({ page }) => {
  await expect(page.locator("body")).toHaveClass(/colorscheme-light/);
});

test("download button hidden by default", async ({ page }) => {
  await expect(page.locator("#download-link")).not.toHaveClass(/visible/);
});

test("a legacy dark preference is migrated to the default appearance", async ({ page }) => {
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("bsharp_state")!);
    state.profiles[state.current_profile].color_scheme = "dark";
    localStorage.setItem("bsharp_state", JSON.stringify(state));
  });
  await page.reload();
  await expect(page.locator("body")).toHaveClass(/colorscheme-light/);
  await expect(page.locator("body")).not.toHaveClass(/colorscheme-dark/);
});
