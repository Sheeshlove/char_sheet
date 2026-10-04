import { expect, test, type APIRequestContext, type Browser } from '@playwright/test';
import superjson from 'superjson';
import { createSiteInvite, login, loginAsAdmin, logout, registerUser } from './helpers';

/** M9: панель мастера, homebrew с одобрением, броски. */

const PLAYERS = [
  { email: 'fighter1@example.com', username: 'fighter1', displayName: 'Боец Первый' },
  { email: 'fighter2@example.com', username: 'fighter2', displayName: 'Боец Второй' },
  { email: 'fighter3@example.com', username: 'fighter3', displayName: 'Боец Третий' },
];
const FEAT = 'Бдительный страж';

let campaignId = '';
const chars: string[] = [];
let featKey = '';

async function api<T = unknown>(request: APIRequestContext, baseURL: string, path: string, input?: unknown, method: 'GET' | 'POST' = 'POST') {
  const payload = superjson.serialize(input);
  const res =
    method === 'GET'
      ? await request.get(`${baseURL}/api/trpc/${path}?input=${encodeURIComponent(JSON.stringify(payload))}`)
      : await request.post(`${baseURL}/api/trpc/${path}`, { headers: { origin: baseURL, 'content-type': 'application/json' }, data: payload });
  const body = (await res.json()) as { result?: { data: Parameters<typeof superjson.deserialize>[0] }; error?: { json?: { message?: string } } };
  return { status: res.status(), data: (body.result ? superjson.deserialize(body.result.data) : undefined) as T, error: body.error?.json?.message };
}
const q = <T,>(r: APIRequestContext, b: string, path: string, input?: unknown) => api<T>(r, b, path, input, 'GET');

function fighter(name: string) {
  return {
    schemaVersion: 1,
    status: 'ready',
    identity: { name, personality: { traits: '', ideals: '', bonds: '', flaws: '' } },
    abilities: { method: 'standard_array', base: { str: 15, dex: 14, con: 13, int: 8, wis: 12, cha: 10 } },
    race: 'srd/race/human',
    background: 'srd/background/acolyte',
    classes: [{ classKey: 'srd/class/fighter' }],
    levels: [{ classKey: 'srd/class/fighter', hp: { method: 'max' } }],
    choices: {},
    knownSpells: [],
    manualEffects: [],
    overrides: {},
  };
}

type CharGet = { version: number; state: { xp: number }; sheet: { initiative: { value: number } } };

async function session(browser: Browser, username: string | null) {
  const c = await browser.newContext({ locale: 'ru-RU' });
  const p = await c.newPage();
  if (username) await login(p, username);
  else await loginAsAdmin(p);
  return { c, p, r: p.request };
}

