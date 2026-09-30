import { getDb } from '@/server/db/client';
import { getRouteUser } from '@/server/auth/route';
import { getCampaignRole } from '@/server/auth/guards';
import { isSameOrigin } from '@/server/http/origin';
import { ImportError, importNotes, MAX_IMPORT_BYTES } from '@/server/notes/exchange';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const json = (body: unknown, status = 200) => Response.json(body, { status });

/**
 * `POST /api/notes/import` (SPEC §11.5): форма `file` (`.md` или `.zip` Obsidian) и
 * необязательный `campaignId`. Гард: участник кампании (без неё — личные заметки).
 */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return json({ error: 'FORBIDDEN' }, 403);
  const user = await getRouteUser(req);
  if (!user) return json({ error: 'UNAUTHORIZED' }, 401);
  const len = Number(req.headers.get('content-length') ?? 0);
  if (len > MAX_IMPORT_BYTES + 64 * 1024) return json({ error: 'importTooLarge' }, 413);
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ error: 'BAD_REQUEST' }, 400);
  }
  const file = form.get('file');
  const campaignId = String(form.get('campaignId') ?? '') || null;
  if (!(file instanceof File)) return json({ error: 'BAD_REQUEST' }, 400);
  if (file.size > MAX_IMPORT_BYTES) return json({ error: 'importTooLarge' }, 413);
  const db = getDb();
  if (campaignId && (!/^[0-9a-f-]{36}$/i.test(campaignId) || !(await getCampaignRole({ db, user }, campaignId)))) {
    return json({ error: 'NOT_FOUND' }, 404);
  }
  try {
    const imported = await importNotes(db, user.id, campaignId, { name: file.name, data: new Uint8Array(await file.arrayBuffer()) });
    return json({ imported });
  } catch (e) {
    if (e instanceof ImportError) return json({ error: e.key }, e.key === 'importTooLarge' ? 413 : 400);
    throw e;
  }
}
