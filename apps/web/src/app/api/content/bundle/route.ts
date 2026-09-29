import { eq } from 'drizzle-orm';
import { parseCampaignSettings } from '@ps/content-schema';
import { getDb } from '@/server/db/client';
import { campaigns } from '@/server/db/schema';
import { getRouteUser } from '@/server/auth/route';
import { getCampaignRole } from '@/server/auth/guards';
import { buildBundle } from '@/server/content/cache';

export const dynamic = 'force-dynamic';

/**
 * `GET /api/content/bundle?campaign=<id>` — ContentIndex одним JSON (SPEC §15):
 * ETag по версиям пакетов, `Cache-Control: private`, 304 при совпадении If-None-Match.
 */
export async function GET(req: Request) {
  const user = await getRouteUser(req);
  if (!user) return Response.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const db = getDb();
  const campaignId = new URL(req.url).searchParams.get('campaign');
  let settings = null;
  if (campaignId) {
    if (!/^[0-9a-f-]{36}$/i.test(campaignId)) return Response.json({ error: 'BAD_REQUEST' }, { status: 400 });
    const role = await getCampaignRole({ db, user }, campaignId);
    if (!role) return Response.json({ error: 'NOT_FOUND' }, { status: 404 });
    const [c] = await db.select({ settings: campaigns.settings }).from(campaigns).where(eq(campaigns.id, campaignId));
    settings = parseCampaignSettings(c?.settings);
  }
  const bundle = await buildBundle(db, { userId: user.id, settings, campaignId });
  const headers = { ETag: bundle.etag, 'Cache-Control': 'private, no-cache', Vary: 'Cookie' };
  if (req.headers.get('if-none-match') === bundle.etag) return new Response(null, { status: 304, headers });
  return new Response(JSON.stringify({ entities: bundle.entities, hidden: bundle.hidden, packs: bundle.packs }), {
    status: 200,
    headers: { ...headers, 'content-type': 'application/json; charset=utf-8' },
  });
}
