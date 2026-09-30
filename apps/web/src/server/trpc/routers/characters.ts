import { and, desc, eq, ilike, isNotNull, isNull, lt, or } from 'drizzle-orm';
import { z } from 'zod';
import {
  characterBuildSchema,
  levelUpDecisionSchema,
  parseCampaignSettings,
  stateCommandSchema,
} from '@ps/content-schema';
import type { SheetSummary } from '@ps/rules-engine';
import { authedProcedure, router } from '../init';
import { campaignMembers, campaigns, characterEvents, characters, users } from '../../db/schema';
import { characterAccessInput, getCampaignRole, requireCampaignRole } from '../../auth/guards';
import {
  canArchiveCharacter,
  canAttachCharacter,
  canDetachCharacter,
  canEditCharacterBuild,
  canEditCharacterState,
  canGrantToCharacter,
  characterViewLevel,
  isGmRole,
  type CharacterAccessInput,
  type SheetVisibility,
} from '../../auth/access';
import { badRequest, forbidden, notFound } from '../errors';
import {
  computeSheet,
  createCharacter,
  engineContextFor,
  levelUp,
  logEvent,
  parseStored,
  refreshCache,
  runCommand,
  undoLevel,
  updateBuild,
  type CharacterRow,
} from '../../services/characters';
import type { Context } from '../context';

type AuthedCtx = Context & { user: NonNullable<Context['user']> };

const idInput = z.object({ characterId: z.uuid() });
const versioned = idInput.extend({ expectedVersion: z.number().int().min(1) });

/** Команды, которые в кампании выдаёт только мастер (SPEC §5.3: «выдать опыт»). */
const GM_ONLY_IN_CAMPAIGN = new Set(['gain_xp', 'set_xp']);

async function loadRow(ctx: AuthedCtx, characterId: string): Promise<CharacterRow> {
  const [row] = await ctx.db.select().from(characters).where(eq(characters.id, characterId));
  if (!row) throw notFound();
  return row;
}

/** Гард: персонаж + права зрителя. Недоступный лист неотличим от несуществующего. */
async function loadWithAccess(ctx: AuthedCtx, characterId: string) {
  const row = await loadRow(ctx, characterId);
  const access = await characterAccessInput(ctx, row);
  const view = characterViewLevel(access);
  if (view === 'none') throw notFound();
  return { row, access, view };
}

function portraitUrl(row: Pick<CharacterRow, 'portraitPath'>): string | null {
  return row.portraitPath ? `/api/files/${row.portraitPath}` : null;
}

function permissions(access: CharacterAccessInput) {
  return {
    isOwner: access.character.ownerId === access.userId,
    canEdit: canEditCharacterBuild(access),
    canEditState: canEditCharacterState(access),
    canGrant: canGrantToCharacter(access),
    canArchive: canArchiveCharacter(access),
    canDetach: canDetachCharacter(access),
  };
}

