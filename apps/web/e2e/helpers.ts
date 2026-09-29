import { expect, type APIRequestContext, type Page } from '@playwright/test';

export const PASSWORD = 'correct-horse-battery';

export async function registerUser(
  page: Page,
  u: { email: string; username: string; displayName: string; invite?: string },
) {
  await page.goto(u.invite ? `/register?invite=${u.invite}` : '/register');
  await page.getByLabel('Email').fill(u.email);
  await page.getByLabel('Имя пользователя').fill(u.username);
  await page.getByLabel('Отображаемое имя').fill(u.displayName);
  await page.getByLabel('Пароль', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Зарегистрироваться' }).click();
}

export async function login(page: Page, loginName: string, password = PASSWORD) {
  await page.goto('/login');
  await page.getByLabel('Email или имя пользователя').fill(loginName);
  await page.getByLabel('Пароль').fill(password);
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page.getByTestId('user-menu')).toBeVisible();
}

export async function logout(page: Page) {
  await page.getByTestId('user-menu').click();
  await page.getByTestId('logout').click();
  await expect(page).toHaveURL(/\/login$/);
}

/** Прямой вызов tRPC-мутации (формат superjson, без батча). */
export async function trpcMutation(request: APIRequestContext, baseURL: string, path: string, input: unknown) {
  return request.post(`${baseURL}/api/trpc/${path}`, {
    headers: { origin: baseURL, 'content-type': 'application/json' },
    data: { json: input },
  });
}

export async function createSiteInvite(page: Page): Promise<string> {
  await page.goto('/admin');
  const before = await page.getByTestId('invite-code').count();
  await page.getByTestId('create-invite').click();
  await expect(page.getByTestId('invite-code')).toHaveCount(before + 1);
  const code = (await page.getByTestId('invite-code').first().textContent())?.trim();
  if (!code) throw new Error('no invite code');
  return code;
}
