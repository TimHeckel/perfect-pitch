import { expect, test } from "@playwright/test";

test("session stops at ten and points to a fresh trail", async ({ page }) => {
  await page.addInitScript(() => {
    const now = Date.now() / 1000;
    localStorage.clear();
    localStorage.setItem(
      "bsharp_state",
      JSON.stringify({
        profiles: {
          100: {
            id: 100,
            name: "Guest",
            icon: "fa-user",
            target_number: 10,
            enable_onboarding_hints: false,
            stats: {
              current_chord: "yellow",
              start_time: now,
              updated_time: now,
              correct: 9,
              identifications: 9,
              confusion_matrix: {},
              notes: { correct: 0, identifications: 0, confusion_matrix: {} },
              done: false,
            },
            current_chord: "yellow",
            current_instrument: "piano_1",
          },
        },
        current_chord: "yellow",
        current_profile: 100,
      }),
    );
  });
  await page.goto("/");
  await expect(page.locator("#stats-correct")).toHaveText("9");

  await page.locator("#play-button").click();
  await expect(page.locator("#audio-status")).toHaveText("Now choose the color", {
    timeout: 5_000,
  });
  await page.locator("#red-flag").click();

  await expect(page.locator("#stats-container")).toHaveClass(/done/);
  await expect(page.locator("#stats-correct")).toHaveText("10");
  await expect(page.locator("#stats-total")).toHaveText("10");
  await expect(page.locator("#checkpoint-label")).toHaveText("Trail complete");
  await expect(page.locator("#play-button")).toHaveClass(/deactivated/);
  await expect(page.locator("#next-chord")).toHaveClass(/deactivated/);
  await expect
    .poll(() =>
      page.locator("#reset-button").evaluate((element) =>
        getComputedStyle(element).animationName,
      ),
    )
    .toBe("reset-ready");
});
