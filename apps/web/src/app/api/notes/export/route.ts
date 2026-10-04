import { eq } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { notes } from '@/server/db/schema';
import { getRouteUser } from '@/server/auth/route';
import { canViewNote, getCampaignRole } from '@/server/auth/guards';
import { exportNoteMarkdown, exportScopeZip, safeFileName } from '@/server/notes/exchange';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const UUID = /^[0-9a-f-]{36}$/i;
const disposition = (name: string) => `attachment; filename*=UTF-8''${encodeURIComponent(name)}`;

/**
 * `GET /api/notes/export` (SPEC §11.5): `?note=<id>` → `.md` (гард `canViewNote`);
 * `?campaign=<id>` → `.zip` видимых зрителю заметок кампании (участник); `?personal=1` → личные.
 */
export async function GET(req: Request) {
  const user = await getRouteUser(req);
  if (!user) return new Response(null, { status: 401 });
  const url = new URL(req.url);
  const db = getDb();
  const noteId = url.searchParams.get('note');
  if (noteId) {
    if (!UUID.test(noteId)) return new Response(null, { status: 404 });
    const [note] = await db.select().from(notes).where(eq(notes.id, noteId));
    if (!note || note.deletedAt || !(await canViewNote({ db, user }, note))) return new Response(null, { status: 404 });
    const md = await exportNoteMarkdown(db, user.id, note);
    return new Response(md, {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': disposition(`${safeFileName(note.title)}.md`),
        'Cache-Control': 'private, no-store',
      },
    });
  }
  const campaignId = url.searchParams.get('campaign');
  if (campaignId) {
    if (!UUID.test(campaignId) || !(await getCampaignRole({ db, user }, campaignId))) return new Response(null, { status: 404 });
  } else if (url.searchParams.get('personal') !== '1') {
    return new Response(null, { status: 400 });
  }
  const zip = await exportScopeZip(db, user.id, campaignId);
  return new Response(new Uint8Array(zip), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': disposition(`notes-${new Date().toISOString().slice(0, 10)}.zip`),
      'Cache-Control': 'private, no-store',
    },
  });
}
