import { and, eq, inArray, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import {
  characterBuildSchema,
  characterStateSchema,
  DEFAULT_CAMPAIGN_SETTINGS,
  emptyBuild,
  emptyState,
  parseCampaignSettings,
  type CampaignSettings,
  type CharacterBuild,
  type CharacterState,
  type StateCommand,
} from '@ps/content-schema';
import {
  applyCommand,
  applyLevelUp,
  CommandError,
  levelUpOptions,
  compute,
  ENGINE_VERSION,
  stateAfterBuildChange,
  summarize,
  undoLastLevel,
  validateBuild,
  type ComputedSheet,
  type ContentIndex,
  type EngineEvent,
  type LevelUpDecision,
} from '@ps/rules-engine';
import type { Db } from '../db/client';
import { campaigns, characterEvents, characters } from '../db/schema';
import { serverContentIndex } from '../content/cache';
import { badRequest, conflict, EngineRuleError, notFound } from '../trpc/errors';

export type CharacterRow = typeof characters.$inferSelect;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

function engineError(e: unknown): never {
  if (e instanceof CommandError) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'engine_rule', cause: new EngineRuleError(e.code, e.message) });
  }
  throw e;
}

export async function campaignSettingsOf(db: Db | Tx, campaignId: string | null): Promise<CampaignSettings | null> {
  if (!campaignId) return null;
  const [c] = await db.select({ settings: campaigns.settings }).from(campaigns).where(eq(campaigns.id, campaignId));
  return c ? parseCampaignSettings(c.settings) : null;
}

export type EngineContext = { content: ContentIndex; rules: CampaignSettings };

/**
 * Контент и правила для расчёта персонажа: пакеты кампании (или глобальные) и личный
 * homebrew владельца — одинаково для владельца и мастера.
 */
export async function engineContextFor(db: Db, row: Pick<CharacterRow, 'ownerId' | 'campaignId'>): Promise<EngineContext> {
  const settings = await campaignSettingsOf(db, row.campaignId);
  const content = await serverContentIndex(db, { userId: row.ownerId, campaignId: row.campaignId, settings });
  return { content, rules: settings ?? DEFAULT_CAMPAIGN_SETTINGS };
}

export function parseStored(row: Pick<CharacterRow, 'build' | 'state'>): { build: CharacterBuild; state: CharacterState } {
  return {
    build: characterBuildSchema.parse(row.build),
    state: characterStateSchema.parse(row.state),
  };
}

export function computeSheet(build: CharacterBuild, state: CharacterState, ctx: EngineContext): ComputedSheet {
  return compute(build, state, ctx.content, ctx.rules);
}

async function logEvent(tx: Tx | Db, characterId: string, actorId: string, kind: string, payload: unknown) {
  await tx.insert(characterEvents).values({ characterId, actorId, kind, payload });
}

/** Какие верхнеуровневые части сборки изменились (для журнала). */
function buildDiff(a: CharacterBuild, b: CharacterBuild): string[] {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof CharacterBuild>;
  return [...keys].filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k])).sort();
}

export async function createCharacter(
  db: Db,
  actorId: string,
  input: { name: string; campaignId: string | null },
): Promise<CharacterRow> {
  const settings = await campaignSettingsOf(db, input.campaignId);
  const build = emptyBuild(input.name);
  const rules = settings ?? DEFAULT_CAMPAIGN_SETTINGS;
  if (!rules.abilityMethods.includes(build.abilities.method)) build.abilities.method = rules.abilityMethods[0]!;
  // Стартовые значения, сразу допустимые для выбранного способа.
  if (build.abilities.method === 'standard_array') build.abilities.base = { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 };
  if (build.abilities.method === 'point_buy') build.abilities.base = { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 };
  const [row] = await db
    .insert(characters)
    .values({
      ownerId: actorId,
      campaignId: input.campaignId,
      name: input.name,
      build,
      state: emptyState(),
      engineVersion: ENGINE_VERSION,
    })
    .returning();
  await logEvent(db, row!.id, actorId, 'character.create', { name: input.name, campaignId: input.campaignId });
  return row!;
}

/**
 * Сохранение сборки (SPEC §4.3): проверка `expectedVersion`, пересчёт кэша, журнал.
 * Переход в `ready` требует сборки без ошибок и выставляет полные хиты.
 */
export async function updateBuild(
  db: Db,
  actorId: string,
  row: CharacterRow,
  nextBuild: CharacterBuild,
  expectedVersion: number,
  kind = 'build.update',
  extraPayload: Record<string, unknown> = {},
) {
  const ctx = await engineContextFor(db, row);
  const { build: prevBuild, state: prevState } = parseStored(row);
  if (nextBuild.status === 'ready') {
    const errors = validateBuild(nextBuild, ctx.content, ctx.rules).filter((i) => i.severity === 'error');
    if (errors.length) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'build_invalid',
        cause: new EngineRuleError('build_invalid', errors.map((e) => e.messageRu).join(' ')),
      });
    }
  }
  const state = stateAfterBuildChange(prevBuild, prevState, nextBuild, ctx.content, ctx.rules);
  const sheet = computeSheet(nextBuild, state, ctx);
  const name = nextBuild.identity.name.trim() || row.name;
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(characters)
      .set({
        build: nextBuild,
        state,
        name,
        version: sql`${characters.version} + 1`,
        computedCache: summarize(sheet),
        engineVersion: ENGINE_VERSION,
        updatedAt: new Date(),
      })
      .where(and(eq(characters.id, row.id), eq(characters.version, expectedVersion)))
      .returning();
    if (!updated) throw conflict('version_conflict');
    await logEvent(tx, row.id, actorId, kind, { changed: buildDiff(prevBuild, nextBuild), ...extraPayload });
    return { row: updated, sheet };
  });
}

