import { expect, test } from "@playwright/test";
import { openMenu } from "./helpers";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("pitchtrail_info_seen_v1", "true");
  });
  await page.goto("/");
});

test("color blazes advertise pointer interaction and bounce on tap", async ({ page }) => {
  await openMenu(page);
  await page.locator("#trainer-infobox-trigger").click();

  await expect(page.locator("#trainer-instruction")).toHaveText(
    "Tap any color to hear its sound.",
  );
  const blaze = page.locator("#trainer-infobox .flag.trainer.red");
  await expect(blaze).toBeVisible();
  await expect(blaze).toHaveCSS("cursor", "pointer");

  await blaze.dispatchEvent("pointerdown", {
    pointerId: 1,
    isPrimary: true,
    pointerType: "touch",
  });
  await expect(blaze).toHaveClass(/flag-bounce/);

  await blaze.dispatchEvent("animationend", { animationName: "flag-bounce" });
  await expect(blaze).not.toHaveClass(/flag-bounce/);
});

test("sound selector remains available while a panel is open", async ({ page }) => {
  await openMenu(page);
  await page.locator("#i-infobox-trigger").click();

  const guitar = page.locator(".header-sound-control #sound-guitar");
  await expect(guitar).toBeVisible();
  await guitar.click();
  await expect(guitar).toHaveAttribute("aria-pressed", "true");
});
