import { test, expect } from '@playwright/test';

test('guest can finish, review and recover a hand', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Play the hand. Study the decision.' })).toBeVisible();
  await page.getByRole('link', { name: 'Start playing' }).click();
  await page.getByRole('button', { name: 'Deal the first hand' }).click();
  await expect(page.getByRole('heading', { name: 'Your decision' })).toBeVisible();
  if (process.env.CAPTURE_SCREENSHOTS === '1') {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: 'docs/screenshots/table-desktop.png', fullPage: true });
  }
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Your decision' })).toBeVisible();
  await page.getByRole('button', { name: /Fold/ }).click();
  await expect(page.getByRole('heading', { name: 'Hand complete' })).toBeVisible();
  await page.getByRole('link', { name: 'Review hand' }).click();
  await expect(page.getByRole('heading', { name: /Decision 1 of 1/ })).toBeVisible();
  await expect(page.getByText('Uniform legal opponent hands')).toBeVisible();
  if (process.env.CAPTURE_SCREENSHOTS === '1') {
    await expect(page.getByText('Calculating…')).toBeHidden({ timeout: 10_000 });
    await page.screenshot({ path: 'docs/screenshots/review-desktop.png', fullPage: true });
  }
  await page.getByRole('link', { name: 'History', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Hand history' })).toBeVisible();
  await expect(page.locator('article').filter({ hasText: 'standard' })).toHaveCount(1);
  await page.close();
});

test('narrow table has no horizontal page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/play');
  await page.getByRole('button', { name: 'Deal the first hand' }).click();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.close();
});

test('keyboard controls finish a hand and ignore typing in the raise field', async ({ page }) => {
  await page.goto('/play');
  await expect(page.getByRole('button', { name: 'Deal the first hand' })).toBeEnabled();
  for (let i = 0; i < 12; i++) {
    if (await page.evaluate(() => document.activeElement?.tagName === 'BUTTON' && document.activeElement.textContent?.trim() === 'Deal the first hand')) break;
    await page.keyboard.press('Tab');
  }
  await expect(page.getByRole('button', { name: 'Deal the first hand' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Your decision' })).toBeVisible();
  await page.getByRole('spinbutton', { name: 'Raise to' }).focus();
  await page.keyboard.press('f');
  await expect(page.getByRole('heading', { name: 'Your decision' })).toBeVisible();
  await page.getByRole('spinbutton', { name: 'Raise to' }).press('Tab');
  await page.keyboard.press('f');
  await expect(page.getByRole('heading', { name: 'Hand complete' })).toBeVisible();
});

test('second tab waits read-only and takes the session lock when released', async ({ page }) => {
  await page.goto('/play');
  await expect(page.getByRole('button', { name: 'Deal the first hand' })).toBeEnabled();
  const second = await page.context().newPage();
  await second.goto('/play');
  await expect(second.getByText('This session is open in another tab')).toBeVisible();
  await expect(second.getByRole('button', { name: 'Deal the first hand' })).toBeDisabled();
  await page.close();
  await expect(second.getByRole('button', { name: 'Deal the first hand' })).toBeEnabled();
  await second.close();
});
