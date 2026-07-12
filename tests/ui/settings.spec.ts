import { test, expect } from "@playwright/test";
import { openProfilePanel } from "./helpers";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("pitchtrail_info_seen_v1", "true");
  });
  await page.goto("/");
});

test("profile settings expose only identity and per-person trail length", async ({ page }) => {
  await openProfilePanel(page);

  await expect(page.locator("#profile_name_setting")).toBeVisible();
  await expect(page.locator(".profile-icon-picker")).toBeVisible();
  await expect(page.locator(".trail-length-presets")).toBeVisible();
  await expect(page.locator("#color-scheme-selector")).toHaveCount(0);
  await expect(page.locator("#trail-length-help")).toContainText("Saved only for");
  await expect(page.locator("#show-chord-name-mode-selector")).toHaveCount(0);
  await expect(page.locator("#chord-selection-mode-selector")).toHaveCount(0);
  await expect(page.getByText("Pin screen:", { exact: true })).toHaveCount(0);
});

test("question-count presets persist on a child profile", async ({ page }) => {
  page.on("dialog", (dialog) => dialog.dismiss());
  await openProfilePanel(page);
  await page.locator("#profile-switcher .switcher-add").click();
  await page.locator("#profile_name_setting").fill("Long Trail");
  await page.locator("label[for='npis-bolt']").click();
  await page.locator("label[for='trail-length-15']").click();
  await page.locator("#add-user-button").click();

  await openProfilePanel(page);
  await expect(page.locator("input[name='target_number_setting']:checked")).toHaveValue("15");
});

test("new and existing profiles use adaptive chord selection", async ({ page }) => {
  await expect.poll(() => page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("bsharp_state")!);
    return state.profiles[state.current_profile].chord_selection_mode;
  })).toBe("adaptive");
});

test("switching profiles preserves the earned route and instrument", async ({ page }) => {
  page.on("dialog", (dialog) => dialog.dismiss());
  await openProfilePanel(page);
  await page.locator("#profile-switcher .switcher-add").click();
  await page.locator("#profile_name_setting").fill("Blue Guitar");
  await page.locator("label[for='npis-paw']").click();
  await page.locator("#add-user-button").click();
  await page.evaluate(() => {
    (window as unknown as { change_selector: (to: string) => void }).change_selector("blue");
  });
  await page.locator("#sound-guitar").click();

  await openProfilePanel(page);
  await page.locator("#profile-switcher .switcher-profile:has(.fa-user)").click();
  await expect(page.locator("#trail-level-name")).toHaveText("2-color trail");
  await expect(page.locator("#sound-piano")).toHaveAttribute("aria-pressed", "true");

  await page.locator("#profile-switcher .switcher-profile:has(.fa-paw)").click();
  await expect(page.locator("#trail-level-name")).toHaveText("3-color trail");
  await expect(page.locator("#sound-guitar")).toHaveAttribute("aria-pressed", "true");
});

test("the default light appearance is fixed across profiles", async ({ page }) => {
  await expect(page.locator("body")).toHaveClass(/colorscheme-light/);
  await expect(page.locator("body")).not.toHaveClass(/colorscheme-dark/);
  await expect.poll(() => page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("bsharp_state")!);
    return Object.values(state.profiles).every((profile: any) => profile.color_scheme === "light");
  })).toBe(true);
});
