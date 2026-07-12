import { expect, test } from "@playwright/test";

test("save progress dialog with Google", async ({ page }) => {
  await page.route("**/api/auth/google/status", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ configured: true }),
  }));
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("pitchtrail_info_seen_v1", "true");
  });
  await page.goto("/");
  await page.locator("#account-button").click();
  await expect(page.locator("#google-auth-button")).toBeVisible();
  await expect(page.locator("#account-dialog")).toHaveScreenshot("account-dialog-google.png");
});
