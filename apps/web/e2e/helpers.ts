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
  // Создаём через API и берём код из ответа: список на странице может ещё не загрузиться.
  const origin = new URL(page.url() || 'http://localhost').origin;
  const res = await page.request.post('/api/trpc/admin.invites.create', {
    headers: { origin: origin.startsWith('http') ? origin : '', 'content-type': 'application/json' },
    data: { json: { note: 'e2e', expiresInDays: null } },
  });
  expect(res.ok()).toBe(true);
  const body = (await res.json()) as { result: { data: { json: { code: string } } } };
  return body.result.data.json.code;
}

/** Вход под админом; если пользователей ещё нет — регистрация первого (он становится админом). */
export async function loginAsAdmin(page: Page) {
  const res = await page.request.get('/api/trpc/auth.bootstrapNeeded');
  const bootstrap = ((await res.json()) as { result?: { data?: { json?: boolean } } }).result?.data?.json === true;
  if (bootstrap) {
    await registerUser(page, { email: 'admin@example.com', username: 'admin', displayName: 'Админ' });
    await expect(page.getByTestId('user-menu')).toBeVisible();
    return;
  }
  await login(page, 'admin');
}
