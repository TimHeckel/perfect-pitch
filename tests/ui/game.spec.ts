import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("pitchtrail_info_seen_v1", "true");
  });
  await page.goto("/");
});

test("play button is active after init", async ({ page }) => {
  const playButton = page.locator("#play-button");
  await expect(playButton).toBeVisible();
  await expect(playButton).not.toHaveClass(/deactivated/);
});

test("refresh icon uses high-contrast black", async ({ page }) => {
  await expect(page.locator("#reset-button i")).toHaveCSS("color", "rgb(23, 33, 30)");
});

test("answer clock resets per question and stops when the child answers", async ({ page }) => {
  await page.evaluate(() => {
    (window as unknown as { __bsharp_test_deterministic_color: string }).__bsharp_test_deterministic_color = "red";
    (window as unknown as { change_selector: (to: string) => void }).change_selector("yellow");
  });
  await expect(page.locator("#practice-elapsed")).toHaveText("0:00");
  await page.locator("#play-button").click();
  await expect(page.locator("#practice-elapsed")).toHaveText("0:01", { timeout: 2_500 });
  await page.locator("#yellow-flag").click();
  const stoppedAt = await page.locator("#practice-elapsed").textContent();
  await page.waitForTimeout(1_100);
  await expect(page.locator("#practice-elapsed")).toHaveText(stoppedAt!);
  await expect(page.locator(".practice-clock")).toBeVisible();
});

test("answer clock caps at ten seconds", async ({ page }) => {
  await page.clock.install();
  await page.locator("#play-button").click();
  await page.clock.fastForward(11_000);
  await expect(page.locator("#practice-elapsed")).toHaveText("0:10");
});

test("next button is deactivated until flag selected", async ({ page }) => {
  await page.evaluate(() => {
    (window as unknown as { __bsharp_test_deterministic_color: string }).__bsharp_test_deterministic_color = "red";
    (window as unknown as { change_selector: (to: string) => void }).change_selector("yellow");
  });
  const nextButton = page.locator("#next-chord");
  await expect(nextButton).toHaveClass(/deactivated/);
  await expect
    .poll(() =>
      nextButton.evaluate((element) =>
        getComputedStyle(element, "::after").animationName,
      ),
    )
    .toBe("none");

  // Click play to start audio, wait for audio to "play", then select a flag
  await page.locator("#play-button").click();
  await page.waitForTimeout(1700);
  await page.locator("#yellow-flag").click();

  await expect(nextButton).not.toHaveClass(/deactivated/);
  await expect
    .poll(() =>
      nextButton.evaluate((element) =>
        getComputedStyle(element, "::after").animationName,
      ),
    )
    .toBe("action-ready");
});

test("selecting a flag shows correct or incorrect feedback", async ({
  page,
}) => {
  await page.locator("#play-button").click();
  await page.waitForTimeout(1000);

  // At default level, red and yellow are visible. Click red.
  const redFlag = page.locator("#red-flag .flag");
  await page.locator("#red-flag").click();

  // The clicked flag must get exactly one feedback class
  const isCorrect = await redFlag.evaluate((el) =>
    el.classList.contains("flag-correct"),
  );
  const isIncorrect = await redFlag.evaluate((el) =>
    el.classList.contains("flag-incorrect"),
  );
  expect(isCorrect || isIncorrect).toBe(true);
  expect(isCorrect && isIncorrect).toBe(false);
});

test("wrong flag shows flag-incorrect and correct flag is revealed", async ({
  page,
}) => {
  await page.locator("#play-button").click();
  await page.waitForTimeout(1000);

  // Click red; if it happens to be wrong, the correct flag (yellow) gets flag-correct
  const redFlag = page.locator("#red-flag .flag");
  const yellowFlag = page.locator("#yellow-flag .flag");
  await page.locator("#red-flag").click();

  const redIsIncorrect = await redFlag.evaluate((el) =>
    el.classList.contains("flag-incorrect"),
  );

  if (redIsIncorrect) {
    // Red was wrong, so yellow must be marked correct
    await expect(yellowFlag).toHaveClass(/flag-correct/);
  } else {
    // Red was correct — verify no incorrect class
    await expect(redFlag).toHaveClass(/flag-correct/);
    await expect(redFlag).not.toHaveClass(/flag-incorrect/);
  }
});

