import { expect, test } from '@playwright/test';
import { createSiteInvite, login, logout, PASSWORD, registerUser, trpcMutation } from './helpers';

test.describe.serial('M1: аккаунты', () => {
  let invite = '';

  test('первый пользователь регистрируется без кода и становится админом', async ({ page }) => {
    await registerUser(page, { email: 'admin@example.com', username: 'admin', displayName: 'Админ' });
    await expect(page.getByTestId('user-menu')).toContainText('Админ');
    await expect(page.getByRole('link', { name: 'Админка' }).first()).toBeAttached();
  });

  test('админ создаёт инвайт → друг регистрируется → входит → выходит', async ({ page }) => {
    await login(page, 'admin');
    invite = await createSiteInvite(page);
    await logout(page);

    await registerUser(page, { email: 'friend@example.com', username: 'friend', displayName: 'Друг', invite });
    await expect(page.getByTestId('user-menu')).toContainText('Друг');
    await logout(page);

    await login(page, 'friend@example.com');
    await expect(page.getByRole('heading', { name: 'Добро пожаловать, Друг!' })).toBeVisible();
    await logout(page);

    // После выхода защищённые страницы недоступны
    await page.goto('/settings');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('без инвайта регистрация невозможна; использованный инвайт отклоняется', async ({ page }) => {
    await registerUser(page, { email: 'nobody@example.com', username: 'nobody', displayName: 'Никто' });
    await expect(page.locator('form [role=alert]')).toContainText('недействителен');

    await registerUser(page, { email: 'again@example.com', username: 'again', displayName: 'Снова', invite });
    await expect(page.locator('form [role=alert]')).toContainText('уже использован');
  });

  test('11-я неудачная попытка входа за 15 минут блокируется', async ({ request, baseURL }) => {
    for (let i = 0; i < 10; i++) {
      const res = await trpcMutation(request, baseURL!, 'auth.login', { login: 'friend', password: 'wrong-password' });
      expect(res.status()).toBe(401);
    }
    const blocked = await trpcMutation(request, baseURL!, 'auth.login', { login: 'friend', password: PASSWORD });
    expect(blocked.status()).toBe(429);
  });

  test('мутация с чужим Origin отклоняется', async ({ request, baseURL }) => {
    const res = await request.post(`${baseURL}/api/trpc/auth.login`, {
      headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
      data: { json: { login: 'admin', password: PASSWORD } },
    });
    expect(res.status()).toBe(403);
  });
});
