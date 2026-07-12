import { expect, test } from "@playwright/test";
import { openMenu } from "./helpers";

test("guide embeds the local Pitch Trail intro without a YouTube link", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("pitchtrail_info_seen_v1", "true"));
  await page.goto("/");
  await openMenu(page);
  await page.locator("#i-infobox-trigger").click();

  const video = page.locator("#pitch-trail-intro");
  await expect(video).toBeVisible();
  await expect(video).toHaveAttribute("controls", "");
  await expect(video.locator("source")).toHaveAttribute(
    "src",
    "static/video/pitch-trail-intro.mp4?v=20260712-3",
  );
  await expect(video.locator("track[kind='captions']")).toHaveAttribute(
    "src",
    "static/video/pitch-trail-intro.vtt?v=20260712-3",
  );
  await expect(page.locator("#i-infobox a[href*='youtu']")).toHaveCount(0);
  await expect(page.locator(".guide-video figcaption")).toContainText("26 seconds");
  await expect(page.getByText("Meet the colors.", { exact: true })).toBeVisible();
  await expect(page.getByText("Ear first. Names later.", { exact: true })).toBeVisible();

  const response = await page.request.get("/static/video/pitch-trail-intro.mp4?v=20260712-3");
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toContain("video/mp4");

  const captions = await page.request.get("/static/video/pitch-trail-intro.vtt?v=20260712-3");
  expect(captions.ok()).toBe(true);
  const captionText = await captions.text();
  expect(captionText).toContain("Tap any color to hear its sound.");
  expect(captionText).toContain("Ear first, names later");
  expect(captionText.toLowerCase()).not.toContain("strum");
});
