import { eq } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { characters, files, notes } from '@/server/db/schema';
import { getRouteUser } from '@/server/auth/route';
import { canViewCharacter, canViewNote } from '@/server/auth/guards';
import { readStoredFile } from '@/server/files/storage';

export const dynamic = 'force-dynamic';

/** `GET /api/files/:id` — доступ к файлу равен доступу к сущности, к которой он прикреплён (SPEC §4.6). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response(null, { status: 404 });
  const user = await getRouteUser(req);
  if (!user) return new Response(null, { status: 401 });
  const db = getDb();
  const [file] = await db.select().from(files).where(eq(files.id, id));
  if (!file) return new Response(null, { status: 404 });

  let allowed = false;
  if (file.attachedType === 'portrait') {
    const [c] = await db
      .select({ ownerId: characters.ownerId, campaignId: characters.campaignId })
      .from(characters)
      .where(eq(characters.id, file.attachedId));
    allowed = !!c && (await canViewCharacter({ db, user }, c)) !== 'none';
  } else if (file.attachedType === 'note') {
    const [n] = await db
      .select({ id: notes.id, authorId: notes.authorId, campaignId: notes.campaignId, visibility: notes.visibility })
      .from(notes)
      .where(eq(notes.id, file.attachedId));
    allowed = !!n && (await canViewNote({ db, user }, n));
  } else {
    allowed = file.ownerId === user.id;
  }
  if (!allowed) return new Response(null, { status: 404 });

  const data = await readStoredFile(id);
  if (!data) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(data), {
    headers: {
      'Content-Type': file.mime,
      'Cache-Control': 'private, max-age=86400, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
