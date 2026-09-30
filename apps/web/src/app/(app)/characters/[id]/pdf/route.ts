import { eq } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { characters } from '@/server/db/schema';
import { getRouteUser } from '@/server/auth/route';
import { canViewCharacter } from '@/server/auth/guards';
import { computeSheet, engineContextFor, parseStored } from '@/server/services/characters';
import { renderSheetPdf } from '@/server/pdf/sheet-pdf';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** `GET /characters/:id/pdf` — лист персонажа в PDF (SPEC §12.3). Доступ — полный просмотр листа. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response(null, { status: 404 });
  const user = await getRouteUser(req);
  if (!user) return Response.redirect(new URL(`/login?next=/characters/${id}`, req.url), 303);
  const db = getDb();
  const [row] = await db.select().from(characters).where(eq(characters.id, id));
  if (!row) return new Response(null, { status: 404 });
  if ((await canViewCharacter({ db, user }, row)) !== 'full') return new Response(null, { status: 404 });
  const ctx = await engineContextFor(db, row);
  const { build, state } = parseStored(row);
  const sheet = computeSheet(build, state, ctx);
  const pdf = await renderSheetPdf({ sheet, build, state, content: ctx.content });
  const filename = encodeURIComponent(`${sheet.identity.name || 'character'}.pdf`);
  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename*=UTF-8''${filename}`,
      'Cache-Control': 'private, no-store',
    },
  });
}
