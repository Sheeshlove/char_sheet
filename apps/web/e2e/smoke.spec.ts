import { expect, test } from '@playwright/test';

test('стартовая страница открывается (гостя ведёт на вход)', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/(login|register)?$/);
});