export const charactersRouter = router({
  /** Мои персонажи. Гард: `requireUser` (только свои). */
  listMine: authedProcedure
    .input(z.object({ archived: z.boolean().default(false) }).optional())
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select({
          id: characters.id,
          name: characters.name,
          campaignId: characters.campaignId,
          campaignName: campaigns.name,
          portraitPath: characters.portraitPath,
          build: characters.build,
          summary: characters.computedCache,
          archivedAt: characters.archivedAt,
          updatedAt: characters.updatedAt,
        })
        .from(characters)
        .leftJoin(campaigns, eq(campaigns.id, characters.campaignId))
        .where(
          and(
            eq(characters.ownerId, ctx.user.id),
            input?.archived ? undefined : isNull(characters.archivedAt),
          ),
        )
        .orderBy(desc(characters.updatedAt));
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        campaignId: r.campaignId,
        campaignName: r.campaignName,
        portraitUrl: portraitUrl(r),
        status: (r.build as { status?: string }).status === 'ready' ? ('ready' as const) : ('draft' as const),
        summary: r.summary as SheetSummary | null,
        archivedAt: r.archivedAt,
        updatedAt: r.updatedAt,
      }));
    }),

  /** Поиск по имени для глобального поиска: свои и видимые в кампаниях. Гард: `characterViewLevel` каждого. */
  search: authedProcedure
    .input(z.object({ q: z.string().trim().min(1).max(120), limit: z.number().int().min(1).max(20).default(8) }))
    .query(async ({ ctx, input }) => {
      const like = `%${input.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      const rows = await ctx.db
        .select({
          id: characters.id,
          name: characters.name,
          ownerId: characters.ownerId,
          campaignId: characters.campaignId,
          campaignName: campaigns.name,
          settings: campaigns.settings,
          role: campaignMembers.role,
        })
        .from(characters)
        .leftJoin(campaigns, eq(campaigns.id, characters.campaignId))
        .leftJoin(campaignMembers, and(eq(campaignMembers.campaignId, characters.campaignId), eq(campaignMembers.userId, ctx.user.id)))
        .where(
          and(
            isNull(characters.archivedAt),
            ilike(characters.name, like),
            or(eq(characters.ownerId, ctx.user.id), isNotNull(campaignMembers.userId)),
          ),
        )
        .orderBy(characters.name)
        .limit(input.limit * 3);
      return rows
        .filter(
          (r) =>
            characterViewLevel({
              userId: ctx.user.id,
              isAdmin: ctx.user.isAdmin,
              character: { ownerId: r.ownerId, campaignId: r.campaignId },
              viewerRole: r.role,
              partySheetVisibility: parseCampaignSettings(r.settings).partySheetVisibility as SheetVisibility,
            }) !== 'none',
        )
        .slice(0, input.limit)
        .map((r) => ({ id: r.id, name: r.name, campaignName: r.campaignName }));
    }),

  /** Персонажи кампании. Гард: участник кампании; видимость — по `partySheetVisibility`. */
  listByCampaign: authedProcedure.input(z.object({ campaignId: z.uuid() })).query(async ({ ctx, input }) => {
    const role = await requireCampaignRole(ctx, input.campaignId);
    const [c] = await ctx.db.select({ settings: campaigns.settings }).from(campaigns).where(eq(campaigns.id, input.campaignId));
    const visibility = parseCampaignSettings(c?.settings).partySheetVisibility as SheetVisibility;
    const rows = await ctx.db
      .select({
        id: characters.id,
        name: characters.name,
        ownerId: characters.ownerId,
        ownerName: users.displayName,
        portraitPath: characters.portraitPath,
        build: characters.build,
        summary: characters.computedCache,
      })
      .from(characters)
      .innerJoin(users, eq(users.id, characters.ownerId))
      .where(and(eq(characters.campaignId, input.campaignId), isNull(characters.archivedAt)))
      .orderBy(characters.name);
    return rows.flatMap((r) => {
      const view = characterViewLevel({
        userId: ctx.user.id,
        isAdmin: ctx.user.isAdmin,
        character: { ownerId: r.ownerId, campaignId: input.campaignId },
        viewerRole: role,
        partySheetVisibility: visibility,
      });
      if (view === 'none') return [];
      return [
        {
          id: r.id,
          name: r.name,
          ownerName: r.ownerName,
          isMine: r.ownerId === ctx.user.id,
          access: view,
          portraitUrl: portraitUrl(r),
          status: (r.build as { status?: string }).status === 'ready' ? ('ready' as const) : ('draft' as const),
          summary: r.summary as SheetSummary | null,
        },
      ];
    });
  }),

  /** Лист персонажа. Гард: `canViewCharacter` — краткая карточка или полностью. */
  get: authedProcedure.input(idInput).query(async ({ ctx, input }) => {
    const { row, access, view } = await loadWithAccess(ctx, input.characterId);
    const [owner] = await ctx.db.select({ displayName: users.displayName }).from(users).where(eq(users.id, row.ownerId));
    const [campaign] = row.campaignId
      ? await ctx.db.select({ id: campaigns.id, name: campaigns.name, settings: campaigns.settings }).from(campaigns).where(eq(campaigns.id, row.campaignId))
      : [];
    const base = {
      id: row.id,
      name: row.name,
      ownerName: owner?.displayName ?? '',
      portraitUrl: portraitUrl(row),
      campaign: campaign ? { id: campaign.id, name: campaign.name, role: access.viewerRole } : null,
      summary: row.computedCache as SheetSummary | null,
      archivedAt: row.archivedAt,
    };
    if (view === 'summary') return { ...base, access: 'summary' as const };
    const { build, state } = parseStored(row);
    const ectx = await engineContextFor(ctx.db, row);
    return {
      ...base,
      access: 'full' as const,
      ...permissions(access),
      version: row.version,
      build,
      state,
      rules: ectx.rules,
      sheet: computeSheet(build, state, ectx),
    };
  }),

  /** Создать черновик. Гард: `requireUser`; для кампании — участник кампании. */
  create: authedProcedure
    .input(z.object({ name: z.string().trim().max(120).default(''), campaignId: z.uuid().nullable().default(null) }))
    .mutation(async ({ ctx, input }) => {
      if (input.campaignId) await requireCampaignRole(ctx, input.campaignId);
      const row = await createCharacter(ctx.db, ctx.user.id, { name: input.name, campaignId: input.campaignId });
      return { id: row.id, version: row.version };
    }),

  /** Сохранить сборку. Гард: `canEditCharacter` + `expectedVersion`. */
  updateBuild: authedProcedure
    .input(versioned.extend({ build: characterBuildSchema }))
    .mutation(async ({ ctx, input }) => {
      const { row, access } = await loadWithAccess(ctx, input.characterId);
      if (!canEditCharacterBuild(access)) throw forbidden();
      const { row: updated } = await updateBuild(ctx.db, ctx.user.id, row, input.build, input.expectedVersion);
      return { version: updated.version, state: parseStored(updated).state, name: updated.name };
    }),

  /** Команда игрового состояния. Гард: изменение state; опыт в кампании — только мастер. */
  command: authedProcedure
    .input(idInput.extend({ command: stateCommandSchema }))
    .mutation(async ({ ctx, input }) => {
      const { row, access } = await loadWithAccess(ctx, input.characterId);
      if (!canEditCharacterState(access)) throw forbidden();
      if (GM_ONLY_IN_CAMPAIGN.has(input.command.type) && row.campaignId && !canGrantToCharacter(access)) {
        throw forbidden('gm_only');
      }
      if (parseStored(row).build.status !== 'ready') throw badRequest('character_not_ready');
      const res = await runCommand(ctx.db, ctx.user.id, row.id, input.command);
      return { version: res.row.version, state: parseStored(res.row).state, events: res.events };
    }),

  /** Повышение уровня. Гард: `canEditCharacter` + `expectedVersion`. */
  levelUp: authedProcedure
    .input(versioned.extend({ decision: levelUpDecisionSchema }))
    .mutation(async ({ ctx, input }) => {
      const { row, access } = await loadWithAccess(ctx, input.characterId);
      if (!canEditCharacterBuild(access)) throw forbidden();
      const { row: updated } = await levelUp(ctx.db, ctx.user.id, row, input.decision, input.expectedVersion);
      return { version: updated.version };
    }),

  /** Отменить последнее повышение. Гард: `canEditCharacter` + `expectedVersion`. */
  undoLevel: authedProcedure.input(versioned).mutation(async ({ ctx, input }) => {
    const { row, access } = await loadWithAccess(ctx, input.characterId);
    if (!canEditCharacterBuild(access)) throw forbidden();
    const { row: updated } = await undoLevel(ctx.db, ctx.user.id, row, input.expectedVersion);
    return { version: updated.version };
  }),

  /** Прикрепить к кампании. Гард: владелец и участник целевой кампании. */
  attach: authedProcedure.input(idInput.extend({ campaignId: z.uuid() })).mutation(async ({ ctx, input }) => {
    const row = await loadRow(ctx, input.characterId);
    const access = await characterAccessInput(ctx, row);
    const targetRole = await getCampaignRole(ctx, input.campaignId);
    if (!canAttachCharacter(access, targetRole)) throw forbidden();
    const [updated] = await ctx.db
      .update(characters)
      .set({ campaignId: input.campaignId, updatedAt: new Date() })
      .where(eq(characters.id, row.id))
      .returning();
    await refreshCache(ctx.db, updated!);
    await logEvent(ctx.db, row.id, ctx.user.id, 'character.attach', { campaignId: input.campaignId });
    return { ok: true as const };
  }),

  /** Отвязать от кампании. Гард: владелец или мастер кампании. */
  detach: authedProcedure.input(idInput).mutation(async ({ ctx, input }) => {
    const { row, access } = await loadWithAccess(ctx, input.characterId);
    if (!canDetachCharacter(access)) throw forbidden();
    const [updated] = await ctx.db
      .update(characters)
      .set({ campaignId: null, updatedAt: new Date() })
      .where(eq(characters.id, row.id))
      .returning();
    await refreshCache(ctx.db, updated!);
    await logEvent(ctx.db, row.id, ctx.user.id, 'character.detach', { campaignId: row.campaignId });
    return { ok: true as const };
  }),

  /** В архив / из архива. Гард: только владелец. */
  archive: authedProcedure.input(idInput.extend({ archived: z.boolean() })).mutation(async ({ ctx, input }) => {
    const { row, access } = await loadWithAccess(ctx, input.characterId);
    if (!canArchiveCharacter(access)) throw forbidden();
    await ctx.db
      .update(characters)
      .set({ archivedAt: input.archived ? new Date() : null, updatedAt: new Date() })
      .where(eq(characters.id, row.id));
    await logEvent(ctx.db, row.id, ctx.user.id, input.archived ? 'character.archive' : 'character.restore', {});
    return { ok: true as const };
  }),

  /** Копия персонажа (вне кампании). Гард: только владелец. */
  duplicate: authedProcedure.input(idInput).mutation(async ({ ctx, input }) => {
    const { row, access } = await loadWithAccess(ctx, input.characterId);
    if (access.character.ownerId !== ctx.user.id) throw forbidden();
    const { build, state } = parseStored(row);
    const name = `${row.name} (копия)`.slice(0, 120);
    const [copy] = await ctx.db
      .insert(characters)
      .values({
        ownerId: ctx.user.id,
        campaignId: null,
        name,
        build: { ...build, identity: { ...build.identity, name } },
        state,
        computedCache: row.computedCache,
        engineVersion: row.engineVersion,
      })
      .returning({ id: characters.id });
    await logEvent(ctx.db, copy!.id, ctx.user.id, 'character.duplicate', { from: row.id });
    return { id: copy!.id };
  }),

  /** Журнал изменений (курсор). Гард: полный доступ к листу. */
  events: authedProcedure
    .input(idInput.extend({ cursor: z.string().nullish(), limit: z.number().int().min(1).max(100).default(30) }))
    .query(async ({ ctx, input }) => {
      const { view } = await loadWithAccess(ctx, input.characterId);
      if (view !== 'full') throw forbidden();
      let cursorCond;
      if (input.cursor) {
        const [iso, id] = input.cursor.split('|');
        const at = new Date(iso ?? '');
        if (!id || Number.isNaN(at.getTime())) throw badRequest();
        cursorCond = or(lt(characterEvents.createdAt, at), and(eq(characterEvents.createdAt, at), lt(characterEvents.id, id)));
      }
      const rows = await ctx.db
        .select({
          id: characterEvents.id,
          kind: characterEvents.kind,
          payload: characterEvents.payload,
          createdAt: characterEvents.createdAt,
          actorName: users.displayName,
          actorId: characterEvents.actorId,
        })
        .from(characterEvents)
        .leftJoin(users, eq(users.id, characterEvents.actorId))
        .where(and(eq(characterEvents.characterId, input.characterId), cursorCond))
        .orderBy(desc(characterEvents.createdAt), desc(characterEvents.id))
        .limit(input.limit + 1);
      const items = rows.slice(0, input.limit);
      const last = items.at(-1);
      return {
        items,
        nextCursor: rows.length > input.limit && last ? `${last.createdAt.toISOString()}|${last.id}` : null,
      };
    }),

  /** Кампании, к которым можно прикрепить персонажа. Гард: `requireUser` (свои участия). */
  attachTargets: authedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({ id: campaigns.id, name: campaigns.name, role: campaignMembers.role })
      .from(campaignMembers)
      .innerJoin(campaigns, eq(campaigns.id, campaignMembers.campaignId))
      .where(and(eq(campaignMembers.userId, ctx.user.id), isNull(campaigns.archivedAt)))
      .orderBy(campaigns.name);
    return rows.map((r) => ({ ...r, isGm: isGmRole(r.role) }));
  }),
});
