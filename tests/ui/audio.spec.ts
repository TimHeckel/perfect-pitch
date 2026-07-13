import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("preserve-audio-map-state")) localStorage.clear();
    localStorage.setItem("pitchtrail_info_seen_v1", "true");
  });
  await page.addInitScript(() => {
    (window as any).__audioSpy = {
      callLog: [] as string[],
      lastPlayedElement: null as HTMLAudioElement | null,
    };
    const origPlay = HTMLAudioElement.prototype.play;
    HTMLAudioElement.prototype.play = function () {
      (window as any).__audioSpy.callLog.push("play");
      (window as any).__audioSpy.lastPlayedElement = this;
      return origPlay.call(this);
    };
    const origPause = HTMLAudioElement.prototype.pause;
    HTMLAudioElement.prototype.pause = function () {
      (window as any).__audioSpy.callLog.push("pause");
      return origPause.call(this);
    };
  });
  await page.goto("/");
});

test("clicking play starts audio element", async ({ page }) => {
  await page.locator("#play-button").click();

  const paused = await page.evaluate(
    () => (window as any).__audioSpy.lastPlayedElement?.paused ?? null,
  );
  expect(paused).toBe(false);
  await expect(page.locator("#audio-status")).toHaveText("Playing chord");
});

test("startup mounts only the selected chord instead of preloading the lesson", async ({ page }) => {
  await expect(page.locator("#audio-bank audio.chord")).toHaveCount(1);
});

test("rapid play clicks leave audio playing", async ({ page }) => {
  const playButton = page.locator("#play-button");
  await playButton.click();
  await playButton.click();
  await playButton.click();

  const state = await page.evaluate(() => {
    const { callLog, lastPlayedElement } = (window as any).__audioSpy;
    return {
      lastCall: callLog[callLog.length - 1],
      paused: lastPlayedElement?.paused ?? null,
    };
  });

  expect(state.lastCall).toBe("play");
  expect(state.paused).toBe(false);
});

test("next button plays audio for new chord", async ({ page }) => {
  await page.locator("#play-button").click();
  await page.waitForTimeout(1000);
  await page.locator("#red-flag .flag").click();

  // Reset spy log before clicking next
  await page.evaluate(() => {
    (window as any).__audioSpy.callLog = [];
  });

  await page.locator("#next-chord").click();

  const state = await page.evaluate(() => {
    const { callLog, lastPlayedElement } = (window as any).__audioSpy;
    return {
      lastCall: callLog[callLog.length - 1],
      paused: lastPlayedElement?.paused ?? null,
    };
  });

  expect(state.lastCall).toBe("play");
  expect(state.paused).toBe(false);
});

test("yellow and blue keep their canonical sounds across a reload", async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).__bsharp_test_deterministic_color =
      localStorage.getItem("pitchtrail_test_color") ?? "yellow";
  });
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("bsharp_state")!);
    const profile = state.profiles[state.current_profile];
    state.current_chord = "blue";
    profile.current_chord = "blue";
    profile.introduced_chords = ["red", "yellow", "blue"];
    localStorage.setItem("bsharp_state", JSON.stringify(state));
    localStorage.setItem("pitchtrail_test_color", "yellow");
    sessionStorage.setItem("preserve-audio-map-state", "true");
  });

  await page.reload();
  await expect(page.locator("#audio-bank audio.chord")).toHaveAttribute(
    "src",
    /static\/chords\/piano\/cfa_yellow_(short|medium|long)\.mp3$/,
  );

  await page.evaluate(() => localStorage.setItem("pitchtrail_test_color", "blue"));
  await page.reload();
  await expect(page.locator("#audio-bank audio.chord")).toHaveAttribute(
    "src",
    /static\/chords\/piano\/hdg_blue_(short|medium|long)\.mp3$/,
  );

  await expect(page.locator("#trail-level-name")).toHaveText("3-color trail");
});
