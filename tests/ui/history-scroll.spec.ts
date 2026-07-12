import { expect, test } from '@playwright/test';
import { openMenu } from './helpers';

test('long practice history scrolls independently on a phone', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('pitchtrail_info_seen_v1', 'true');
    const now = Math.floor(Date.now() / 1000);
    const stats = {
      current_chord: 'yellow', start_time: now, updated_time: now,
      correct: 0, identifications: 0, confusion_matrix: {},
      notes: { correct: 0, identifications: 0, confusion_matrix: {} }, done: false,
    };
    const profile = {
      id: 100, name: 'Guest', icon: 'fa-user', target_number: 10,
      current_chord: 'yellow', current_instrument: 'piano_1', stats,
      introduced_chords: ['red', 'yellow'],
    };
    localStorage.setItem('bsharp_state', JSON.stringify({
      profiles: { 100: profile }, current_profile: 100, current_chord: 'yellow',
    }));
    const sessions = Array.from({ length: 32 }, (_, index) => ({
      ...stats,
      current_chord: index % 2 ? 'yellow' : 'red',
      start_time: now - index * 3600,
      updated_time: now - index * 3600,
      correct: 8 + (index % 3),
      identifications: 10,
      done: true,
    }));
    localStorage.setItem('bsharp_session_history', JSON.stringify({
      [profile.id]: { yellow: sessions },
    }));
  });
  await page.goto('/');

  await openMenu(page);
  await page.locator('#stats-history-trigger').click();
  const history = page.locator('#stats-history-container');
  await expect(history.locator('.stats-history-item')).toHaveCount(32);

  const before = await history.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    overflowY: getComputedStyle(element).overflowY,
    touchAction: getComputedStyle(element).touchAction,
  }));
  expect(before.scrollHeight).toBeGreaterThan(before.clientHeight);
  expect(before.overflowY).toBe('scroll');
  expect(before.touchAction).toBe('pan-y');

  await history.evaluate((element) => { element.scrollTop = 240; });
  await expect.poll(() => history.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
});
