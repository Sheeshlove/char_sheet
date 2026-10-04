import { randomBytes, randomUUID } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { ENTITY_DATA_SCHEMAS, type ContentKind, type Feature } from '@ps/content-schema';
import type { Db } from '../db/client';
import { campaigns, type contentEntities, contentPacks, users } from '../db/schema';

/**
 * Homebrew (SPEC §14): личный пакет пользователя `hb-<uuid>` (видимость `private`) и пакет
 * кампании (видимость `campaign`). Ключи сущностей после создания не меняются.
 */

export type EntityRow = typeof contentEntities.$inferSelect;
export type PackRow = typeof contentPacks.$inferSelect;

export async function personalPack(db: Db, userId: string): Promise<PackRow> {
  const [found] = await db
    .select()
    .from(contentPacks)
    .where(and(eq(contentPacks.ownerUserId, userId), eq(contentPacks.visibility, 'private'), isNull(contentPacks.campaignId)));
  if (found) return found;
  const [u] = await db.select({ name: users.displayName }).from(users).where(eq(users.id, userId));
  const [row] = await db
    .insert(contentPacks)
    .values({
      key: `hb-${randomUUID()}`,
      name: `Homebrew: ${u?.name ?? ''}`.trim(),
      sourceType: 'homebrew',
      ownerUserId: userId,
      visibility: 'private',
      version: '1',
    })
    .returning();
  return row!;
}

export async function campaignPack(db: Db, campaignId: string): Promise<PackRow> {
  const [found] = await db
    .select()
    .from(contentPacks)
    .where(and(eq(contentPacks.campaignId, campaignId), eq(contentPacks.visibility, 'campaign')));
  if (found) return found;
  const [c] = await db.select({ name: campaigns.name }).from(campaigns).where(eq(campaigns.id, campaignId));
  const [row] = await db
    .insert(contentPacks)
    .values({
      key: `hb-${randomUUID()}`,
      name: `Homebrew кампании «${c?.name ?? ''}»`,
      sourceType: 'homebrew',
      campaignId,
      visibility: 'campaign',
      version: '1',
    })
    .returning();
  return row!;
}

const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n',
  о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '',
  э: 'e', ю: 'yu', я: 'ya',
};

/** Слаг из русского названия + короткий случайный хвост (ключ уникален и не меняется). */
export function makeSlug(nameRu: string): string {
  const base = Array.from(nameRu.toLowerCase(), (ch) => TRANSLIT[ch] ?? ch)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return `${base || 'entity'}-${randomBytes(3).toString('hex')}`;
}

/** Умения сущности (для статуса автоматизации и экспорта оверлея). */
export function featuresOf(data: unknown): Feature[] {
  const d = (data ?? {}) as { features?: Feature[]; feature?: Feature };
  return [...(Array.isArray(d.features) ? d.features : []), ...(d.feature ? [d.feature] : [])];
}

/** Статус автоматизации по эффектам: есть ли что-то кроме текстовых подсказок. */
export function effectsStatusOf(kind: ContentKind, data: unknown): 'complete' | 'partial' | 'text_only' {
  const d = (data ?? {}) as { effects?: { type: string }[]; selfEffects?: { type: string }[] };
  const lists: { type: string }[][] = featuresOf(data).map((f) => f.effects);
  if (Array.isArray(d.effects)) lists.push(d.effects);
  if (kind === 'weapon' || kind === 'armor' || kind === 'gear' || kind === 'tool' || kind === 'language') return 'complete';
  if (kind === 'spell') return 'complete';
  if (!lists.length) return 'text_only';
  // Как у оверлеев (решение 16): умение с эффектами (в т. ч. текстовыми подсказками) — `complete`.
  const filled = lists.map((l) => l.length > 0);
  if (filled.every(Boolean)) return 'complete';
  if (filled.some(Boolean)) return 'partial';
  return 'text_only';
}

/** Данные сущности по схеме её вида; у умений проставляется статус автоматизации. */
export function parseHomebrewData(kind: ContentKind, data: unknown) {
  const res = ENTITY_DATA_SCHEMAS[kind].safeParse(data);
  if (!res.success) return res;
  const d = res.data as { features?: Feature[]; feature?: Feature };
  const fix = (f: Feature): Feature => ({ ...f, effectsStatus: f.effects.length ? 'complete' : 'text_only' });
  if (Array.isArray(d.features)) d.features = d.features.map(fix);
  if (d.feature) d.feature = fix(d.feature);
  return res;
}

/** Оверлей (SPEC §7.6) с эффектами сущности — для переноса homebrew в репозиторий. */
export function overlayOf(e: Pick<EntityRow, 'key' | 'data'>) {
  const features = Object.fromEntries(
    featuresOf(e.data).map((f) => [f.key, { effects: f.effects, effectsStatus: f.effectsStatus, nameRu: f.nameRu, ...(f.level ? { level: f.level } : {}) }]),
  );
  const d = (e.data ?? {}) as { effects?: unknown[]; selfEffects?: unknown[] };
  const data = {
    ...(Array.isArray(d.effects) ? { effects: d.effects } : {}),
    ...(Array.isArray(d.selfEffects) ? { selfEffects: d.selfEffects } : {}),
  };
  return {
    target: e.key,
    ...(Object.keys(data).length ? { data } : {}),
    ...(Object.keys(features).length ? { features } : {}),
  };
}
