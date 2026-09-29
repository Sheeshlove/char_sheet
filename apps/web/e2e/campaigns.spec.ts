import { expect, test } from '@playwright/test';
import { createSiteInvite, login, logout, registerUser } from './helpers';

test.describe.serial('M2: кампании', () => {
  test('мастер создаёт кампанию → игрок вступает по ссылке → видит кампанию в списке', async ({ page }) => {
    // Мастер — пользователь admin из auth.spec (БД общая для прогона); создаём ещё одного игрока.
    await login(page, 'admin');
    const siteInvite = await createSiteInvite(page);

    await page.goto('/campaigns');
    await page.getByRole('button', { name: 'Новая кампания' }).click();
    await page.getByLabel('Название').fill('Проклятие Страда');
    await page.getByRole('button', { name: 'Создать' }).click();
    await expect(page.getByRole('heading', { name: 'Проклятие Страда' })).toBeVisible();
    const campaignUrl = page.url();

    await page.getByTestId('create-campaign-invite').click();
    const code = (await page.getByTestId('campaign-invite-code').first().textContent())!.trim();
    await logout(page);

    await registerUser(page, { email: 'player@example.com', username: 'player', displayName: 'Игрок', invite: siteInvite });
    await expect(page.getByTestId('user-menu')).toBeVisible();

    await page.goto(`/join/${code}`);
    await expect(page.getByText('Проклятие Страда')).toBeVisible();
    await page.getByRole('button', { name: 'Вступить в кампанию' }).click();
    await expect(page).toHaveURL(campaignUrl);
    await expect(page.getByTestId('members')).toContainText('Игрок');

    await page.goto('/campaigns');
    await expect(page.getByTestId('campaign-list')).toContainText('Проклятие Страда');
    await expect(page.getByTestId('campaign-list')).toContainText('Игрок');
    await logout(page);
  });

  test('гость по ссылке-приглашению попадает на вход и возвращается к приглашению', async ({ page }) => {
    await page.goto('/join/NOSUCHCODE');
    await expect(page).toHaveURL(/\/login\?next=/);
    await page.getByLabel('Email или имя пользователя').fill('player');
    await page.getByLabel('Пароль').fill('correct-horse-battery');
    await page.getByRole('button', { name: 'Войти' }).click();
    await expect(page).toHaveURL(/\/join\/NOSUCHCODE$/);
    await expect(page.getByRole('alert').filter({ hasText: 'недействительна' })).toBeVisible();
  });
});
