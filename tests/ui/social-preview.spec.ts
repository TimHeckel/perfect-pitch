import { expect, test } from '@playwright/test';
import { PNG } from 'pngjs';

test('root exposes a complete large-image social preview', async ({ page }) => {
  await page.goto('/');

  const imageUrl = 'https://pitchtrail.app/static/social/pitchtrail-og.png?v=20260712-1';
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', /Pitch Trail/);
  await expect(page.locator('meta[property="og:description"]')).toHaveAttribute('content', /musical ears/);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', imageUrl);
  await expect(page.locator('meta[property="og:image:width"]')).toHaveAttribute('content', '1200');
  await expect(page.locator('meta[property="og:image:height"]')).toHaveAttribute('content', '630');
  await expect(page.locator('meta[property="og:image:alt"]')).toHaveAttribute('content', /colorful chord-sound explorer/);
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');
  await expect(page.locator('link[rel="image_src"]')).toHaveAttribute('href', imageUrl);

  const response = await page.request.get('/static/social/pitchtrail-og.png?v=20260712-1');
  expect(response.ok()).toBe(true);
  expect(response.headers()['content-type']).toContain('image/png');
  const png = PNG.sync.read(Buffer.from(await response.body()));
  expect({ width: png.width, height: png.height }).toEqual({ width: 1200, height: 630 });
});
