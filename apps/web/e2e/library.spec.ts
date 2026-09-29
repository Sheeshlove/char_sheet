import { expect, test } from '@playwright/test';
import { loginAsAdmin } from './helpers';

test.describe.serial('M4: справочник и бандл контента', () => {
  test('всё оружие, доспехи и снаряжение SRD — с русскими названиями, весом и ценой', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/library?kind=weapon');
    const list = page.getByTestId('library-list');
    await expect(list).toContainText('Длинный меч');
    await expect(list.getByRole('link', { name: /Длинный меч/ })).toContainText('15 зм');
    await expect(list.getByRole('link', { name: /Длинный меч/ })).toContainText('3 фнт.');
    await expect(list.getByRole('link')).toHaveCount(37);

    await page.goto('/library?kind=armor');
    await expect(page.getByTestId('library-list').getByRole('link')).toHaveCount(13);
    await expect(page.getByTestId('library-list')).toContainText('Кольчуга');
    await expect(page.getByTestId('library-list').getByRole('link', { name: /Кольчуга/ })).toContainText('75 зм');

    await page.goto('/library?kind=gear&q=рюкзак');
    await expect(page.getByTestId('library-list').getByRole('link', { name: /Рюкзак/ })).toContainText('2 зм');

    // Подробная карточка
    await page.goto('/library?kind=weapon&q=длинный');
    await page.getByTestId('library-list').getByRole('link', { name: /Длинный меч/ }).click();
    await expect(page.getByRole('heading', { name: 'Длинный меч' })).toBeVisible();
    await expect(page.getByText('1к8 рубящий (двумя руками 1к10)')).toBeVisible();
  });

  test('поиск по-русски и карточка класса с таблицей', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/library');
    await page.getByTestId('library-search').fill('огненный шар');
    await expect(page.getByTestId('library-list')).toContainText('Огненный шар');
    await page.goto('/library/class/srd/barbarian');
    await expect(page.getByRole('heading', { name: 'Варвар' })).toBeVisible();
    await expect(page.getByText('Таблица класса')).toBeVisible();
    await expect(page.getByText('Ярость').first()).toBeVisible();
  });

  test('повторный запрос бандла с тем же ETag возвращает 304', async ({ page, baseURL }) => {
    await loginAsAdmin(page);
    const first = await page.request.get(`${baseURL}/api/content/bundle`);
    expect(first.status()).toBe(200);
    const etag = first.headers()['etag'];
    expect(etag).toBeTruthy();
    expect(first.headers()['cache-control']).toContain('private');
    const body = (await first.json()) as { entities: { key: string; textMd?: string }[] };
    expect(body.entities.length).toBeGreaterThan(900);
    expect(body.entities.some((e) => e.textMd)).toBe(false);
    const second = await page.request.get(`${baseURL}/api/content/bundle`, { headers: { 'if-none-match': etag! } });
    expect(second.status()).toBe(304);
  });
});
