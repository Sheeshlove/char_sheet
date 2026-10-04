import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { createSiteInvite, login, loginAsAdmin, logout, registerUser, trpcMutation } from './helpers';

/**
 * M7: конструктор → лист (эталон 03), повышение уровня и отдых, игровой режим на телефоне,
 * одновременные команды игрока и мастера, PDF, права доступа к персонажу.
 */

const PLAYER = { email: 'mage@example.com', username: 'mage', displayName: 'Маг' };
const OUTSIDER = { email: 'stranger@example.com', username: 'stranger', displayName: 'Чужак' };
const NAME = 'Лианна Звездопад';
// PNG 1×1: сервер всё равно приводит портрет к 512×512 WebP.
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

let characterId = '';
let campaignId = '';

type CharacterState = { hp: { current: number }; hitDiceUsed: Record<string, number>; slotsUsed: number[]; currency: { gp: number }; xp: number };

async function getCharacter(request: APIRequestContext, baseURL: string, id: string) {
  const input = encodeURIComponent(JSON.stringify({ json: { characterId: id } }));
  return request.get(`${baseURL}/api/trpc/characters.get?input=${input}`);
}

async function stateOf(request: APIRequestContext, baseURL: string): Promise<CharacterState> {
  const res = await getCharacter(request, baseURL, characterId);
  expect(res.ok()).toBe(true);
  return ((await res.json()) as { result: { data: { json: { state: CharacterState } } } }).result.data.json.state;
}

async function command(request: APIRequestContext, baseURL: string, cmd: Record<string, unknown>) {
  return trpcMutation(request, baseURL, 'characters.command', { characterId, command: cmd });
}

/** `hp-current` показывает «текущие / максимум». */
const hp = (current: number | string) => new RegExp(`^${current}\\s*/`);

async function openSheet(page: Page, query = '') {
  await page.goto(`/characters/${characterId}${query}`);
  await expect(page.getByTestId('sheet-header')).toBeVisible();
}

