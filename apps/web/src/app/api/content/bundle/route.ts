import { gzipSync } from 'node:zlib';
import { eq } from 'drizzle-orm';
import { parseCampaignSettings } from '@ps/content-schema';
import { getDb } from '@/server/db/client';
import { campaigns } from '@/server/db/schema';
import { getRouteUser } from '@/server/auth/route';
import { getCampaignRole } from '@/server/auth/guards';
import { buildBundle } from '@/server/content/cache';

export const dynamic = 'force-dynamic';

/** Сжатые бандлы по ETag: сжимаем один раз на версию, а не на каждый запрос (SPEC §16.5). */
const gzipped = new Map<string, Uint8Array>();

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
  const headers = { ETag: bundle.etag, 'Cache-Control': 'private, no-cache', Vary: 'Cookie, Accept-Encoding' };
  if (req.headers.get('if-none-match') === bundle.etag) return new Response(null, { status: 304, headers });
  const json = JSON.stringify({ entities: bundle.entities, hidden: bundle.hidden, packs: bundle.packs });
  const contentType = 'application/json; charset=utf-8';
  if (/\bgzip\b/.test(req.headers.get('accept-encoding') ?? '')) {
    let gz = gzipped.get(bundle.etag);
    if (!gz) {
      gz = new Uint8Array(gzipSync(json));
      if (gzipped.size >= 50) gzipped.clear();
      gzipped.set(bundle.etag, gz);
    }
    return new Response(gz as Uint8Array<ArrayBuffer>, {
      status: 200,
      headers: { ...headers, 'content-type': contentType, 'content-encoding': 'gzip' },
    });
  }
  return new Response(json, { status: 200, headers: { ...headers, 'content-type': contentType } });
}
