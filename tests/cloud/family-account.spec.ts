import { test, expect } from '@playwright/test';
import { createProfile } from '../ui/helpers';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/');
});

test('an adult can create a family account and sync a child profile', async ({ page }) => {
  const email = `parent-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`;

  await page.getByRole('button', { name: 'Save progress' }).click();
  await page.getByLabel('Adult email').fill(email);
  await page.getByLabel('Password').fill('correct-horse-battery-staple');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Create family account' }).click();

  await expect(page.getByRole('button', { name: 'Family' })).toBeVisible();
  await createProfile(page, 'Milo', 'fa-bolt');
  await expect(page.locator('#profile-text')).toHaveText('Milo');
  await expect(page.locator('#sync-status')).toHaveText('Progress synced', { timeout: 5_000 });

  const syncResponse = await page.request.get('/api/sync');
  expect(syncResponse.ok()).toBe(true);
  const sync = await syncResponse.json() as {
    state: { profiles: Record<string, { name: string }> };
  };
  expect(Object.values(sync.state.profiles).map((profile) => profile.name)).toContain('Milo');

  await page.reload();
  await expect(page.locator('#profile-text')).toHaveText('Milo');
  await expect(page.getByRole('button', { name: 'Family' })).toBeVisible();
});

test('sign in mode does not require the adult confirmation checkbox', async ({ page }) => {
  await page.getByRole('button', { name: 'Save progress' }).click();
  await page.getByRole('button', { name: 'Sign in' }).click();

  const confirmation = page.locator('#adult-confirmation input');
  await expect(confirmation).toBeHidden();
  await expect(confirmation).not.toHaveAttribute('required', '');
  await expect(page.getByRole('button', { name: 'Sign in', exact: true }).last()).toBeVisible();
});
