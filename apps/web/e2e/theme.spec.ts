import { expect, test } from '@playwright/test';
import { loginAsAdmin } from './helpers';

/** Тема хранится в cookie, класс `<html>` ставит сервер — без мигания и скрипта в `<head>`. */
test('светлая тема из настроек сохраняется после перезагрузки', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/settings');
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);

  await page.getByRole('combobox').filter({ hasText: 'Тёмная' }).click();
  await page.getByRole('option', { name: 'Светлая' }).click();
  await expect(page.locator('html')).toHaveClass(/\blight\b/);

  await page.reload();
  await expect(page.locator('html')).toHaveClass(/\blight\b/);
  await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);
  // Сервер отдаёт уже светлую страницу.
  const html = await (await page.request.get('/settings')).text();
  expect(html).toMatch(/<html[^>]*class="[^"]*\blight\b/);

  // Переключатель в меню пользователя возвращает тёмную.
  await page.getByTestId('user-menu').click();
  await page.getByRole('menuitem', { name: 'Тёмная' }).click();
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);
});
