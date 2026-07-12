import { expect, test } from "@playwright/test";

const tabletViewports = [
  { name: "portrait", width: 768, height: 1024 },
  { name: "landscape", width: 1024, height: 768 },
] as const;

for (const viewport of tabletViewports) {
  test(`keeps the complete lesson touch-ready on tablet ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");

    await expect(page.locator("#play-button")).toBeVisible();
    await expect(page.locator("#chord-selector")).toBeVisible();
    await expect(page.locator("#instrument-selector")).toBeVisible();

    const layout = await page.evaluate(() => {
      const rect = (selector: string) => {
        const bounds = document.querySelector(selector)!.getBoundingClientRect();
        return {
          left: bounds.left,
          top: bounds.top,
          right: bounds.right,
          bottom: bounds.bottom,
          width: bounds.width,
          height: bounds.height,
        };
      };

      const flags = [...document.querySelectorAll<HTMLElement>(".flag-wrapper")]
        .map((element) => element.getBoundingClientRect())
        .filter((bounds) => bounds.width > 0 && bounds.height > 0)
        .map((bounds) => ({
          left: bounds.left,
          top: bounds.top,
          right: bounds.right,
          bottom: bounds.bottom,
          width: bounds.width,
          height: bounds.height,
        }));

      return {
        bodyHeight: document.body.scrollHeight,
        viewportHeight: window.innerHeight,
        viewportWidth: window.innerWidth,
        play: rect("#play-button"),
        chordSelector: rect("#chord-selector"),
        audioSelector: rect("#instrument-selector"),
        flags,
      };
    });

    expect(layout.bodyHeight).toBeLessThanOrEqual(layout.viewportHeight + 1);
    expect(layout.play.width).toBeGreaterThanOrEqual(44);
    expect(layout.play.height).toBeGreaterThanOrEqual(44);
    expect(layout.chordSelector.height).toBeGreaterThanOrEqual(40);
    expect(layout.audioSelector.height).toBeGreaterThanOrEqual(40);
    expect(layout.flags).toHaveLength(2);

    for (const flag of layout.flags) {
      expect(flag.width).toBeGreaterThanOrEqual(180);
      expect(flag.height).toBeGreaterThanOrEqual(160);
      expect(flag.left).toBeGreaterThanOrEqual(0);
      expect(flag.top).toBeGreaterThanOrEqual(0);
      expect(flag.right).toBeLessThanOrEqual(layout.viewportWidth);
      expect(flag.bottom).toBeLessThanOrEqual(layout.viewportHeight);
    }
  });
}
