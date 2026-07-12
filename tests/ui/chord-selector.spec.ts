import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/");
});

test("14 chord flags exist in DOM", async ({ page }) => {
  const flags = page.locator(".flag-wrapper:not(.trainer)");
  await expect(flags).toHaveCount(14);
});

test("default level shows red and yellow flags", async ({ page }) => {
  // Default chord level is yellow (index 1), so red and yellow should be visible
  const redFlag = page.locator("#red-flag");
  const yellowFlag = page.locator("#yellow-flag");
  const blueFlag = page.locator("#blue-flag");

  await expect(redFlag).toBeVisible();
  await expect(yellowFlag).toBeVisible();
  await expect(blueFlag).not.toBeVisible();
});

test("selecting blue shows red, yellow, blue", async ({ page }) => {
  const selector = page.locator("#chord-selector");
  await selector.selectOption("blue");

  await expect(page.locator("#red-flag")).toBeVisible();
  await expect(page.locator("#yellow-flag")).toBeVisible();
  await expect(page.locator("#blue-flag")).toBeVisible();
  await expect(page.locator("#black-flag")).not.toBeVisible();
});

test("black chord level shows all white plus selected black chord", async ({
  page,
}) => {
  const selector = page.locator("#chord-selector");
  await selector.selectOption("gray");

  // All 9 white chords should be visible
  for (const color of [
    "red",
    "yellow",
    "blue",
    "black",
    "green",
    "orange",
    "purple",
    "pink",
    "brown",
  ]) {
    await expect(page.locator(`#${color}-flag`)).toBeVisible();
  }

  // Gray should be visible, but tan and beyond should not
  await expect(page.locator("#gray-flag")).toBeVisible();
  await expect(page.locator("#tan-flag")).not.toBeVisible();
});

test("flag container gets flags-compact class with more than 9 flags", async ({
  page,
}) => {
  const selector = page.locator("#chord-selector");
  await selector.selectOption("gray");

  await expect(page.locator("#flag-holder")).toHaveClass(/flags-compact/);
});

test("flag container gets flags-expanded class with fewer than 4 flags", async ({
  page,
}) => {
  // Default level is yellow = 2 flags (red + yellow), which is < 4
  await expect(page.locator("#flag-holder")).toHaveClass(/flags-expanded/);
});

test("red option is hidden by default", async ({ page }) => {
  const redOption = page.locator("#chord-selector option[value='red']");
  await expect(redOption).toHaveAttribute("hidden", "");
});

test("instrument selector appears next to level selector with available instruments", async ({
  page,
}) => {
  await expect(page.locator(".selectors > #chord-selector + #instrument-selector")).toBeVisible();

  const selector = page.locator("#instrument-selector");
  await expect(selector).toHaveValue("piano_1");
  await expect(selector.locator("option")).toHaveText([
    "Piano",
    "Guitar",
    "Guitar (Strummed)",
  ]);
});

test("selecting an instrument persists it on the current profile", async ({
  page,
  context,
}) => {
  const selector = page.locator("#instrument-selector");
  await selector.selectOption("guitar-strummed");

  await expect(selector).toHaveValue("guitar-strummed");
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const state = JSON.parse(localStorage.getItem("bsharp_state")!);
        return state.profiles[state.current_profile].current_instrument;
      }),
    )
    .toBe("guitar-strummed");

  const secondPage = await context.newPage();
  await secondPage.goto("/");
  await expect(secondPage.locator("#instrument-selector")).toHaveValue("guitar-strummed");
  await secondPage.close();
});

test("selected instrument controls chord audio source", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "__bsharp_loaded_audio_srcs", {
      value: [],
      writable: true,
    });
    const originalLoad = HTMLMediaElement.prototype.load;
    HTMLMediaElement.prototype.load = function () {
      (window as unknown as { __bsharp_loaded_audio_srcs: string[] }).__bsharp_loaded_audio_srcs.push(this.src);
      return originalLoad.call(this);
    };
    (window as unknown as { __bsharp_test_deterministic_color: string }).__bsharp_test_deterministic_color =
      "yellow";
  });
  await page.goto("/");

  await page.locator("#instrument-selector").selectOption("guitar");

  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          (window as unknown as { __bsharp_loaded_audio_srcs: string[] }).__bsharp_loaded_audio_srcs,
      ),
    )
    .toContainEqual(expect.stringContaining("/static/chords/guitar/c4f4a4_yellow.mp3"));

  await page.locator("#instrument-selector").selectOption("guitar-strummed");

  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          (window as unknown as { __bsharp_loaded_audio_srcs: string[] }).__bsharp_loaded_audio_srcs,
      ),
    )
    .toContainEqual(
      expect.stringContaining("/static/chords/guitar-strummed/c4f4a4_yellow.mp3"),
    );
});
