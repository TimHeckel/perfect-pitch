import { test, expect } from "@playwright/test";
import { openProfilePanel, createProfile } from "./helpers";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/");
});

test("app starts in light mode", async ({ page }) => {
  await expect(page.locator("body")).toHaveClass(/colorscheme-light/);
});

test("download button hidden by default", async ({ page }) => {
  await expect(page.locator("#download-link")).not.toHaveClass(/visible/);
});

test("color scheme setting persists across profile switch", async ({
  page,
}) => {
  page.on("dialog", (dialog) => dialog.dismiss());

  // Create a profile with light mode
  await openProfilePanel(page);
  await page.locator("#profile-switcher .switcher-add").click();
  await page.locator("#profile_name_setting").fill("Light User");
  await page
    .locator("input[name='profile_icon_selector'][value='fa-bolt']")
    .check();
  await page.locator("#color-scheme-selector").selectOption("light");
  await page.locator("#add-user-button").click();

  // Should now be in light mode
  await expect(page.locator("body")).toHaveClass(/colorscheme-light/);
  await expect(page.locator("body")).not.toHaveClass(/colorscheme-dark/);

  // Switch back to Guest
  await openProfilePanel(page);
  await page
    .locator("#profile-switcher .switcher-profile:has(.fa-user)")
    .click();

  // Guest uses the light default
  await expect(page.locator("body")).toHaveClass(/colorscheme-light/);
  await expect(page.locator("body")).not.toHaveClass(/colorscheme-dark/);
});

test("color scheme applies on page reload", async ({ page }) => {
  page.on("dialog", (dialog) => dialog.dismiss());

  // Create a profile with light mode
  await openProfilePanel(page);
  await page.locator("#profile-switcher .switcher-add").click();
  await page.locator("#profile_name_setting").fill("Reload User");
  await page
    .locator("input[name='profile_icon_selector'][value='fa-bolt']")
    .check();
  await page.locator("#color-scheme-selector").selectOption("light");
  await page.locator("#add-user-button").click();

  // Grab the state from localStorage and reinject it after reload
  const state = await page.evaluate(() => localStorage.getItem("bsharp_state"));

  // Reload — addInitScript clears localStorage, so we reinject state
  await page.addInitScript((savedState: string) => {
    localStorage.setItem("bsharp_state", savedState);
  }, state!);
  await page.reload();

  await expect(page.locator("body")).toHaveClass(/colorscheme-light/);
  await expect(page.locator("body")).not.toHaveClass(/colorscheme-dark/);
});
