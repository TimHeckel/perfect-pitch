import { expect, test } from "@playwright/test";
import { openMenu } from "../ui/helpers";

test("simplified profile settings on tablet", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("pitchtrail_info_seen_v1", "true");
  });
  await page.goto("/");
  await openMenu(page);
  await page.locator("#profile-infobox-trigger").click();

  await expect(page.locator("#profile-info-container")).toHaveScreenshot("profile-settings-tablet.png");
});