test.describe.serial('M9: панель мастера, homebrew, броски', () => {
  test('подготовка: кампания и три персонажа', async ({ page, baseURL }) => {
    await loginAsAdmin(page);
    const invites = [];
    for (let i = 0; i < PLAYERS.length; i++) invites.push(await createSiteInvite(page));
    campaignId = (await api<{ id: string }>(page.request, baseURL!, 'campaigns.create', { name: 'Логово дракона' })).data.id;
    const code = (await api<{ code: string }>(page.request, baseURL!, 'campaigns.invites.create', { campaignId })).data.code;
    await logout(page);
    for (const [i, u] of PLAYERS.entries()) {
      await registerUser(page, { ...u, invite: invites[i] });
      await expect(page.getByTestId('user-menu')).toBeVisible();
      expect((await api(page.request, baseURL!, 'campaigns.join', { code })).status).toBe(200);
      const created = await api<{ id: string; version: number }>(page.request, baseURL!, 'characters.create', { name: `Страж ${i + 1}`, campaignId });
      const saved = await api(page.request, baseURL!, 'characters.updateBuild', {
        characterId: created.data.id,
        expectedVersion: created.data.version,
        build: fighter(`Страж ${i + 1}`),
      });
      expect(saved.status, saved.error).toBe(200);
      chars.push(created.data.id);
      await logout(page);
    }
  });

  test('мастер выдаёт группе 900 опыта поровну → у каждого +300; автор в журнале — мастер', async ({ page, baseURL }) => {
    await loginAsAdmin(page);
    const me = (await q<{ displayName: string }>(page.request, baseURL!, 'auth.me')).data;
    await page.goto(`/campaigns/${campaignId}/gm`);
    await expect(page.getByTestId('party-row')).toHaveCount(3);
    await page.getByRole('checkbox', { name: 'Выбрать всех' }).click();
    await page.getByTestId('bulk-xp_split').click();
    await page.getByLabel('Сколько опыта').fill('900');
    await expect(page.getByRole('dialog')).toContainText('По 300 каждому (3 перс.)');
    await page.getByTestId('bulk-apply').click();
    await expect(page.getByTestId('party-xp').first()).toContainText('300');
    for (const cell of await page.getByTestId('party-xp').all()) await expect(cell).toContainText('300');

    for (const id of chars) {
      expect((await q<CharGet>(page.request, baseURL!, 'characters.get', { characterId: id })).data.state.xp).toBe(300);
      const events = await q<{ items: { kind: string; actorName: string | null }[] }>(page.request, baseURL!, 'characters.events', { characterId: id });
      expect(events.data.items[0]).toMatchObject({ kind: 'gm.bulk', actorName: me.displayName });
    }
    await page.getByRole('tab', { name: 'Журнал' }).click();
    const log = page.getByTestId('campaign-log');
    await expect(log.locator('li').filter({ hasText: 'получен опыт: 300' })).toHaveCount(3);
    await expect(log).toContainText(me.displayName);

    // Игрок не может выдавать опыт и пользоваться массовыми действиями.
    const player = await session(page.context().browser()!, PLAYERS[0]!.username);
    const denied = await api(player.r, baseURL!, 'characters.bulkCommand', { campaignId, characterIds: chars, action: { kind: 'xp_each', amount: 1 } });
    expect(denied.status).toBe(403);
    await player.c.close();
  });

  test('homebrew-черта «+2 к инициативе» из формы меняет инициативу после одобрения мастером', async ({ browser, baseURL }) => {
    // Игрок 1 создаёт черту в редакторе без JSON и предлагает её в кампанию.
    const author = await session(browser, PLAYERS[0]!.username);
    const p = author.p;
    await p.goto('/homebrew/new');
    await p.getByTestId('hb-target').click();
    await p.getByRole('option', { name: 'Кампания «Логово дракона»' }).click();
    await p.getByLabel('Название', { exact: true }).fill(FEAT);
    await p.getByTestId('add-features').click();
    const feature = p.getByTestId('features-item').first();
    await feature.getByLabel('Название', { exact: true }).fill('Бдительность');
    await feature.getByLabel('Текст').fill('Вы получаете +2 к инициативе.');
    await feature.getByTestId('add-effects').click();
    await feature.getByTestId('effect-type').click();
    await p.getByRole('option', { name: 'Бонус к значению' }).click();
    await feature.getByLabel('Цель').click();
    await p.getByRole('option', { name: 'Инициатива', exact: true }).click();
    await feature.getByLabel('Значение').fill('2');
    await expect(feature.getByTestId('expr-check')).toContainText('2');
    await expect(p.getByTestId('hb-issues')).toContainText('Данные корректны');
    await p.getByTestId('hb-save').click();
    await expect(p).toHaveURL(/\/homebrew\/hb-[^/]+\/feat\/[^/]+\/edit$/);
    featKey = decodeURIComponent(p.url().split('/homebrew/')[1]!.replace(/\/edit$/, ''));
    await p.getByTestId('hb-submit').click();
    await expect.poll(async () => (await q<{ status: string }>(author.r, baseURL!, 'homebrew.get', { key: featKey })).data.status).toBe('proposed');
    await author.c.close();

    // Персонаж игрока 2 доходит до 4 уровня (опыт выдаёт мастер).
    const gm = await session(browser, null);
    expect((await api(gm.r, baseURL!, 'characters.bulkCommand', { campaignId, characterIds: [chars[1]], action: { kind: 'xp_each', amount: 2400 } })).status).toBe(200);
    const player = await session(browser, PLAYERS[1]!.username);
    const get = async () => (await q<CharGet>(player.r, baseURL!, 'characters.get', { characterId: chars[1] })).data;
    for (const level of [2, 3]) {
      const res = await api(player.r, baseURL!, 'characters.levelUp', {
        characterId: chars[1],
        expectedVersion: (await get()).version,
        decision: { classKey: 'srd/class/fighter', hp: { method: 'average' }, ...(level === 3 ? { subclassKey: 'srd/subclass/champion' } : {}) },
      });
      expect(res.status, res.error).toBe(200);
    }
    const before = (await get()).sheet.initiative.value;
    const takeFeat = async () =>
      api(player.r, baseURL!, 'characters.levelUp', {
        characterId: chars[1],
        expectedVersion: (await get()).version,
        decision: { classKey: 'srd/class/fighter', hp: { method: 'average' }, asi: { kind: 'feat', featKey } },
      });
    // До одобрения черта другим игрокам недоступна.
    expect((await takeFeat()).status).toBe(400);

    // Мастер одобряет в панели.
    await gm.p.goto(`/campaigns/${campaignId}/gm?tab=homebrew`);
    const item = gm.p.getByTestId('hb-review-item').filter({ hasText: FEAT });
    await expect(item).toContainText('Бонус к значению');
    await expect(item).toContainText('Инициатива');
    await item.getByTestId('hb-approve').click();
    await expect(gm.p.getByTestId('hb-review-item')).toHaveCount(0);

    const after = await takeFeat();
    expect(after.status, after.error).toBe(200);
    expect((await get()).sheet.initiative.value).toBe(before + 2);
    await player.p.goto(`/characters/${chars[1]}?tab=combat`);
    await expect(player.p.getByTestId('stat-init')).toHaveText(`+${before + 2}`);
    await gm.c.close();
    await player.c.close();
  });

  test('броски: 1d20+5, преимущество, помеха; журнал с видимостью', async ({ browser, baseURL }) => {
    const p1 = await session(browser, PLAYERS[0]!.username);
    await p1.p.goto(`/campaigns/${campaignId}`);
    await p1.p.getByTestId('roll-expression').fill('1d20+5');
    await p1.p.getByTestId('roll-submit').click();
    const total = Number(await p1.p.getByTestId('roll-total').first().innerText());
    expect(total).toBeGreaterThanOrEqual(6);
    expect(total).toBeLessThanOrEqual(25);
    await p1.p.getByRole('radio', { name: 'Преимущество' }).click();
    await p1.p.getByTestId('roll-submit').click();
    await expect(p1.p.getByTestId('roll-log').locator('li')).toHaveCount(2);
    await p1.p.getByRole('radio', { name: 'Помеха' }).click();
    await p1.p.getByTestId('roll-submit').click();
    await expect(p1.p.getByTestId('roll-log').locator('li')).toHaveCount(3);

    type Roll = { label: string; result: { mode: string; total: number; terms: { rolls?: number[]; kept?: boolean[] }[] } };
    const list = async (r: APIRequestContext) => (await q<{ items: Roll[] }>(r, baseURL!, 'rolls.list', { campaignId, limit: 50 })).data.items;
    const [dis, adv, normal] = await list(p1.r);
    expect(normal!.result).toMatchObject({ mode: 'normal' });
    for (const [r, pick] of [
      [adv!, Math.max],
      [dis!, Math.min],
    ] as const) {
      const d = r.result.terms[0]!;
      expect(d.rolls).toHaveLength(2);
      expect(d.kept!.filter(Boolean)).toHaveLength(1);
      expect(r.result.total).toBe(pick(...d.rolls!) + 5);
    }

    // Видимость: «только я», «я и мастер», «вся группа».
    for (const [visibility, label] of [
      ['private', 'Тайный бросок'],
      ['gm', 'Для мастера'],
      ['party', 'Для всех'],
    ] as const) {
      expect((await api(p1.r, baseURL!, 'rolls.roll', { campaignId, expression: '1d20', visibility, label })).status).toBe(200);
    }
    const p2 = await session(browser, PLAYERS[1]!.username);
    const gm = await session(browser, null);
    const labels = async (r: APIRequestContext) => (await list(r)).map((x) => x.label);
    expect(await labels(p1.r)).toEqual(expect.arrayContaining(['Тайный бросок', 'Для мастера', 'Для всех']));
    expect(await labels(gm.r)).toEqual(expect.arrayContaining(['Для мастера', 'Для всех']));
    expect(await labels(gm.r)).not.toContain('Тайный бросок');
    expect(await labels(p2.r)).toContain('Для всех');
    expect(await labels(p2.r)).not.toContain('Для мастера');
    expect(await labels(p2.r)).not.toContain('Тайный бросок');
    // Журнал в интерфейсе у другого игрока.
    await p2.p.goto(`/campaigns/${campaignId}`);
    await expect(p2.p.getByTestId('roll-log')).toContainText('Для всех');
    await expect(p2.p.getByTestId('roll-log')).not.toContainText('Для мастера');
    // Некорректная формула и бросок за чужого персонажа отклоняются.
    expect((await api(p2.r, baseURL!, 'rolls.roll', { campaignId, expression: '1d20+alert(1)' })).status).toBe(400);
    expect((await api(p2.r, baseURL!, 'rolls.roll', { characterId: chars[0], expression: '1d20' })).status).toBe(403);

    // Бросок навыка из листа.
    await p2.p.goto(`/characters/${chars[1]}`);
    await p2.p.getByRole('button', { name: 'Бросок: Проверка: Атлетика' }).click();
    await p2.p.getByRole('dialog').getByRole('button', { name: 'Бросить' }).click();
    await expect(p2.p.getByTestId('roll-result')).toBeVisible();
    for (const s of [p1, p2, gm]) await s.c.close();
  });
});
