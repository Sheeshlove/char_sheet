import { and, desc, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { CONTENT_KINDS, type ContentKind } from '@ps/content-schema';
import { adminProcedure, authedProcedure, router } from '../init';
import { campaigns, contentEntities, contentPacks, users } from '../../db/schema';
import { canHomebrew, isGmRole, type CampaignRole } from '../../auth/access';
import { getCampaignRole } from '../../auth/guards';
import { EngineRuleError, badRequest, forbidden, notFound } from '../errors';
import { TRPCError } from '@trpc/server';
import { invalidateContentCache } from '../../content/cache';
import {
  campaignPack,
  effectsStatusOf,
  makeSlug,
  overlayOf,
  parseHomebrewData,
  personalPack,
  type EntityRow,
  type PackRow,
} from '../../services/homebrew';
import type { Context } from '../context';
import type { AuthUser } from '../../auth/session';

/** Homebrew (SPEC §14): личные сущности, предложения в кампанию, одобрение мастером. */

type Ctx = Pick<Context, 'db'> & { user: AuthUser };
const kindSchema = z.enum(CONTENT_KINDS);
const keySchema = z.object({ key: z.string().min(3).max(200) });

type Loaded = { entity: EntityRow; pack: PackRow; role: CampaignRole | null };

async function load(ctx: Ctx, key: string): Promise<Loaded> {
  const [row] = await ctx.db
    .select({ entity: contentEntities, pack: contentPacks })
    .from(contentEntities)
    .innerJoin(contentPacks, eq(contentPacks.key, contentEntities.packKey))
    .where(eq(contentEntities.key, key));
  if (!row) throw notFound();
  const role = row.pack.campaignId ? await getCampaignRole(ctx, row.pack.campaignId) : null;
  return { ...row, role };
}

function canView({ entity, pack, role }: Loaded, userId: string): boolean {
  if (entity.authorId === userId) return true;
  if (pack.visibility === 'private') return pack.ownerUserId === userId;
  if (pack.visibility === 'global') return entity.status === 'approved';
  if (!role) return false;
  if (isGmRole(role)) return entity.status !== 'draft';
  return canHomebrew('view_approved', role) && entity.status === 'approved';
}

function canEdit({ entity, pack, role }: Loaded, userId: string): boolean {
  if (pack.visibility === 'private') return pack.ownerUserId === userId;
  if (pack.visibility !== 'campaign') return false;
  if (isGmRole(role)) return true;
  return entity.authorId === userId && (entity.status === 'draft' || entity.status === 'rejected');
}

function dataError(issues: { path: PropertyKey[]; message: string }[]): never {
  throw new TRPCError({
    code: 'BAD_REQUEST',
    message: 'homebrew_invalid',
    cause: new EngineRuleError('homebrew_invalid', issues.slice(0, 5).map((i) => `${i.path.join('.') || '—'}: ${i.message}`).join('; ')),
  });
}

async function authorLabel(ctx: Ctx) {
  const [u] = await ctx.db.select({ name: users.displayName }).from(users).where(eq(users.id, ctx.user.id));
  return `Homebrew: ${u?.name ?? ''}`.trim();
}

/** Пакет назначения и начальный статус: личный — сразу доступен; в кампании мастер одобряет сразу. */
async function target(ctx: Ctx, campaignId: string | null) {
  if (!campaignId) return { pack: await personalPack(ctx.db, ctx.user.id), status: 'approved' as const };
  const role = await getCampaignRole(ctx, campaignId);
  if (!role) throw notFound();
  if (!canHomebrew('propose', role)) throw forbidden();
  return { pack: await campaignPack(ctx.db, campaignId), status: isGmRole(role) ? ('approved' as const) : ('draft' as const) };
}

const entityInput = z.object({
  kind: kindSchema,
  nameRu: z.string().trim().min(1).max(120),
  nameEn: z.string().trim().max(120).optional(),
  textMd: z.string().max(50_000).default(''),
  data: z.unknown(),
});

const LIST_COLUMNS = {
  key: contentEntities.key,
  kind: contentEntities.kind,
  nameRu: contentEntities.nameRu,
  status: contentEntities.status,
  reviewComment: contentEntities.reviewComment,
  effectsStatus: contentEntities.effectsStatus,
  authorId: contentEntities.authorId,
  authorName: users.displayName,
  packKey: contentEntities.packKey,
  packName: contentPacks.name,
  campaignId: contentPacks.campaignId,
  campaignName: campaigns.name,
  updatedAt: contentEntities.updatedAt,
};

export const homebrewRouter = router({
  /**
   * Список: `mine` — мои сущности; `campaign` — одобренные сущности кампании (мастеру — и
   * предложенные/отклонённые). Гард: `requireUser`; для кампании — участник.
   */
  list: authedProcedure
    .input(z.object({ scope: z.enum(['mine', 'campaign']), campaignId: z.uuid().optional(), status: z.enum(['proposed']).optional() }))
    .query(async ({ ctx, input }) => {
      const base = ctx.db
        .select(LIST_COLUMNS)
        .from(contentEntities)
        .innerJoin(contentPacks, eq(contentPacks.key, contentEntities.packKey))
        .leftJoin(users, eq(users.id, contentEntities.authorId))
        .leftJoin(campaigns, eq(campaigns.id, contentPacks.campaignId));
      if (input.scope === 'mine') {
        return base
          .where(and(eq(contentEntities.authorId, ctx.user.id), eq(contentPacks.sourceType, 'homebrew'), isNull(contentEntities.removedAt)))
          .orderBy(desc(contentEntities.updatedAt));
      }
      if (!input.campaignId) throw badRequest();
      const role = await getCampaignRole(ctx, input.campaignId);
      if (!role) throw notFound();
      const gm = isGmRole(role);
      return base
        .where(
          and(
            eq(contentPacks.campaignId, input.campaignId),
            isNull(contentEntities.removedAt),
            input.status ? eq(contentEntities.status, input.status) : undefined,
            gm
              ? or(ne(contentEntities.status, 'draft'), eq(contentEntities.authorId, ctx.user.id))
              : or(eq(contentEntities.status, 'approved'), eq(contentEntities.authorId, ctx.user.id)),
          ),
        )
        .orderBy(desc(contentEntities.updatedAt));
    }),

  /** Сущность с текстом и правами. Гард: видимость homebrew (автор, пакет, роль в кампании). */
  get: authedProcedure.input(keySchema).query(async ({ ctx, input }) => {
    const l = await load(ctx, input.key);
    if (!canView(l, ctx.user.id)) throw notFound();
    const isGm = isGmRole(l.role);
    return {
      key: l.entity.key,
      kind: l.entity.kind,
      nameRu: l.entity.nameRu,
      nameEn: l.entity.nameEn,
      textMd: l.entity.textMd,
      data: l.entity.data,
      status: l.entity.status,
      reviewComment: l.entity.reviewComment,
      effectsStatus: l.entity.effectsStatus,
      removed: !!l.entity.removedAt,
      pack: { key: l.pack.key, name: l.pack.name, visibility: l.pack.visibility, campaignId: l.pack.campaignId },
      isAuthor: l.entity.authorId === ctx.user.id,
      canEdit: canEdit(l, ctx.user.id),
      canSubmit: l.pack.visibility === 'campaign' && l.entity.authorId === ctx.user.id && !isGm && (l.entity.status === 'draft' || l.entity.status === 'rejected'),
      canReview: isGm && l.entity.status === 'proposed',
    };
  }),

  /** Создать. Гард: личный пакет — сам; в кампанию — участник (`propose`), мастер — сразу одобрено. */
  create: authedProcedure
    .input(entityInput.extend({ campaignId: z.uuid().nullable().default(null) }))
    .mutation(async ({ ctx, input }) => {
      const parsed = parseHomebrewData(input.kind, input.data);
      if (!parsed.success) dataError(parsed.error.issues);
      const t = await target(ctx, input.campaignId);
      const slug = makeSlug(input.nameRu);
      const key = `${t.pack.key}/${input.kind}/${slug}`;
      await ctx.db.insert(contentEntities).values({
        key,
        packKey: t.pack.key,
        kind: input.kind,
        slug,
        nameRu: input.nameRu,
        nameEn: input.nameEn || null,
        sourceBook: await authorLabel(ctx),
        data: parsed.data,
        textMd: input.textMd,
        effectsStatus: effectsStatusOf(input.kind, parsed.data),
        status: t.status,
        authorId: ctx.user.id,
      });
      invalidateContentCache();
      return { key, status: t.status };
    }),

  /** Изменить. Гард: владелец личного пакета; в кампании — мастер или автор черновика/отклонённой. */
  update: authedProcedure
    .input(entityInput.omit({ kind: true }).extend({ key: z.string().min(3).max(200) }))
    .mutation(async ({ ctx, input }) => {
      const l = await load(ctx, input.key);
      if (!canView(l, ctx.user.id)) throw notFound();
      if (!canEdit(l, ctx.user.id)) throw forbidden();
      const kind = l.entity.kind as ContentKind;
      const parsed = parseHomebrewData(kind, input.data);
      if (!parsed.success) dataError(parsed.error.issues);
      await ctx.db
        .update(contentEntities)
        .set({
          nameRu: input.nameRu,
          nameEn: input.nameEn || null,
          textMd: input.textMd,
          data: parsed.data,
          effectsStatus: effectsStatusOf(kind, parsed.data),
          // Отклонённая сущность после правки автором снова становится черновиком.
          ...(l.entity.status === 'rejected' && !isGmRole(l.role) ? { status: 'draft' as const, reviewComment: null } : {}),
          updatedAt: new Date(),
        })
        .where(eq(contentEntities.key, input.key));
      invalidateContentCache();
      return { ok: true as const };
    }),

  /**
   * Предложить мастеру (`proposed`). Черновик в пакете кампании — меняется статус; сущность
   * из личного пакета копируется в пакет кампании. Гард: автор, участник кампании.
   */
  submit: authedProcedure
    .input(keySchema.extend({ campaignId: z.uuid().optional() }))
    .mutation(async ({ ctx, input }) => {
      const l = await load(ctx, input.key);
      if (l.entity.authorId !== ctx.user.id && l.pack.ownerUserId !== ctx.user.id) throw notFound();
      if (l.pack.visibility === 'campaign') {
        if (l.entity.status !== 'draft' && l.entity.status !== 'rejected') throw badRequest();
        await ctx.db
          .update(contentEntities)
          .set({ status: 'proposed', reviewComment: null, updatedAt: new Date() })
          .where(eq(contentEntities.key, l.entity.key));
        invalidateContentCache();
        return { key: l.entity.key, status: 'proposed' as const };
      }
      if (!input.campaignId) throw badRequest();
      const t = await target(ctx, input.campaignId);
      const status = t.status === 'approved' ? ('approved' as const) : ('proposed' as const);
      const slug = makeSlug(l.entity.nameRu);
      const key = `${t.pack.key}/${l.entity.kind}/${slug}`;
      await ctx.db.insert(contentEntities).values({
        key,
        packKey: t.pack.key,
        kind: l.entity.kind,
        slug,
        nameRu: l.entity.nameRu,
        nameEn: l.entity.nameEn,
        sourceBook: l.entity.sourceBook,
        data: l.entity.data,
        textMd: l.entity.textMd,
        effectsStatus: l.entity.effectsStatus,
        status,
        authorId: ctx.user.id,
      });
      invalidateContentCache();
      return { key, status };
    }),

  /** Одобрить или отклонить с комментарием. Гард: мастер кампании пакета (`review`). */
  review: authedProcedure
    .input(keySchema.extend({ decision: z.enum(['approve', 'reject']), comment: z.string().trim().max(2000).default('') }))
    .mutation(async ({ ctx, input }) => {
      const l = await load(ctx, input.key);
      if (!canView(l, ctx.user.id)) throw notFound();
      if (l.pack.visibility !== 'campaign' || !canHomebrew('review', l.role)) throw forbidden();
      if (l.entity.status !== 'proposed') throw badRequest();
      await ctx.db
        .update(contentEntities)
        .set({
          status: input.decision === 'approve' ? 'approved' : 'rejected',
          reviewComment: input.comment || null,
          updatedAt: new Date(),
        })
        .where(eq(contentEntities.key, input.key));
      invalidateContentCache();
      return { ok: true as const };
    }),

  /** Удалить: черновик — совсем, используемую сущность — пометкой «удалено». Гард: право правки. */
  delete: authedProcedure.input(keySchema).mutation(async ({ ctx, input }) => {
    const l = await load(ctx, input.key);
    if (!canView(l, ctx.user.id)) throw notFound();
    if (!canEdit(l, ctx.user.id)) throw forbidden();
    if (l.entity.status === 'approved') {
      await ctx.db.update(contentEntities).set({ removedAt: new Date(), updatedAt: new Date() }).where(eq(contentEntities.key, input.key));
    } else {
      await ctx.db.delete(contentEntities).where(eq(contentEntities.key, input.key));
    }
    invalidateContentCache();
    return { ok: true as const };
  }),

  /** «Клонировать в homebrew»: копия любой видимой сущности. Гард: видимость источника + право на цель. */
  clone: authedProcedure
    .input(keySchema.extend({ campaignId: z.uuid().nullable().default(null) }))
    .mutation(async ({ ctx, input }) => {
      const l = await load(ctx, input.key);
      if (!canView(l, ctx.user.id)) throw notFound();
      const t = await target(ctx, input.campaignId);
      const nameRu = `${l.entity.nameRu} (копия)`.slice(0, 120);
      const slug = makeSlug(nameRu);
      const key = `${t.pack.key}/${l.entity.kind}/${slug}`;
      await ctx.db.insert(contentEntities).values({
        key,
        packKey: t.pack.key,
        kind: l.entity.kind,
        slug,
        nameRu,
        nameEn: l.entity.nameEn,
        sourceBook: await authorLabel(ctx),
        data: l.entity.data,
        textMd: l.entity.textMd,
        effectsStatus: l.entity.effectsStatus,
        status: t.status === 'approved' ? 'approved' : 'draft',
        authorId: ctx.user.id,
      });
      invalidateContentCache();
      return { key };
    }),

  /** Число предложений на одобрение (значок в панели мастера). Гард: мастер кампании. */
  pendingCount: authedProcedure.input(z.object({ campaignId: z.uuid() })).query(async ({ ctx, input }) => {
    const role = await getCampaignRole(ctx, input.campaignId);
    if (!role) throw notFound();
    if (!isGmRole(role)) return 0;
    const packs = await ctx.db.select({ key: contentPacks.key }).from(contentPacks).where(eq(contentPacks.campaignId, input.campaignId));
    if (!packs.length) return 0;
    const [row] = await ctx.db
      .select({ n: sql<number>`count(*)::int` })
      .from(contentEntities)
      .where(and(inArray(contentEntities.packKey, packs.map((p) => p.key)), eq(contentEntities.status, 'proposed'), isNull(contentEntities.removedAt)));
    return row?.n ?? 0;
  }),

  /** Эффекты сущности в формате оверлея (§7.6) для коммита в репозиторий. Гард: админ сайта. */
  exportOverlay: adminProcedure.input(keySchema).query(async ({ ctx, input }) => {
    const [e] = await ctx.db.select().from(contentEntities).where(eq(contentEntities.key, input.key));
    if (!e) throw notFound();
    return overlayOf(e);
  }),
});
