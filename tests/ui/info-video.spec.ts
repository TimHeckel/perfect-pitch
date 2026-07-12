import { expect, test } from "@playwright/test";
import { openMenu } from "./helpers";

test("guide embeds the local Pitch Trail intro without a YouTube link", async ({
  page,
}) => {
  await page.goto("/");
  await openMenu(page);
  await page.locator("#i-infobox-trigger").click();

  const video = page.locator("#pitch-trail-intro");
  await expect(video).toBeVisible();
  await expect(video).toHaveAttribute("controls", "");
  await expect(video.locator("source")).toHaveAttribute(
    "src",
    "static/video/pitch-trail-intro.mp4",
  );
  await expect(video.locator("track[kind='captions']")).toHaveAttribute(
    "src",
    "static/video/pitch-trail-intro.vtt",
  );
  await expect(page.locator("#i-infobox a[href*='youtu']")).toHaveCount(0);

  const response = await page.request.get("/static/video/pitch-trail-intro.mp4");
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toContain("video/mp4");
});
