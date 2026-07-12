import { test, expect } from "@playwright/test";
import { createProfile, openProfilePanel } from "./helpers";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/");
});

test("play overlay visible on page load with arrow", async ({ page }) => {
  const overlay = page.locator("#onboarding-overlay");
  await expect(overlay).toBeVisible();
  await expect(overlay).toHaveAttribute("data-step", "play");
  // Should contain arrow and text
  await expect(overlay.locator(".onboarding-arrow")).toBeVisible();
  await expect(overlay.locator(".onboarding-text")).toHaveText(
    "Click the play button to hear the sound",
  );
});

test("play overlay dismissed after clicking play", async ({ page }) => {
  const overlay = page.locator("#onboarding-overlay");
  await expect(overlay).toBeVisible();

  await page.locator("#play-button").click();
  await expect(overlay).not.toBeVisible();
});

test("guess overlay appears after audio finishes on first session", async ({
  page,
}) => {
  const overlay = page.locator("#onboarding-overlay");

  await page.locator("#play-button").click();
  await expect(overlay).not.toBeVisible();

  // Wait for audio to finish and guess overlay to appear
  await expect(overlay).toBeVisible({ timeout: 5000 });
  await expect(overlay.locator(".onboarding-text")).toHaveText(
    "Guess the color",
  );
  await expect(overlay).toHaveAttribute("data-step", "guess");
});

test("correct guess shows success overlay on first identification", async ({
  page,
}) => {
  const overlay = page.locator("#onboarding-overlay");

  await page.locator("#play-button").click();
  await expect(overlay).toBeVisible({ timeout: 5000 });

  // Click the correct flag
  const correctColor = await page.evaluate(() => {
    return (window as any).__bsharp_correct_color?.() ?? null;
  });
  await page.locator(`#${correctColor}-flag .flag`).click();

  await expect(overlay).toBeVisible();
  await expect(overlay.locator(".onboarding-text")).toHaveText(
    "Great job! Click the arrow to continue",
  );
  await expect(overlay).toHaveAttribute("data-step", "goNext");
});

test("wrong guess shows retry overlay on first identification", async ({
  page,
}) => {
  const overlay = page.locator("#onboarding-overlay");

  await page.locator("#play-button").click();
  await expect(overlay).toBeVisible({ timeout: 5000 });

  // Click the wrong flag
  const correctColor = await page.evaluate(() => {
    return (window as any).__bsharp_correct_color?.() ?? null;
  });
  const wrongColor = correctColor === "red" ? "yellow" : "red";
  await page.locator(`#${wrongColor}-flag .flag`).click();

  await expect(overlay).toBeVisible();
  await expect(overlay.locator(".onboarding-text")).toHaveText(
    "Click the arrow to try again",
  );
  await expect(overlay).toHaveAttribute("data-step", "goNext");
});

test("play click does not dismiss success/retry overlay", async ({ page }) => {
  const overlay = page.locator("#onboarding-overlay");

  await page.locator("#play-button").click();
  await expect(overlay).toBeVisible({ timeout: 5000 });

  // Click any flag to get a result overlay (success or retry)
  await page.locator("#red-flag .flag").click();
  await expect(overlay).toBeVisible();
  await expect(overlay).toHaveAttribute("data-step", "goNext");

  // Click play again — overlay should persist
  await page.locator("#play-button").click();
  await expect(overlay).toBeVisible();
  await expect(overlay).toHaveAttribute("data-step", "goNext");
});

test("result overlay dismissed when clicking next", async ({ page }) => {
  const overlay = page.locator("#onboarding-overlay");

  await page.locator("#play-button").click();
  await expect(overlay).toBeVisible({ timeout: 5000 });

  // Click any flag (correct or wrong — both show an overlay)
  await page.locator("#red-flag .flag").click();
  await expect(overlay).toBeVisible();

  // Click next — nextAudio auto-plays, so onPlay hides overlay
  await page.locator("#next-chord").click();
  await expect(overlay).not.toBeVisible();
});

test("guess/result overlays do NOT appear after first identification", async ({
  page,
}) => {
  const overlay = page.locator("#onboarding-overlay");

  // First identification: play, wait, guess
  await page.locator("#play-button").click();
  await expect(overlay).toBeVisible({ timeout: 5000 });
  await page.locator("#red-flag .flag").click();
  await expect(overlay).toBeVisible(); // success or retry overlay

  // Click next to advance
  await page.locator("#next-chord").click();
  await expect(overlay).not.toBeVisible();

  // Audio auto-played via next — wait for it to end
  await page.waitForTimeout(1500);

  // Guess overlay should NOT appear on second identification
  await expect(overlay).not.toBeVisible();
});

test("guess overlay does NOT appear for profile with existing history", async ({
  page,
}) => {
  const overlay = page.locator("#onboarding-overlay");

  // Play, answer, creating session history
  await page.locator("#play-button").click();
  await expect(overlay).toBeVisible({ timeout: 5000 });
  await page.locator("#red-flag .flag").click();

  // Reset to save session history
  await page.locator("#reset-button").click();

  // Reload the page
  await page.reload();
  await expect(overlay).toBeVisible();
  await expect(overlay.locator(".onboarding-text")).toHaveText(
    "Click the play button to hear the sound",
  );

  // Play and wait for audio to finish
  await page.locator("#play-button").click();
  await page.waitForTimeout(1500);

  // Guess overlay should NOT appear since profile has history
  await expect(overlay).not.toBeVisible();
});

test("overlay reappears when switching to a new profile", async ({ page }) => {
  const overlay = page.locator("#onboarding-overlay");

  // Play and answer to create history for default profile
  await page.locator("#play-button").click();
  await expect(overlay).toBeVisible({ timeout: 5000 });
  await page.locator("#red-flag .flag").click();
  await page.locator("#reset-button").click();

  // Create a new profile via helper (handles hamburger menu)
  await createProfile(page, "Test Child", "fa-truck");

  // New profile should show the play overlay
  await expect(overlay).toBeVisible();
  await expect(overlay.locator(".onboarding-text")).toHaveText(
    "Click the play button to hear the sound",
  );

  // Play and wait — guess overlay should appear for new profile (no history)
  await page.locator("#play-button").click();
  await expect(overlay).toBeVisible({ timeout: 5000 });
  await expect(overlay.locator(".onboarding-text")).toHaveText(
    "Guess the color",
  );
});

test("no overlays when onboarding hints disabled in profile settings", async ({
  page,
}) => {
  const overlay = page.locator("#onboarding-overlay");

  // Disable onboarding hints for the Guest profile
  await openProfilePanel(page);
  await page.locator("#enable_onboarding_hints_setting").uncheck();
  await page.locator("#submit-changes-button").click();

  // Reset stats to trigger initOnboarding flow
  await page.locator("#reset-button").click();

  // Play overlay should NOT appear
  await expect(overlay).not.toBeVisible();
});
