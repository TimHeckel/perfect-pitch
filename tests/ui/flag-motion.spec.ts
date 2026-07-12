import { expect, test } from "@playwright/test";
import { openMenu } from "./helpers";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/");
});

test("color blazes advertise pointer interaction and bounce on tap", async ({ page }) => {
  await openMenu(page);
  await page.locator("#trainer-infobox-trigger").click();

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

  const selector = page.locator(".header-sound-control #instrument-selector");
  await expect(selector).toBeVisible();
  await selector.selectOption("guitar");
  await expect(selector).toHaveValue("guitar");
});