/**
 * Команда игрового состояния (SPEC §8.10). Строка блокируется (`FOR UPDATE`), команда
 * применяется к актуальному состоянию — одновременные команды игрока и мастера не теряются.
 */
export async function runCommand(
  db: Db,
  actorId: string,
  characterId: string,
  command: StateCommand,
  kind = 'state.command',
): Promise<{ row: CharacterRow; events: EngineEvent[]; sheet: ComputedSheet }> {
  const [res] = await runCommands(db, actorId, [{ characterId, command }], kind);
  return res!;
}

/**
 * Команды для нескольких персонажей в одной транзакции (панель мастера, SPEC §13): строки
 * блокируются `FOR UPDATE` в порядке id, ошибка правил у любого персонажа отменяет всё.
 */
export async function runCommands(
  db: Db,
  actorId: string,
  items: { characterId: string; command: StateCommand }[],
  kind = 'state.command',
): Promise<{ row: CharacterRow; events: EngineEvent[]; sheet: ComputedSheet }[]> {
  const ids = [...new Set(items.map((i) => i.characterId))];
  const metas = await db
    .select({ id: characters.id, ownerId: characters.ownerId, campaignId: characters.campaignId })
    .from(characters)
    .where(inArray(characters.id, ids));
  if (metas.length !== ids.length) throw notFound();
  const contexts = new Map(await Promise.all(metas.map(async (m) => [m.id, await engineContextFor(db, m)] as const)));
  return db.transaction(async (tx) => {
    const sorted = [...ids].sort();
    const locked = await tx.execute<{ id: string }>(
      sql`select id from characters where id in (${sql.join(
        sorted.map((id) => sql`${id}`),
        sql`, `,
      )}) order by id for update`,
    );
    if (locked.length !== ids.length) throw notFound();
    const out: { row: CharacterRow; events: EngineEvent[]; sheet: ComputedSheet }[] = [];
    for (const { characterId, command } of items) {
      const ctx = contexts.get(characterId)!;
      const [row] = await tx.select().from(characters).where(eq(characters.id, characterId));
      const { build, state } = parseStored(row!);
      let result: { state: CharacterState; events: EngineEvent[] };
      try {
        result = applyCommand(build, state, command, ctx.content, ctx.rules);
      } catch (e) {
        engineError(e);
      }
      const sheet = computeSheet(build, result.state, ctx);
      const [updated] = await tx
        .update(characters)
        .set({
          state: result.state,
          version: sql`${characters.version} + 1`,
          computedCache: summarize(sheet),
          engineVersion: ENGINE_VERSION,
          updatedAt: new Date(),
        })
        .where(eq(characters.id, characterId))
        .returning();
      await logEvent(tx, characterId, actorId, kind, { command, events: result.events });
      out.push({ row: updated!, events: result.events, sheet });
    }
    return out;
  });
}

export async function levelUp(db: Db, actorId: string, row: CharacterRow, decision: LevelUpDecision, expectedVersion: number) {
  const ctx = await engineContextFor(db, row);
  const { build, state } = parseStored(row);
  if (build.status !== 'ready') throw badRequest('character_not_ready');
  const opts = levelUpOptions(build, ctx.content, ctx.rules, state);
  if (!opts.canLevelUp) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'engine_rule',
      cause: new EngineRuleError('cannot_level_up', opts.reasonRu ?? ''),
    });
  }
  let next: CharacterBuild;
  try {
    next = applyLevelUp(build, decision, ctx.content, ctx.rules);
  } catch (e) {
    engineError(e);
  }
  return updateBuild(db, actorId, row, next, expectedVersion, 'build.level_up', {
    classKey: decision.classKey,
    level: next.levels.length,
  });
}

export async function undoLevel(db: Db, actorId: string, row: CharacterRow, expectedVersion: number) {
  const ctx = await engineContextFor(db, row);
  const { build } = parseStored(row);
  if (build.levels.length <= 1) throw badRequest('cannot_undo_first_level');
  const next = undoLastLevel(build, ctx.content, ctx.rules);
  return updateBuild(db, actorId, row, next, expectedVersion, 'build.undo_level', { level: next.levels.length });
}

/** Пересчёт `computed_cache` (после загрузки контента или смены кампании). */
export async function refreshCache(db: Db, row: CharacterRow) {
  const ctx = await engineContextFor(db, row);
  const { build, state } = parseStored(row);
  const sheet = computeSheet(build, state, ctx);
  await db
    .update(characters)
    .set({ computedCache: summarize(sheet), engineVersion: ENGINE_VERSION })
    .where(eq(characters.id, row.id));
  return sheet;
}

export { logEvent };
