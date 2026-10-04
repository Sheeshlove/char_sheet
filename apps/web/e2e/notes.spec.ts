import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import superjson from 'superjson';
import { createSiteInvite, login, loginAsAdmin, logout, registerUser } from './helpers';

/**
 * M8: заметки — WikiLink и обратные ссылки, поиск, права на видимость (API),
 * сравнение, доска улик, граф, хронология, канбан, экспорт/импорт.
 */

const SCRIBE = { email: 'scribe@example.com', username: 'scribe', displayName: 'Летописец' };
const ROGUE = { email: 'rogue@example.com', username: 'rogue', displayName: 'Плут' };

let campaignId = '';
const ids: Record<string, string> = {};

async function api<T = unknown>(request: APIRequestContext, baseURL: string, path: string, input?: unknown, method: 'GET' | 'POST' = 'POST') {
  const payload = superjson.serialize(input);
  const res =
    method === 'GET'
      ? await request.get(`${baseURL}/api/trpc/${path}?input=${encodeURIComponent(JSON.stringify(payload))}`)
      : await request.post(`${baseURL}/api/trpc/${path}`, { headers: { origin: baseURL, 'content-type': 'application/json' }, data: payload });
  const body = (await res.json()) as { result?: { data: Parameters<typeof superjson.deserialize>[0] } };
  return { status: res.status(), data: (body.result ? superjson.deserialize(body.result.data) : undefined) as T };
}
const q = <T,>(r: APIRequestContext, b: string, path: string, input?: unknown) => api<T>(r, b, path, input, 'GET');

type NoteGet = { id: string; title: string; updatedAt: Date; tags: { name: string }[] };
type NoteList = { items: { id: string; title: string; fields: Record<string, unknown>; updatedAt: Date }[] };

/** Экран заметок: дождаться, пока потоковый SSR вставит блок на место (скрытая копия исчезнет). */
async function gotoNotes(page: Page, path = `/campaigns/${campaignId}/notes`) {
  await page.goto(path);
  await expect(page.getByTestId('notes-search')).toHaveCount(1);
}

async function waitSaved(page: Page) {
  await expect(page.getByTestId('save-status')).toHaveText('Сохранено', { timeout: 10_000 });
}

