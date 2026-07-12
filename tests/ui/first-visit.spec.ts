import { expect, test } from "@playwright/test";

test("the guide opens once on a student's first visit", async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("preserve-first-visit")) localStorage.clear();
  });
  await page.goto("/");

  await expect(page.locator("#i-infobox")).toHaveClass(/visible/);
  await expect(page.locator(".cim-container")).toHaveClass(/panel-open/);
  await expect(page.locator("#home-button")).toHaveClass(/first-visit-home-cue/);

  await page.locator('#pitch-trail-intro').dispatchEvent('ended');
  await expect(page.locator("#i-infobox")).not.toHaveClass(/visible/);
  await expect(page.locator("#home-button")).not.toHaveClass(/first-visit-home-cue/);

  await page.evaluate(() => sessionStorage.setItem("preserve-first-visit", "true"));
  await page.reload();

  await expect(page.locator("#i-infobox")).not.toHaveClass(/visible/);
  await expect(page.locator("#play-button")).toBeVisible();
});
