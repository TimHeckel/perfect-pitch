import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    // Seed session history so onboarding guess/success/retry overlays are skipped
    localStorage.setItem(
      "bsharp_session_history",
      JSON.stringify({ "100": { chord: [{ identifications: 1 }] } }),
    );
    (window as any).__bsharp_test_deterministic_color = "red";
  });
  await page.goto("/");
  // Hide the play onboarding overlay (always shown on init)
  await page.locator("#onboarding-overlay").evaluate((el) => {
    el.classList.remove("visible");
  });
});

test("baseline flag outlines", async ({ page }) => {
  await expect(page.locator("#flag-holder")).toHaveScreenshot(
    "flags-baseline.png",
  );
});

test("correct selection outline", async ({ page }) => {
  await page.locator("#play-button").click();
  await page.waitForTimeout(1000);

  // Red is the forced color, so clicking red is correct
  await page.locator("#red-flag .flag").click();

  await expect(page.locator("#red-flag .flag")).toHaveClass(/flag-correct/);
  await expect(page.locator("#flag-holder")).toHaveScreenshot(
    "flags-correct.png",
  );
});

test("incorrect selection outline", async ({ page }) => {
  await page.locator("#play-button").click();
  await page.waitForTimeout(1000);

  // Red is the forced color, so clicking yellow is wrong
  await page.locator("#yellow-flag .flag").click();

  await expect(page.locator("#yellow-flag .flag")).toHaveClass(/flag-incorrect/);
  await expect(page.locator("#flag-holder")).toHaveScreenshot(
    "flags-incorrect.png",
  );
});

// Helper to seed localStorage state at a given level (chord)
function seedStateAtLevel(chord: string): string {
  const state = {
    profiles: {
      "100": {
        id: 100,
        name: "Guest",
        icon: "fa-user",
        current_chord: chord,
        current_instrument: "piano",
        stats: {
          current_chord: chord,
          start_time: 0,
          updated_time: 0,
          correct: 0,
          incorrect: 0,
          identifications: 0,
          confusion_matrix: {},
        },
        target_number: 10,
        show_chord_mode: "always",
        reveal_chord_mode: "name_and_color",
        chord_display_mode: "shapes_and_letters",
        single_note_mode: false,
        single_note_correctness_mode: "wrong_and_right",
        persist_reaction_face: false,
        enable_onboarding_hints: false,
        color_scheme: "dark",
      },
    },
    current_chord: chord,
    current_profile: 100,
  };
  return JSON.stringify(state);
}

// Scan a PNG buffer for the topmost and bottommost rows containing visible pixels.
function glyphBounds(buf: Buffer): { top: number; bottom: number } {
  const { PNG } = require("pngjs");
  const png = PNG.sync.read(buf);
  const { width, height, data } = png;
  let top = height, bottom = 0;
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      if (data[(row * width + col) * 4 + 3] > 10) {
        top = Math.min(top, row);
        bottom = Math.max(bottom, row);
        break;
      }
    }
  }
  return { top, bottom };
}