test("stats counter increments after answering", async ({ page }) => {
  await expect(page.locator("#stats-correct")).toHaveText("0");
  await expect(page.locator("#stats-total")).toHaveText("10");

  await page.locator("#play-button").click();
  await page.waitForTimeout(1000);
  await page.locator("#red-flag").click();

  await expect(page.locator("#stats-correct")).toHaveText("1");
  await expect(page.locator("#stats-percent")).toContainText("correct");
});

test("next button advances and resets flag feedback", async ({ page }) => {
  // Answer first question
  await page.locator("#play-button").click();
  await page.waitForTimeout(1000);
  await page.locator("#red-flag").click();

  // Verify feedback is applied
  const redFlag = page.locator("#red-flag .flag");
  const hasCorrect = await redFlag.evaluate((el) =>
    el.classList.contains("flag-correct"),
  );
  const hasIncorrect = await redFlag.evaluate((el) =>
    el.classList.contains("flag-incorrect"),
  );
  expect(hasCorrect || hasIncorrect).toBe(true);

  // Click next
  await page.locator("#next-chord").click();
  await page.waitForTimeout(500);

  // Feedback classes should be removed from all flags
  await expect(redFlag).not.toHaveClass(/flag-correct/);
  await expect(redFlag).not.toHaveClass(/flag-incorrect/);
});

test("a correct answer advances automatically after a confirmation beat", async ({ page }) => {
  await page.evaluate(() => {
    (window as unknown as { __bsharp_test_deterministic_color: string }).__bsharp_test_deterministic_color = "red";
    (window as unknown as { change_selector: (to: string) => void }).change_selector("yellow");
  });
  await page.locator("#play-button").click();
  await page.waitForTimeout(1000);
  const redFlag = page.locator("#red-flag .flag");
  await page.locator("#red-flag").click();

  await expect(redFlag).toHaveClass(/flag-correct/);
  await expect(redFlag).not.toHaveClass(/flag-correct/, { timeout: 2_000 });
  await expect(page.locator("#next-chord")).toHaveClass(/deactivated/);
});

test("note names fade in after an answer only after nine colors are mastered", async ({ page }) => {
  await page.evaluate(() => {
    (window as unknown as { __bsharp_test_deterministic_color: string }).__bsharp_test_deterministic_color = "red";
    (window as unknown as { change_selector: (to: string) => void }).change_selector("gray");
  });

  const notes = page.locator("#red-flag .chord-notes-container");
  await expect(notes).toBeHidden();
  await page.locator("#play-button").click();
  for (let color = 0; color < 8; color += 1) {
    await page.locator("#hear-new-color").click();
    await page.locator("#start-new-color-trail").click();
  }
  await expect(page.locator("#color-introduction-dialog")).not.toBeVisible();
  await page.waitForTimeout(1000);
  await page.locator("#red-flag").click();
  await expect(page.locator("#red-flag .flag")).toHaveClass(/theory-reveal/);
  await expect(notes).toBeVisible();
  await expect(notes).toContainText("C");
  await expect(notes).toContainText("E");
  await expect(notes).toContainText("G");
});

test("reset clears stats to zero", async ({ page }) => {
  // Answer a question first
  await page.locator("#play-button").click();
  await page.waitForTimeout(1000);
  await page.locator("#red-flag").click();

  await expect(page.locator("#stats-correct")).toHaveText("1");

  // Click reset
  await page.locator("#reset-button").click();

  await expect(page.locator("#stats-correct")).toHaveText("0");
  await expect(page.locator("#stats-total")).toHaveText("10");
});