test.describe.serial('M8: заметки', () => {
  test('подготовка: кампания мастера и два игрока', async ({ page, baseURL }) => {
    await loginAsAdmin(page);
    const invites = [await createSiteInvite(page), await createSiteInvite(page)];
    const created = await api<{ id: string }>(page.request, baseURL!, 'campaigns.create', { name: 'Рудник Фанделвера' });
    campaignId = created.data.id;
    const code = (await api<{ code: string }>(page.request, baseURL!, 'campaigns.invites.create', { campaignId })).data.code;
    await logout(page);
    for (const [i, u] of [SCRIBE, ROGUE].entries()) {
      await registerUser(page, { ...u, invite: invites[i] });
      await expect(page.getByTestId('user-menu')).toBeVisible();
      expect((await api(page.request, baseURL!, 'campaigns.join', { code })).status).toBe(200);
      await logout(page);
    }
  });

  test('заметка НИП, ссылка на неё из заметки сессии через [[, обратная ссылка', async ({ page }) => {
    await login(page, SCRIBE.username);
    await gotoNotes(page);
    await page.getByTestId('note-new').click();
    await page.getByTestId('note-title').fill('Гундрен Искатель Скал');
    await page.getByTestId('note-type').click();
    await page.getByRole('option', { name: 'НИП' }).click();
    await page.getByTestId('note-visibility').click();
    await page.getByRole('option', { name: 'Для группы' }).click();
    await waitSaved(page);
    ids.npc = page.url().split('/').pop()!.split('?')[0]!;

    await page.getByTestId('note-new').click();
    await expect(page).not.toHaveURL(new RegExp(ids.npc));
    await expect(page.getByTestId('note-title')).toHaveValue('');
    await page.getByTestId('note-title').fill('Сессия 1');
    await page.getByTestId('note-type').click();
    await page.getByRole('option', { name: 'Сессия', exact: true }).click();
    await page.getByTestId('note-visibility').click();
    await page.getByRole('option', { name: 'Для группы' }).click();
    await page.getByLabel('Номер сессии').fill('1');
    const editor = page.getByTestId('note-editor');
    await editor.click();
    await page.keyboard.type('На тракте встретили ');
    await page.keyboard.type('[[Гунд');
    await expect(page.getByTestId('editor-suggestions')).toContainText('Гундрен Искатель Скал');
    await page.keyboard.press('Enter');
    await page.keyboard.type('а рядом видели дракона.');
    await expect(editor.locator('[data-type="wiki-link"]')).toHaveText('Гундрен Искатель Скал');
    await waitSaved(page);
    ids.session = page.url().split('/').pop()!.split('?')[0]!;

    await editor.locator('[data-type="wiki-link"]').click();
    await expect(page).toHaveURL(new RegExp(`/notes/${ids.npc}`));
    await expect(page.getByTestId('backlinks')).toContainText('Сессия 1');
    await expect(page.getByTestId('backlinks')).toContainText('видели дракона');
  });

  test('поиск «дракона» находит заметку со словом «дракон»', async ({ page, baseURL }) => {
    await login(page, ROGUE.username);
    const found = await q<{ title: string; snippet: string }[]>(page.request, baseURL!, 'notes.search', { campaignId, q: 'дракона' });
    expect(found.data.map((n) => n.title)).toEqual(['Сессия 1']);
    await gotoNotes(page);
    await page.getByTestId('notes-search').fill('дракона');
    const list = page.getByTestId('notes-list');
    await expect(list.getByTestId('note-link')).toHaveCount(1);
    await expect(list).toContainText('Сессия 1');
    await expect(list.locator('mark')).toHaveText('дракона');
  });

  test('личная заметка не видна мастеру, заметка «для мастера» не видна другим игрокам (API)', async ({ browser, baseURL }) => {
    const ctx = async (name: string, admin = false) => {
      const c = await browser.newContext();
      const p = await c.newPage();
      if (admin) await loginAsAdmin(p);
      else await login(p, name);
      return { c, r: p.request };
    };
    const scribe = await ctx(SCRIBE.username);
    const rogue = await ctx(ROGUE.username);
    const gm = await ctx('admin', true);

    ids.private = (await api<{ id: string }>(scribe.r, baseURL!, 'notes.create', { campaignId, title: 'Мой секрет', visibility: 'private' })).data.id;
    ids.gm = (await api<{ id: string }>(scribe.r, baseURL!, 'notes.create', { campaignId, title: 'Подозрения насчёт Плута', visibility: 'gm' })).data.id;

    expect((await q(gm.r, baseURL!, 'notes.get', { noteId: ids.private })).status).toBe(404);
    expect((await q(gm.r, baseURL!, 'notes.get', { noteId: ids.gm })).status).toBe(200);
    expect((await q(rogue.r, baseURL!, 'notes.get', { noteId: ids.gm })).status).toBe(404);
    expect((await q(rogue.r, baseURL!, 'notes.get', { noteId: ids.private })).status).toBe(404);
    expect((await q(rogue.r, baseURL!, 'notes.get', { noteId: ids.npc })).status).toBe(200);

    const titles = async (r: APIRequestContext) =>
      (await q<NoteList>(r, baseURL!, 'notes.list', { campaignId, limit: 200 })).data.items.map((n) => n.title);
    expect(await titles(gm.r)).not.toContain('Мой секрет');
    expect(await titles(gm.r)).toContain('Подозрения насчёт Плута');
    expect(await titles(rogue.r)).not.toContain('Подозрения насчёт Плута');
    expect(await titles(rogue.r)).not.toContain('Мой секрет');
    const search = await q<{ title: string }[]>(rogue.r, baseURL!, 'notes.search', { q: 'Плута' });
    expect(search.data).toEqual([]);
    const exported = await rogue.r.get(`${baseURL}/api/notes/export?note=${ids.gm}`);
    expect(exported.status()).toBe(404);

    // Заметку группы читают все, правят автор и мастер.
    const npc = await q<NoteGet>(rogue.r, baseURL!, 'notes.get', { noteId: ids.npc });
    const hack = await api(rogue.r, baseURL!, 'notes.update', { noteId: ids.npc, expectedUpdatedAt: npc.data.updatedAt, patch: { title: 'взлом' } });
    expect(hack.status).toBe(403);
    expect((await api(rogue.r, baseURL!, 'notes.trash', { noteId: ids.npc })).status).toBe(403);
    const byGm = await api<{ updatedAt: Date }>(gm.r, baseURL!, 'notes.update', {
      noteId: ids.npc,
      expectedUpdatedAt: npc.data.updatedAt,
      patch: { fields: { status: 'alive', attitude: 'friendly' } },
    });
    expect(byGm.status).toBe(200);
    // Устаревшая версия — конфликт.
    const stale = await api(scribe.r, baseURL!, 'notes.update', { noteId: ids.npc, expectedUpdatedAt: npc.data.updatedAt, patch: { title: 'x' } });
    expect(stale.status).toBe(409);

    // Раздаточный материал: адресат видит, остальные — нет.
    ids.handout = (await api<{ id: string }>(gm.r, baseURL!, 'notes.create', { campaignId, title: 'Письмо Сильдара', visibility: 'gm' })).data.id;
    const members = await q<{ userId: string; displayName: string }[]>(gm.r, baseURL!, 'campaigns.members.list', { campaignId });
    const rogueId = members.data.find((m) => m.displayName === ROGUE.displayName)!.userId;
    expect((await api(gm.r, baseURL!, 'notes.share', { noteId: ids.handout, userIds: [rogueId] })).status).toBe(200);
    expect((await api(scribe.r, baseURL!, 'notes.share', { noteId: ids.npc, userIds: [rogueId] })).status).toBe(403);
    const handouts = await q<{ items: { title: string; readAt: Date | null }[]; unread: number }>(rogue.r, baseURL!, 'notes.handouts', {});
    expect(handouts.data.unread).toBe(1);
    expect(handouts.data.items[0]!.title).toBe('Письмо Сильдара');
    expect((await q(rogue.r, baseURL!, 'notes.get', { noteId: ids.handout })).status).toBe(200);
    expect((await q(scribe.r, baseURL!, 'notes.get', { noteId: ids.handout })).status).toBe(404);
    await api(rogue.r, baseURL!, 'notes.markRead', { noteId: ids.handout });
    expect((await q<{ unread: number }>(rogue.r, baseURL!, 'notes.handouts', {})).data.unread).toBe(0);

    for (const x of [scribe, rogue, gm]) await x.c.close();
  });

  test('сравнение трёх заметок, граф, хронология', async ({ page, baseURL }) => {
    await login(page, SCRIBE.username);
    ids.location = (
      await api<{ id: string }>(page.request, baseURL!, 'notes.create', {
        campaignId,
        type: 'location',
        title: 'Фанделвер',
        visibility: 'party',
        sessionNo: 1,
        body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Здесь живёт ' }, { type: 'wikiLink', attrs: { noteId: ids.npc, label: 'Гундрен' } }] }] },
      })
    ).data.id;
    await gotoNotes(page);
    await page.getByTestId('compare-toggle').click();
    for (const t of ['Гундрен Искатель Скал', 'Сессия 1', 'Фанделвер']) await page.getByRole('checkbox', { name: `Добавить к сравнению: ${t}` }).click();
    await page.getByTestId('compare-go').click();
    await expect(page).toHaveURL(/\/notes\/compare\?ids=/);
    const cols = page.getByTestId('compare-columns').locator('section');
    await expect(cols).toHaveCount(3);
    await expect(page.getByTestId('compare-common')).toContainText('Гундрен');

    await page.goto(`/campaigns/${campaignId}/graph`);
    const graph = page.getByTestId('notes-graph');
    await expect(graph.getByRole('link', { name: 'Гундрен Искатель Скал' })).toBeVisible();
    await expect(graph.locator('line')).toHaveCount(2);
    await graph.getByRole('link', { name: 'Фанделвер' }).click();
    await expect(page).toHaveURL(new RegExp(`/notes/${ids.location}`));

    await page.goto(`/campaigns/${campaignId}/timeline`);
    const timeline = page.getByTestId('timeline');
    await expect(timeline).toContainText('Сессия 1');
    await expect(timeline).toContainText('Фанделвер');
  });

  test('доска улик сохраняет позиции; канбан квестов меняет статус перетаскиванием', async ({ page, baseURL }) => {
    await login(page, SCRIBE.username);
    await page.goto(`/campaigns/${campaignId}/boards`);
    await page.getByLabel('Название доски').fill('Кто стоит за гоблинами');
    await page.getByRole('button', { name: 'Новая доска' }).click();
    await expect(page).toHaveURL(/\/boards\/[0-9a-f-]{36}$/);
    const boardId = page.url().split('/').pop()!;
    await page.getByRole('button', { name: 'Добавить заметку: Гундрен Искатель Скал' }).click();
    page.once('dialog', (d) => void d.accept('Чёрный паук'));
    await page.getByRole('button', { name: 'Добавить подпись' }).click();
    const nodes = page.locator('.react-flow__node');
    await expect(nodes).toHaveCount(2);
    type Board = { nodes: { id: string; x: number; y: number; noteTitle: string | null; label: string | null }[] };
    const before = (await q<Board>(page.request, baseURL!, 'boards.get', { boardId })).data.nodes.find((n) => n.noteTitle)!;
    const box = (await nodes.filter({ hasText: 'Гундрен' }).boundingBox())!;
    await page.mouse.move(box.x + 10, box.y + 8);
    await page.mouse.down();
    await page.mouse.move(box.x + 160, box.y + 120, { steps: 10 });
    await page.mouse.up();
    await expect
      .poll(async () => {
        const n = (await q<Board>(page.request, baseURL!, 'boards.get', { boardId })).data.nodes.find((x) => x.id === before.id)!;
        return Math.round(n.x - before.x) > 50 && Math.round(n.y - before.y) > 50;
      })
      .toBe(true);
    await page.reload();
    await expect(page.locator('.react-flow__node')).toHaveCount(2);

    ids.quest = (await api<{ id: string }>(page.request, baseURL!, 'notes.create', { campaignId, type: 'quest', title: 'Найти рудник', visibility: 'party' })).data.id;
    await page.goto(`/campaigns/${campaignId}/quests`);
    const card = page.getByTestId('quest-col-active').getByTestId('quest-card').filter({ hasText: 'Найти рудник' });
    await expect(card).toBeVisible();
    await card.dragTo(page.getByTestId('quest-col-completed'));
    await expect(page.getByTestId('quest-col-completed')).toContainText('Найти рудник');
    await expect
      .poll(async () => (await q<{ fields: Record<string, unknown> }>(page.request, baseURL!, 'notes.get', { noteId: ids.quest })).data.fields.status)
      .toBe('completed');
  });

  test('конфликт правок: копия моей версии; корзина и восстановление; превью ссылки', async ({ browser, baseURL }) => {
    const open = async () => {
      const c = await browser.newContext({ locale: 'ru-RU' });
      const p = await c.newPage();
      await login(p, SCRIBE.username);
      await gotoNotes(p, `/campaigns/${campaignId}/notes/${ids.session}`);
      await expect(p.getByTestId('note-editor')).toHaveCount(1);
      await expect(p.getByTestId('note-editor')).toContainText('видели дракона');
      return { c, p };
    };
    const a = await open();
    const b = await open();
    await a.p.getByTestId('note-editor').click();
    await a.p.keyboard.press('Control+End');
    await a.p.keyboard.type(' Гоблины бежали.');
    await waitSaved(a.p);

    await b.p.getByTestId('note-editor').click();
    await b.p.keyboard.press('Control+End');
    await b.p.keyboard.type(' Моя версия.');
    const dialog = b.p.getByTestId('note-conflict');
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await dialog.getByRole('button', { name: 'Сохранить мою как копию' }).click();
    await expect(b.p).not.toHaveURL(new RegExp(ids.session!));
    await expect(b.p.getByTestId('note-title')).toHaveValue('Сессия 1 (копия)');
    await expect(b.p.getByTestId('note-editor')).toContainText('Моя версия.');
    const copyId = b.p.url().split('/').pop()!.split('?')[0]!;
    const original = await q<{ body: unknown }>(a.p.request, baseURL!, 'notes.get', { noteId: ids.session });
    expect(JSON.stringify(original.data.body)).toContain('Гоблины бежали.');
    expect(JSON.stringify(original.data.body)).not.toContain('Моя версия.');

    // Корзина: удалить копию и вернуть её.
    await b.p.getByTestId('note-menu').click();
    await b.p.getByTestId('note-trash').click();
    await expect(b.p).toHaveURL(new RegExp(`/campaigns/${campaignId}/notes$`));
    await b.p.getByTestId('notes-trash').click();
    const trashList = b.p.getByTestId('notes-list');
    await expect(trashList).toContainText('Сессия 1 (копия)');
    await trashList.getByRole('button', { name: 'Восстановить' }).click();
    await expect(trashList).not.toContainText('Сессия 1 (копия)');
    await b.p.getByTestId('notes-trash').click();
    await expect(b.p.getByTestId('notes-list')).toContainText('Сессия 1 (копия)');
    // Копия больше не нужна: обратно в корзину, чтобы не мешать сверке экспорта.
    expect((await api(b.p.request, baseURL!, 'notes.trash', { noteId: copyId })).status).toBe(200);

    // Превью ссылки по наведению.
    await a.p.getByTestId('note-editor').locator('[data-type="wiki-link"]').hover();
    await expect(a.p.getByTestId('link-preview')).toContainText('Гундрен Искатель Скал');
    await expect(a.p.getByTestId('link-preview')).toContainText('НИП');

    await a.c.close();
    await b.c.close();
  });

  test('экспорт кампании в zip и обратный импорт восстанавливают заметки, теги и ссылки', async ({ page, baseURL }) => {
    await loginAsAdmin(page);
    const tag = await api<{ id: string }>(page.request, baseURL!, 'tags.create', { campaignId, name: 'Союзник', color: '#22c55e' });
    expect((await api(page.request, baseURL!, 'tags.setForNote', { noteId: ids.npc, tagIds: [tag.data.id] })).status).toBe(200);
    const source = (await q<NoteList>(page.request, baseURL!, 'notes.list', { campaignId, limit: 200 })).data.items;

    const zip = await page.request.get(`${baseURL}/api/notes/export?campaign=${campaignId}`);
    expect(zip.status()).toBe(200);
    expect(zip.headers()['content-type']).toBe('application/zip');
    const md = await page.request.get(`${baseURL}/api/notes/export?note=${ids.session}`);
    expect(await md.text()).toContain('[[Гундрен Искатель Скал]]');

    const target = (await api<{ id: string }>(page.request, baseURL!, 'campaigns.create', { name: 'Копия рудника' })).data.id;
    const res = await page.request.post(`${baseURL}/api/notes/import`, {
      headers: { origin: baseURL! },
      multipart: { campaignId: target, file: { name: 'notes.zip', mimeType: 'application/zip', buffer: await zip.body() } },
    });
    expect(res.status()).toBe(200);
    expect(((await res.json()) as { imported: number }).imported).toBe(source.length);

    const copy = (await q<NoteList>(page.request, baseURL!, 'notes.list', { campaignId: target, limit: 200 })).data.items;
    expect(copy.map((n) => n.title).sort()).toEqual(source.map((n) => n.title).sort());
    const npc = copy.find((n) => n.title === 'Гундрен Искатель Скал')!;
    const npcFull = await q<NoteGet & { fields: Record<string, unknown> }>(page.request, baseURL!, 'notes.get', { noteId: npc.id });
    expect(npcFull.data.tags.map((t) => t.name)).toEqual(['Союзник']);
    expect(npcFull.data.fields).toMatchObject({ status: 'alive', attitude: 'friendly' });
    const back = await q<{ title: string }[]>(page.request, baseURL!, 'notes.backlinks', { noteId: npc.id });
    expect(back.data.map((b) => b.title).sort()).toEqual(['Сессия 1', 'Фанделвер']);
    const tags = await q<{ name: string }[]>(page.request, baseURL!, 'tags.list', { campaignId: target });
    expect(tags.data.map((t) => t.name)).toEqual(['Союзник']);
  });

  test('глобальный поиск Ctrl+K: заметки и справочник', async ({ page }) => {
    await login(page, SCRIBE.username);
    await page.keyboard.press('Control+K');
    await page.getByTestId('global-search-input').fill('дракон');
    const results = page.getByTestId('global-search-results');
    await expect(results).toContainText('Сессия 1');
    await page.getByTestId('global-search-input').fill('огненный шар');
    await expect(results).toContainText('Огненный шар');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/library\/spell\//);
  });
});
