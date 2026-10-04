import { expect, test } from '@playwright/test';
import superjson from 'superjson';
import { loginAsAdmin } from './helpers';

/** M10: PWA — манифест, service worker, последний открытый лист виден без сети (SPEC §16.4). */

test('манифест и service worker; лист персонажа открывается без сети', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ locale: 'ru-RU', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await loginAsAdmin(page);

  const manifest = await page.request.get(`${baseURL}/manifest.webmanifest`);
  expect(manifest.ok()).toBe(true);
  const m = (await manifest.json()) as { name: string; display: string; icons: { sizes: string; purpose?: string }[] };
  expect(m).toMatchObject({ name: 'Party Sheet', display: 'standalone' });
  expect(m.icons.map((i) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
  expect(m.icons.some((i) => i.purpose === 'maskable')).toBe(true);
  for (const icon of ['/icons/icon-192.png', '/icons/icon-512.png', '/icons/maskable-512.png']) {
    expect((await page.request.get(`${baseURL}${icon}`)).headers()['content-type']).toBe('image/png');
  }
  const sw = await page.request.get(`${baseURL}/serwist/sw.js`);
  expect(sw.ok()).toBe(true);
  expect(sw.headers()['service-worker-allowed']).toBe('/');

  // Персонаж вне кампании.
  const post = async (path: string, input: unknown) => {
    const res = await page.request.post(`${baseURL}/api/trpc/${path}`, {
      headers: { origin: baseURL!, 'content-type': 'application/json' },
      data: superjson.serialize(input),
    });
    return superjson.deserialize<{ id: string; version: number }>(((await res.json()) as { result: { data: never } }).result.data);
  };
  const created = await post('characters.create', { name: 'Путник без сети', campaignId: null });
  await post('characters.updateBuild', {
    characterId: created.id,
    expectedVersion: created.version,
    build: {
      schemaVersion: 1,
      status: 'ready',
      identity: { name: 'Путник без сети', personality: { traits: '', ideals: '', bonds: '', flaws: '' } },
      abilities: { method: 'standard_array', base: { str: 15, dex: 14, con: 13, int: 8, wis: 12, cha: 10 } },
      race: 'srd/race/human',
      background: 'srd/background/acolyte',
      classes: [{ classKey: 'srd/class/fighter' }],
      levels: [{ classKey: 'srd/class/fighter', hp: { method: 'max' } }],
      choices: {},
      knownSpells: [],
      manualEffects: [],
      overrides: {},
    },
  });

  // Первое открытие: service worker устанавливается и берёт страницу под контроль.
  await page.goto(`/characters/${created.id}?mode=play`);
  await expect(page.getByTestId('sheet-header')).toContainText('Путник без сети');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // Второе открытие уже идёт через service worker — он сохраняет страницу, лист и контент.
  await page.reload();
  await expect(page.getByTestId('sheet-header')).toContainText('Путник без сети');
  await expect(page.getByTestId('play-mode')).toBeVisible();
  await expect(page.getByTestId('sticky-stats')).toContainText('12/12');
  await page.waitForTimeout(500);

  // setOffline не действует на запросы самого service worker (Chromium) — рвём сеть маршрутом.
  await context.setOffline(true);
  await context.route('**/*', (route) => route.abort('internetdisconnected'));
  await page.reload();
  await expect(page.getByTestId('sheet-header')).toContainText('Путник без сети');
  await expect(page.getByText('Нет сети: доступен только просмотр')).toBeVisible();
  await expect(page.getByTestId('sticky-stats')).toContainText('12/12');
  // Изменения без сети не отправляются: понятное сообщение.
  await page.getByTestId('btn-damage').click();
  await page.getByRole('dialog').getByRole('button', { name: '3', exact: true }).click();
  await page.getByTestId('hp-apply').click();
  await expect(page.getByText('Нет сети — изменения недоступны.')).toBeVisible();
  await expect(page.getByTestId('sticky-stats')).toContainText('12/12');

  // Незнакомая страница без сети — запасная страница.
  await page.goto('/library/spell/srd/wish').catch(() => undefined);
  await expect(page.getByRole('heading', { name: 'Нет сети' })).toBeVisible();
  await context.close();
});
