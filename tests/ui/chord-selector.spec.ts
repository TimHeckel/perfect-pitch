import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("preserve-state")) localStorage.clear();
    localStorage.setItem("pitchtrail_info_seen_v1", "true");
  });
  await page.goto("/");
});

async function setLevel(page: import("@playwright/test").Page, color: string) {
  await page.evaluate((level) => {
    (window as unknown as { change_selector: (to: string) => void }).change_selector(level);
  }, color);
}

test("14 chord flags exist while the automatic route starts with two", async ({ page }) => {
  await expect(page.locator(".flag-wrapper:not(.trainer)")).toHaveCount(14);
  await expect(page.locator("#red-flag")).toBeVisible();
  await expect(page.locator("#yellow-flag")).toBeVisible();
  await expect(page.locator("#blue-flag")).not.toBeVisible();
  await expect(page.locator("#trail-level-name")).toHaveText("2-color trail");
  await expect(page.locator("#trail-level-name")).not.toContainText("Yellow");
});

test("manual level controls are absent", async ({ page }) => {
  await expect(page.locator("#chord-selector")).toHaveCount(0);
  await expect(page.getByText("Trail level", { exact: true })).toHaveCount(0);
});

test("the internal route follows the fixed cumulative chord order", async ({ page }) => {
  await setLevel(page, "blue");
  await expect(page.locator("#red-flag")).toBeVisible();
  await expect(page.locator("#yellow-flag")).toBeVisible();
  await expect(page.locator("#blue-flag")).toBeVisible();
  await expect(page.locator("#black-flag")).not.toBeVisible();
  await expect(page.locator("#trail-level-name")).toHaveText("3-color trail");

  await setLevel(page, "gray");
  await expect(page.locator("#gray-flag")).toBeVisible();
  await expect(page.locator("#tan-flag")).not.toBeVisible();
  await expect(page.locator("#flag-holder")).toHaveClass(/flags-compact/);

  await setLevel(page, "skyblue");
  await expect(page.locator("#trail-level-detail")).toHaveText("Open-ended practice · adaptive mix");
});

test("route starts with an ability-based mastery target", async ({ page }) => {
  await expect(page.locator("#trail-level-detail")).toHaveText("0 of 3 mastery trails · adaptive mix");
});

test("header offers exactly two persistent sound buttons", async ({ page, context }) => {
  await expect(page.locator(".sound-choice")).toHaveCount(2);
  await expect(page.locator("#sound-piano")).toHaveAttribute("aria-pressed", "true");
  await page.locator("#sound-guitar").click();
  await expect(page.locator("#sound-guitar")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#sound-piano")).toHaveAttribute("aria-pressed", "false");

  await expect.poll(() => page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("bsharp_state")!);
    return state.profiles[state.current_profile].current_instrument;
  })).toBe("guitar");

  const secondPage = await context.newPage();
  await secondPage.goto("/");
  await expect(secondPage.locator("#sound-guitar")).toHaveAttribute("aria-pressed", "true");
  await secondPage.close();
});

test("guitar button selects the immediate guitar sample", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "__bsharp_loaded_audio_srcs", { value: [], writable: true });
    const originalLoad = HTMLMediaElement.prototype.load;
    HTMLMediaElement.prototype.load = function () {
      (window as unknown as { __bsharp_loaded_audio_srcs: string[] }).__bsharp_loaded_audio_srcs.push(this.src);
      return originalLoad.call(this);
    };
    (window as unknown as { __bsharp_test_deterministic_color: string }).__bsharp_test_deterministic_color = "yellow";
  });
  await page.goto("/");
  await page.locator("#sound-guitar").click();

  await expect.poll(() => page.evaluate(() =>
    (window as unknown as { __bsharp_loaded_audio_srcs: string[] }).__bsharp_loaded_audio_srcs,
  )).toContainEqual(expect.stringContaining("/static/chords/guitar/c4f4a4_yellow.mp3"));
});

test("three mastered trails add the next color without a calendar gate", async ({ page }) => {
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("bsharp_state")!);
    const profile = state.profiles[state.current_profile];
    profile.stats.correct = 10;
    profile.stats.identifications = 10;
    profile.stats.confusion_matrix = { red: { red: 5 }, yellow: { yellow: 5 } };
    profile.stats.done = true;
    const earlierTrail = (offset: number) => ({
      ...profile.stats,
      start_time: profile.stats.start_time - offset,
      updated_time: profile.stats.updated_time - offset,
    });
    localStorage.setItem("bsharp_state", JSON.stringify(state));
    localStorage.setItem("bsharp_session_history", JSON.stringify({
      [profile.id]: { yellow: [earlierTrail(120), earlierTrail(60)] },
    }));
    sessionStorage.setItem("preserve-state", "true");
  });
  await page.reload();

  await expect(page.locator("#trail-level-name")).toHaveText("3-color trail");
  await expect(page.locator("#blue-flag")).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("bsharp_state")!);
    return state.profiles[state.current_profile].current_chord;
  })).toBe("blue");
});

test("weak color performance keeps the current adaptive mix", async ({ page }) => {
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("bsharp_state")!);
    const profile = state.profiles[state.current_profile];
    const perfectTrail = (offset: number) => ({
      ...profile.stats,
      start_time: profile.stats.start_time - offset,
      updated_time: profile.stats.updated_time - offset,
      correct: 10,
      identifications: 10,
      confusion_matrix: { red: { red: 5 }, yellow: { yellow: 5 } },
      done: true,
    });
    profile.stats.correct = 5;
    profile.stats.identifications = 10;
    profile.stats.confusion_matrix = { red: { red: 5 }, yellow: { red: 5 } };
    profile.stats.done = true;
    localStorage.setItem("bsharp_state", JSON.stringify(state));
    localStorage.setItem("bsharp_session_history", JSON.stringify({
      [profile.id]: { yellow: [perfectTrail(120), perfectTrail(60)] },
    }));
    sessionStorage.setItem("preserve-state", "true");
  });
  await page.reload();
  await expect(page.locator("#trail-level-name")).toHaveText("2-color trail");
  await expect(page.locator("#trail-level-detail")).toContainText("Strengthening weak colors");
});
