import { expect, test } from '@playwright/test';

test('a newly unlocked color is heard before it joins practice', async ({ page }) => {
  await page.addInitScript(() => {
    const now = Math.floor(Date.now() / 1000);
    localStorage.clear();
    localStorage.setItem('pitchtrail_info_seen_v1', 'true');
    localStorage.setItem('bsharp_state', JSON.stringify({
      profiles: {
        100: {
          id: 100,
          name: 'Guest',
          icon: 'fa-user',
          target_number: 10,
          current_chord: 'blue',
          current_instrument: 'piano_1',
          chord_selection_mode: 'adaptive',
          introduced_chords: ['red', 'yellow'],
          stats: {
            current_chord: 'blue',
            start_time: now,
            updated_time: now,
            correct: 0,
            identifications: 0,
            confusion_matrix: {},
            notes: { correct: 0, identifications: 0, confusion_matrix: {} },
            done: false,
          },
        },
      },
      current_chord: 'blue',
      current_profile: 100,
    }));
  });
  await page.goto('/');

  await page.locator('#play-button').click();
  const dialog = page.locator('#color-introduction-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('h2')).toHaveText('Meet blue');
  await expect(page.locator('#start-new-color-trail')).toBeDisabled();

  await page.locator('#hear-new-color').click();
  await expect(page.locator('#color-introduction-marker')).toHaveClass(/blue/);
  await expect(page.locator('#color-introduction-marker')).toHaveClass(/heard/);
  await expect(page.locator('#start-new-color-trail')).toBeEnabled();

  await page.locator('#start-new-color-trail').click();
  await expect(dialog).not.toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('bsharp_state')!);
    return state.profiles[state.current_profile].introduced_chords;
  })).toContain('blue');
});