test("nav bar icons are consistently sized and aligned", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 1200 });
  await page.goto("/");

  // Strip all backgrounds so element screenshots contain only the glyph
  await page.evaluate(() => {
    document.querySelectorAll("*").forEach((el) => {
      (el as HTMLElement).style.setProperty("background", "transparent", "important");
    });
  });

  const icons = page.locator(".expansion-container i.fa");
  const count = await icons.count();

  // Measure each icon's absolute glyph top/bottom (in screenshot pixels)
  const iconRects = await icons.evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, height: r.height };
    }),
  );

  const absoluteTops: number[] = [];
  const absoluteBottoms: number[] = [];
  const dpr = await page.evaluate(() => window.devicePixelRatio || 1);

  for (let i = 0; i < count; i++) {
    const buf = await icons.nth(i).screenshot({ omitBackground: true });
    const bounds = glyphBounds(buf);
    const absTop = iconRects[i].top + bounds.top / dpr;
    const absBottom = iconRects[i].top + bounds.bottom / dpr;
    absoluteTops.push(absTop);
    absoluteBottoms.push(absBottom);
  }

  // Restore backgrounds for the visual snapshot
  await page.evaluate(() => {
    document.querySelectorAll("*").forEach((el) => {
      (el as HTMLElement).style.removeProperty("background");
    });
  });

  // Draw two shared reference lines: one at the lowest top, one at the highest bottom.
  // All glyphs should touch both lines (no gap above or below).
  const topLine = Math.min(...absoluteTops);
  const bottomLine = Math.max(...absoluteBottoms);

  await page.evaluate(({ topLine, bottomLine }) => {
    const container = document.querySelector(".expansion-container")!;
    const containerRect = container.getBoundingClientRect();
    for (const y of [topLine, bottomLine]) {
      const line = document.createElement("div");
      line.style.cssText = `
        position: absolute; left: 0;
        top: ${y - containerRect.top}px;
        width: 100%; height: 1px;
        background: red; pointer-events: none; z-index: 9999;
      `;
      container.appendChild(line);
    }
  }, { topLine, bottomLine });

  await expect(page.locator(".expansion-container")).toHaveScreenshot(
    "nav-bar-tablet.png",
  );

  // Assert every glyph touches both lines (within 2 CSS pixels tolerance)
  const tolerance = 2;
  for (let i = 0; i < count; i++) {
    const name = await icons.nth(i).getAttribute("class");
    expect(absoluteTops[i], `${name} top should touch top line`).toBeLessThanOrEqual(topLine + tolerance);
    expect(absoluteBottoms[i], `${name} bottom should touch bottom line`).toBeGreaterThanOrEqual(bottomLine - tolerance);
  }
});

test("tablet layout at high level - no menu overlap", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 1200 });
  await page.addInitScript((stateJson: string) => {
    localStorage.clear();
    localStorage.setItem("bsharp_state", stateJson);
    localStorage.setItem(
      "bsharp_session_history",
      JSON.stringify({ "100": { skyblue: [{ identifications: 1 }] } }),
    );
    (window as any).__bsharp_test_deterministic_color = "red";
  }, seedStateAtLevel("skyblue"));
  await page.goto("/");
  await page.locator("#onboarding-overlay").evaluate((el) => {
    el.classList.remove("visible");
  });

  await expect(page).toHaveScreenshot("tablet-high-level.png");
});

test("mobile layout at high level", async ({ page }) => {
  await page.addInitScript((stateJson: string) => {
    localStorage.clear();
    localStorage.setItem("bsharp_state", stateJson);
    localStorage.setItem(
      "bsharp_session_history",
      JSON.stringify({ "100": { skyblue: [{ identifications: 1 }] } }),
    );
    (window as any).__bsharp_test_deterministic_color = "red";
  }, seedStateAtLevel("skyblue"));
  await page.goto("/");
  await page.locator("#onboarding-overlay").evaluate((el) => {
    el.classList.remove("visible");
  });

  await expect(page).toHaveScreenshot("mobile-high-level.png");
});

test("tablet layout at low level", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 1200 });
  await page.addInitScript((stateJson: string) => {
    localStorage.clear();
    localStorage.setItem("bsharp_state", stateJson);
    localStorage.setItem(
      "bsharp_session_history",
      JSON.stringify({ "100": { blue: [{ identifications: 1 }] } }),
    );
    (window as any).__bsharp_test_deterministic_color = "red";
  }, seedStateAtLevel("blue"));
  await page.goto("/");
  await page.locator("#onboarding-overlay").evaluate((el) => {
    el.classList.remove("visible");
  });

  await expect(page).toHaveScreenshot("tablet-low-level.png");
});

test("stats bar after correct guess", async ({ page }) => {
  await page.locator("#play-button").click();
  await page.waitForTimeout(1000);

  await page.locator("#red-flag .flag").click();
  await expect(page.locator("#red-flag .flag")).toHaveClass(/flag-correct/);

  await expect(page.locator("#stats-container")).toHaveScreenshot(
    "stats-correct.png",
  );
});

test("stats bar after incorrect guess", async ({ page }) => {
  await page.locator("#play-button").click();
  await page.waitForTimeout(1000);

  await page.locator("#yellow-flag .flag").click();
  await expect(page.locator("#yellow-flag .flag")).toHaveClass(/flag-incorrect/);

  await expect(page.locator("#stats-container")).toHaveScreenshot(
    "stats-incorrect.png",
  );
});
