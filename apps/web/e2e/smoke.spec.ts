import { expect, test } from '@playwright/test';

test('стартовая страница открывается', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Party Sheet').first()).toBeVisible();
});