test.describe.serial('M7: персонажи', () => {
  test('подготовка: игрок и посторонний пользователь', async ({ page }) => {
    await loginAsAdmin(page);
    const invites = [await createSiteInvite(page), await createSiteInvite(page)];
    await logout(page);
    for (const [i, u] of [PLAYER, OUTSIDER].entries()) {
      await registerUser(page, { ...u, invite: invites[i] });
      await expect(page.getByTestId('user-menu')).toBeVisible();
      await logout(page);
    }
  });

  test('игрок создаёт эльфа-волшебника через конструктор; числа совпадают с эталоном 03', async ({ page }) => {
    await login(page, PLAYER.username);
    await page.goto('/characters/new');
    await page.getByLabel('Имя персонажа').fill(NAME);
    await page.getByRole('button', { name: 'Начать создание' }).click();
    await expect(page).toHaveURL(/\/characters\/[^/]+\/build/);
    characterId = page.url().match(/characters\/([^/]+)\/build/)![1]!;
    await expect(page.getByTestId('builder-preview')).toBeVisible();
    const step = (name: string) => page.getByRole('navigation').getByRole('button', { name: new RegExp(name) }).click();

    // Раса: высший эльф, заговор и дополнительный язык.
    await page.getByRole('radio', { name: /^Эльф/ }).click();
    await page.getByRole('radio', { name: /^Высший эльф/ }).click();
    await page.locator('[data-choice-key$="#cantrip"]').getByText('Малая иллюзия').click();
    await page.locator('[data-choice-key$="#language"]').getByText('Драконий', { exact: true }).click();

    // Класс: волшебник, навыки.
    await step('Класс');
    await page.getByRole('radio', { name: /^Волшебник/ }).click();
    const skills = page.locator('[data-choice-key$="#proficiencies#skills"]');
    await skills.getByText('Магия', { exact: true }).click();
    await skills.getByText('История', { exact: true }).click();

    // Характеристики: стандартный набор, как в эталоне.
    await step('Характеристики');
    const assign = async (label: string, v: number) => {
      await page.getByRole('combobox', { name: label, exact: true }).click();
      await page.getByRole('option', { name: String(v), exact: true }).click();
    };
    await assign('Интеллект', 15);
    await assign('Ловкость', 14);
    await assign('Телосложение', 13);
    await assign('Мудрость', 12);
    await assign('Харизма', 10);
    await assign('Сила', 8);

    // Предыстория: прислужник, два языка.
    await step('Предыстория');
    await page.getByRole('radio', { name: /^Прислужник/ }).click();
    const langs = page.locator('[data-choice-key$="#proficiencies#languages"]');
    await langs.getByText('Дварфийский', { exact: true }).click();
    await langs.getByText('Полуросликов', { exact: true }).click();

    // Снаряжение: варианты по умолчанию.
    await step('Снаряжение');

    // Заклинания: три заговора и шесть заклинаний в книге.
    await step('Заклинания');
    const cantrips = page.locator('[data-choice-key$=":cantrips"]');
    for (const n of ['Огненный снаряд', 'Свет', 'Волшебная рука']) await cantrips.getByText(n, { exact: true }).click();
    const book = page.locator('[data-choice-key$=":spellbook"]');
    for (const n of ['Доспехи мага', 'Волшебная стрела', 'Щит', 'Огненные ладони', 'Усыпление', 'Обнаружение магии']) {
      await book.getByText(n, { exact: true }).click();
    }

    // Описание: портрет обрезается сервером.
    await step('Описание');
    await page.getByTestId('portrait-input').setInputFiles({ name: 'portrait.png', mimeType: 'image/png', buffer: PNG_1X1 });
    await expect(page.getByRole('img', { name: new RegExp(NAME) })).toHaveAttribute('src', /^\/api\/files\//);

    await expect(page.getByTestId('builder-issues')).toHaveCount(0);
    await page.getByRole('button', { name: 'Готово' }).click();
    await expect(page).toHaveURL(new RegExp(`/characters/${characterId}$`));
    await expect(page.getByTestId('sheet-header')).toBeVisible();

    // Основное: характеристики и навыки.
    await expect(page.getByTestId('ability-dex')).toContainText('16');
    await expect(page.getByTestId('ability-int')).toContainText('16');
    await expect(page.getByTestId('skill-perception')).toContainText('+3');

    // Заклинания: сл 13, подготовить «Доспехи мага».
    await openSheet(page, '?tab=spells');
    await expect(page.getByTestId('spell-dc-srd/class/wizard')).toHaveText('13');
    await expect(page.getByTestId('slots-1').getByRole('group')).toHaveAttribute('aria-label', /2\/2$/);
    for (const n of ['Доспехи мага', 'Волшебная стрела', 'Щит', 'Усыпление']) {
      await page.getByRole('checkbox', { name: `Подготовлено: ${n}` }).click();
      await expect(page.getByRole('checkbox', { name: `Подготовлено: ${n}` })).toBeChecked();
    }

    // Бой: хиты 7, «Огненный снаряд» +5 1к10, КД 13 → 16 с «Доспехами мага».
    await openSheet(page, '?tab=combat');
    await expect(page.getByTestId('hp-max')).toHaveText('7');
    const fireBolt = page.getByTestId('attack-row').filter({ hasText: 'Огненный снаряд' });
    await expect(fireBolt).toContainText('+5');
    await expect(fireBolt).toContainText('1к10');
    await expect(page.getByTestId('stat-ac')).toHaveText('13');
    await page.locator('[data-testid="toggle-spell:srd/spell/mage-armor"]').getByRole('switch').click();
    await expect(page.getByTestId('stat-ac')).toHaveText('16');
  });

  test('повышение до 3 уровня, урон, короткий отдых с костью хитов, долгий отдых', async ({ page, baseURL }) => {
    await login(page, PLAYER.username);
    await openSheet(page);
    // Персонаж вне кампании: опыт добавляет сам игрок.
    await page.getByRole('button', { name: 'Ещё' }).click();
    await page.getByRole('menuitem', { name: 'Добавить опыт' }).click();
    await page.getByRole('spinbutton', { name: 'Опыт' }).fill('900');
    await page.getByRole('button', { name: 'Добавить' }).click();
    await expect(page.getByTestId('xp')).toContainText('900');

    for (const [level, hpAfter] of [
      [2, '12'],
      [3, '17'],
    ] as const) {
      await page.getByTestId('btn-level-up').click();
      await expect(page.getByTestId('levelup-apply')).toBeVisible();
      const sub = page.locator('[data-choice-key^="subclass:"]');
      if (level === 2) await sub.getByText('Школа воплощения').click();
      const book = page.locator('[data-choice-key$=":spellbook"]');
      for (let i = 0; i < 2; i++) {
        await book.locator('button[role=checkbox]:not([data-state=checked]):not([disabled])').first().click();
      }
      await expect(page.getByTestId('levelup-hp-after')).toHaveText(hpAfter);
      await page.getByTestId('levelup-apply').click();
      await expect(page).toHaveURL(new RegExp(`/characters/${characterId}$`));
      await expect(page.getByTestId('sheet-header')).toBeVisible();
    }

    await openSheet(page, '?tab=combat');
    await expect(page.getByTestId('hp-max')).toHaveText('17');
    await expect(page.getByTestId('hp-current')).toHaveText(hp('17'));

    // Урон 10 → 7.
    await page.getByTestId('btn-damage').click();
    await page.getByTestId('hp-amount').fill('10');
    await page.getByTestId('hp-apply').click();
    await expect(page.getByTestId('hp-current')).toHaveText(hp('7'));

    // Короткий отдых: одна к6 с результатом 4, Тел +1 → 12 хитов, потрачена 1 кость из 3.
    await page.getByRole('button', { name: 'Короткий отдых' }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: /к6/ }).click();
    await dialog.getByRole('spinbutton', { name: 'к6' }).fill('4');
    await expect(dialog).toContainText('+5');
    await dialog.getByRole('button', { name: 'Короткий отдых' }).click();
    await expect(page.getByTestId('hp-current')).toHaveText(hp('12'));
    expect((await stateOf(page.request, baseURL!)).hitDiceUsed.d6).toBe(1);

    // Трата ячейки 1 круга и долгий отдых: всё восстановлено.
    await openSheet(page, '?tab=spells');
    await expect(page.getByTestId('slots-1').getByRole('group')).toHaveAttribute('aria-label', /4\/4$/);
    await expect(page.getByTestId('slots-2').getByRole('group')).toHaveAttribute('aria-label', /2\/2$/);
    await page.getByTestId('slots-1').getByRole('button').first().click();
    await expect(page.getByTestId('slots-1').getByRole('group')).toHaveAttribute('aria-label', /3\/4$/);
    await expect.poll(async () => (await stateOf(page.request, baseURL!)).slotsUsed[1]).toBe(1);
    await openSheet(page, '?tab=combat');
    await page.getByRole('button', { name: 'Продолжительный отдых' }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Подтвердить' }).click();
    await expect(page.getByTestId('hp-current')).toHaveText(hp('17'));
    await openSheet(page, '?tab=spells');
    await expect(page.getByTestId('slots-1').getByRole('group')).toHaveAttribute('aria-label', /4\/4$/);
    const state = await stateOf(page.request, baseURL!);
    expect(state.hitDiceUsed.d6).toBe(0);
    expect(state.slotsUsed.every((n) => n === 0)).toBe(true);
  });

  test('телефон 390×844: игровой режим, урон, лечение, трата ячейки', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'ru-RU' });
    const page = await context.newPage();
    await login(page, PLAYER.username);
    await page.goto(`/characters/${characterId}`);
    await page.getByTestId('btn-play-mode').click();
    await expect(page.getByTestId('play-mode')).toBeVisible();
    await expect(page.getByTestId('sticky-stats')).toBeVisible();
    await expect(page.getByTestId('sticky-ac')).toHaveText('13');

    // Урон с цифровой клавиатуры: 5 → 12.
    await page.getByTestId('btn-damage').click();
    await page.getByRole('dialog').getByRole('button', { name: '5', exact: true }).click();
    await page.getByTestId('hp-apply').click();
    await expect(page.getByTestId('hp-current')).toHaveText(hp('12'));
    await expect(page.getByTestId('sticky-stats')).toContainText('12/17');

    // Лечение: 3 → 15.
    await page.getByTestId('btn-heal').click();
    await page.getByRole('dialog').getByRole('button', { name: '3', exact: true }).click();
    await page.getByTestId('hp-apply').click();
    await expect(page.getByTestId('hp-current')).toHaveText(hp('15'));

    // Ячейка 2 круга.
    await page.getByTestId('slots-2').getByRole('button').first().click();
    await expect(page.getByTestId('slots-2').getByRole('group')).toHaveAttribute('aria-label', /1\/2$/);

    // Страница не шире экрана.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);

    // После перезагрузки значения с сервера.
    await page.reload();
    await expect(page.getByTestId('hp-current')).toHaveText(hp('15'));
    await expect(page.getByTestId('slots-2').getByRole('group')).toHaveAttribute('aria-label', /1\/2$/);
    await context.close();
  });

  test('одновременные команды игрока и мастера не теряют изменений', async ({ browser, baseURL }) => {
    const gmContext = await browser.newContext({ locale: 'ru-RU' });
    const gm = await gmContext.newPage();
    await loginAsAdmin(gm);
    const created = await trpcMutation(gm.request, baseURL!, 'campaigns.create', { name: 'Логово Чёрного Паука' });
    campaignId = ((await created.json()) as { result: { data: { json: { id: string } } } }).result.data.json.id;
    const invite = await trpcMutation(gm.request, baseURL!, 'campaigns.invites.create', { campaignId });
    const code = ((await invite.json()) as { result: { data: { json: { code: string } } } }).result.data.json.code;

    const playerContext = await browser.newContext({ locale: 'ru-RU' });
    const player = await playerContext.newPage();
    await login(player, PLAYER.username);
    expect((await trpcMutation(player.request, baseURL!, 'campaigns.join', { code })).ok()).toBe(true);
    expect((await trpcMutation(player.request, baseURL!, 'characters.attach', { characterId, campaignId })).ok()).toBe(true);

    // В кампании опыт выдаёт только мастер.
    const xpByPlayer = await command(player.request, baseURL!, { type: 'gain_xp', amount: 100 });
    expect(xpByPlayer.status()).toBe(403);
    expect((await command(gm.request, baseURL!, { type: 'gain_xp', amount: 100 })).ok()).toBe(true);

    const before = await stateOf(player.request, baseURL!);
    // Оба клиента шлют команды одновременно: по 10 золотых и по 2 урона от каждого.
    const burst = (request: APIRequestContext) => [
      ...Array.from({ length: 10 }, () => command(request, baseURL!, { type: 'add_currency', currency: { gp: 1 } })),
      ...Array.from({ length: 2 }, () => command(request, baseURL!, { type: 'damage', amount: 1 })),
    ];
    const results = await Promise.all([...burst(player.request), ...burst(gm.request)]);
    for (const r of results) expect(r.ok()).toBe(true);

    const after = await stateOf(gm.request, baseURL!);
    expect(after.currency.gp).toBe(before.currency.gp + 20);
    expect(after.hp.current).toBe(before.hp.current - 4);
    expect(after.xp).toBe(before.xp);

    // Оба клиента видят одно и то же.
    for (const page of [player, gm]) {
      await page.goto(`/characters/${characterId}?tab=combat`);
      await expect(page.getByTestId('hp-current')).toHaveText(hp(after.hp.current));
    }
    // Мастер лечит через интерфейс — открытый лист игрока подхватывает изменение опросом (5 с).
    await gm.getByTestId('btn-heal').click();
    await gm.getByTestId('hp-amount').fill('4');
    await gm.getByTestId('hp-apply').click();
    await expect(gm.getByTestId('hp-current')).toHaveText(hp(after.hp.current + 4));
    await expect(player.getByTestId('hp-current')).toHaveText(hp(after.hp.current + 4), { timeout: 12_000 });
    // И наоборот: трата ячейки игроком видна мастеру без перезагрузки.
    for (const page of [player, gm]) {
      await page.goto(`/characters/${characterId}?tab=spells`);
      await expect(page.getByTestId('slots-1').getByRole('group')).toHaveAttribute('aria-label', /4\/4$/);
    }
    await player.getByTestId('slots-1').getByRole('button').first().click();
    await expect(gm.getByTestId('slots-1').getByRole('group')).toHaveAttribute('aria-label', /3\/4$/, { timeout: 12_000 });

    await gmContext.close();
    await playerContext.close();
  });

  test('PDF открывается и содержит шрифт с кириллицей', async ({ page, baseURL }) => {
    await login(page, PLAYER.username);
    const res = await page.request.get(`${baseURL}/characters/${characterId}/pdf`);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('application/pdf');
    const body = await res.body();
    expect(body.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    // Кириллица выводится встроенным PT Sans (у стандартных шрифтов PDF её нет).
    expect(body.toString('latin1')).toMatch(/PTSans/);
  });

  test('посторонний пользователь не видит и не меняет персонажа', async ({ page, baseURL }) => {
    await login(page, OUTSIDER.username);
    expect((await getCharacter(page.request, baseURL!, characterId)).status()).toBe(404);
    expect((await command(page.request, baseURL!, { type: 'damage', amount: 5 })).status()).toBe(404);
    expect((await page.request.get(`${baseURL}/characters/${characterId}/pdf`)).status()).toBe(404);
    const build = await trpcMutation(page.request, baseURL!, 'characters.levelUp', {
      characterId,
      expectedVersion: 1,
      decision: { classKey: 'srd/class/wizard', hp: { method: 'average' } },
    });
    expect(build.status()).toBe(404);
    await page.goto(`/characters/${characterId}`);
    await expect(page.getByTestId('sheet-header')).toHaveCount(0);
  });
});
